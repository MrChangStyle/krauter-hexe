/**
 * Tests for deleteAccount: every table with a user id is cleaned up, shared
 * archive entries are only unlinked, and the owner can never be deleted.
 *
 * The completeness test reads the real schema: any column named user_id or
 * scanned_by_user_id in @workspace/db must be handled by deleteAccount. A new
 * table with a user id that is not added there makes this test fail.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    user: null as null | { id: string; isOwner: boolean },
    deletedFrom: [] as string[],
    unlinked: [] as string[],
  },
}));

vi.mock("@workspace/db", async () => {
  const { getTableName } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  const schema = await vi.importActual<Record<string, unknown>>("@workspace/db/schema");
  const tx = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(state.user ? [state.user] : []) }),
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: () => {
        state.deletedFrom.push(getTableName(table));
        return Promise.resolve();
      },
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          expect(values).toEqual({ scannedByUserId: null });
          state.unlinked.push(getTableName(table));
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    ...schema,
    db: { transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) },
  };
});

import * as schema from "@workspace/db/schema";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { OwnerAccountDeletionError, deleteAccount } from "./accountDeletion";

beforeEach(() => {
  state.user = { id: "user-1", isOwner: false };
  state.deletedFrom = [];
  state.unlinked = [];
});

/** Tables of the real schema that carry a column with the given name. */
function tablesWithColumn(columnName: string): string[] {
  return (Object.values(schema) as unknown[])
    .filter((value): value is Table => is(value, Table))
    .filter((table) =>
      Object.values(getTableColumns(table)).some((column) => column.name === columnName),
    )
    .map((table) => getTableName(table))
    .sort();
}

describe("deleteAccount", () => {
  it("deletes the personal rows of every table that has a user_id", async () => {
    expect(await deleteAccount("user-1")).toBe(true);

    // A table may be touched twice (reports: filed by and filed about).
    const personal = [...new Set(state.deletedFrom.filter((name) => name !== "users"))].sort();
    expect(personal).toEqual(tablesWithColumn("user_id"));
  });

  it("only unlinks shared archive entries instead of deleting them", async () => {
    await deleteAccount("user-1");

    expect(state.unlinked.sort()).toEqual(tablesWithColumn("scanned_by_user_id"));
    expect(state.deletedFrom).not.toContain("plants");
    expect(state.deletedFrom).not.toContain("insects");
  });

  it("deletes the users row last", async () => {
    await deleteAccount("user-1");
    expect(state.deletedFrom.at(-1)).toBe("users");
  });

  it("refuses to delete the owner and touches nothing", async () => {
    state.user = { id: "owner", isOwner: true };
    await expect(deleteAccount("owner")).rejects.toBeInstanceOf(OwnerAccountDeletionError);
    expect(state.deletedFrom).toHaveLength(0);
    expect(state.unlinked).toHaveLength(0);
  });

  it("reports an unknown account without touching anything", async () => {
    state.user = null;
    expect(await deleteAccount("nobody")).toBe(false);
    expect(state.deletedFrom).toHaveLength(0);
  });
});
