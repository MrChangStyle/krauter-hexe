/**
 * Unit tests for the daily scan rate limit (scanRateLimit.ts).
 *
 * Covers the three properties that are easy to break and expensive to get wrong:
 *   1. The owner/admin exemption bypasses the cap without writing any row.
 *   2. A normal user is counted and blocked at the cap.
 *   3. A refund targets exactly one row by primary key (never "newest today"),
 *      which is what keeps concurrent scans from refunding each other.
 *
 * `@workspace/db` is mocked so the tests run without a database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @workspace/db
// ---------------------------------------------------------------------------

const { state } = vi.hoisted(() => ({
  state: {
    /** Attempts already recorded "today" for the user under test. */
    existingCount: 0,
    /** Rows inserted during the test. */
    inserted: [] as Array<{ userId: string; scanType: string }>,
    /** Ids passed to a DELETE ... WHERE id = ?. */
    deletedIds: [] as number[],
    /** How often a transaction (i.e. the counting path) was opened. */
    transactionCalls: 0,
    /** Set when the eq() helper is used, capturing column + value. */
    lastEq: null as { column: string; value: unknown } | null,
    nextInsertId: 4242,
  },
}));

vi.mock("@workspace/db", () => {
  const col = (name: string) => ({ __name: name });
  const scanAttemptsTable = {
    id: col("id"),
    userId: col("user_id"),
    scanType: col("scan_type"),
    attemptedAt: col("attempted_at"),
  };

  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ count: state.existingCount }]),
      }),
    }),
    insert: () => ({
      values: (v: { userId: string; scanType: string }) => {
        state.inserted.push(v);
        return {
          returning: () => Promise.resolve([{ id: state.nextInsertId }]),
        };
      },
    }),
  };

  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      state.transactionCalls += 1;
      return fn(tx);
    },
    delete: () => ({
      where: (condition: { column: string; value: unknown }) => {
        if (condition?.column === "id") state.deletedIds.push(condition.value as number);
        return Promise.resolve(undefined);
      },
    }),
  };

  return { db, scanAttemptsTable };
});

vi.mock("drizzle-orm", () => ({
  // eq() is the only helper whose captured value the assertions care about.
  eq: (column: { __name: string }, value: unknown) => {
    const c = { column: column.__name, value };
    state.lastEq = c;
    return c;
  },
  and: (...args: unknown[]) => ({ and: args }),
  gte: (column: unknown, value: unknown) => ({ gte: [column, value] }),
  sql: Object.assign(
    (...args: unknown[]) => ({ sql: args }),
    { raw: (s: string) => ({ raw: s }) },
  ),
}));

import { checkAndRecordScanAttempt, refundScanAttempt } from "./scanRateLimit";

const DAILY_SCAN_LIMIT = 15;

beforeEach(() => {
  state.existingCount = 0;
  state.inserted = [];
  state.deletedIds = [];
  state.transactionCalls = 0;
  state.lastEq = null;
  state.nextInsertId = 4242;
});

// ---------------------------------------------------------------------------
// Owner / admin exemption
// ---------------------------------------------------------------------------

describe("checkAndRecordScanAttempt - unlimited (owner) accounts", () => {
  it("allows the scan even when the cap is long exceeded", async () => {
    state.existingCount = 9_999;

    const res = await checkAndRecordScanAttempt("owner-id", "plant", {
      unlimited: true,
    });

    expect(res.allowed).toBe(true);
  });

  it("does not record an attempt row at all", async () => {
    await checkAndRecordScanAttempt("owner-id", "plant", { unlimited: true });

    // No transaction means no counting query and no insert - the daily counter
    // only exists to enforce a limit that does not apply here.
    expect(state.transactionCalls).toBe(0);
    expect(state.inserted).toHaveLength(0);
  });

  it("returns a null attemptId, making a later refund a no-op", async () => {
    const res = await checkAndRecordScanAttempt("owner-id", "insect", {
      unlimited: true,
    });

    expect(res.attemptId).toBeNull();

    await refundScanAttempt(res.attemptId);
    expect(state.deletedIds).toHaveLength(0);
  });

  it("still reports a reset timestamp so callers need no special casing", async () => {
    const res = await checkAndRecordScanAttempt("owner-id", "plant", {
      unlimited: true,
    });

    expect(Number.isNaN(new Date(res.resetsAt).getTime())).toBe(false);
  });

  it("counts normally when the flag is absent or false", async () => {
    await checkAndRecordScanAttempt("normal-id", "plant");
    await checkAndRecordScanAttempt("normal-id", "plant", { unlimited: false });

    expect(state.transactionCalls).toBe(2);
    expect(state.inserted).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Normal (capped) accounts
// ---------------------------------------------------------------------------

describe("checkAndRecordScanAttempt - capped accounts", () => {
  it("allows and records an attempt below the cap", async () => {
    state.existingCount = DAILY_SCAN_LIMIT - 1;

    const res = await checkAndRecordScanAttempt("user-1", "plant");

    expect(res.allowed).toBe(true);
    expect(res.attemptId).toBe(4242);
    expect(state.inserted).toEqual([{ userId: "user-1", scanType: "plant" }]);
  });

  it("blocks at the cap without recording another attempt", async () => {
    state.existingCount = DAILY_SCAN_LIMIT;

    const res = await checkAndRecordScanAttempt("user-1", "plant");

    expect(res.allowed).toBe(false);
    expect(res.attemptId).toBeNull();
    expect(state.inserted).toHaveLength(0);
  });

  it("tracks plants and insects independently", async () => {
    await checkAndRecordScanAttempt("user-1", "plant");
    await checkAndRecordScanAttempt("user-1", "insect");

    expect(state.inserted.map((i) => i.scanType)).toEqual(["plant", "insect"]);
  });
});

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

describe("refundScanAttempt", () => {
  it("deletes exactly the row it was given, by primary key", async () => {
    await refundScanAttempt(777);

    // Targeting the id (rather than "newest attempt today") is what prevents a
    // failing request from cancelling out a concurrent successful one.
    expect(state.lastEq).toEqual({ column: "id", value: 777 });
    expect(state.deletedIds).toEqual([777]);
  });

  it("does nothing when there is no attempt to refund", async () => {
    await refundScanAttempt(null);
    expect(state.deletedIds).toHaveLength(0);
  });

  it("refunds the id returned by the matching check call", async () => {
    state.nextInsertId = 99;
    const res = await checkAndRecordScanAttempt("user-1", "plant");

    await refundScanAttempt(res.attemptId);

    expect(state.deletedIds).toEqual([99]);
  });
});
