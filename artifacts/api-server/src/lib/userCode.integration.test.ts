/**
 * Nutzer-ID (docs/konto.md) against a REAL Postgres: every account gets one,
 * unique, four digits; GET /auth/user hands it to a new account.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Nutzer-ID (real database)", () => {
  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeEach(async () => {
    await q("TRUNCATE users RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await q("TRUNCATE users RESTART IDENTITY CASCADE");
  });

  it("gives every account its own four-digit number and keeps it", async () => {
    const values = Array.from({ length: 40 }, (_, i) => `('u${i}', 'u${i}@x.de', true)`).join(", ");
    await q(`INSERT INTO users (id, email, approved) VALUES ${values}`);
    await q(`UPDATE users SET user_code = 4821 WHERE id = 'u0'`);
    const { assignMissingUserCodes, assignUserCode, accountByCode } = await import("./userCode");
    expect(await assignMissingUserCodes()).toBe(39);
    const rows = await q<{ id: string; user_code: number }>("SELECT id, user_code FROM users");
    expect(rows.every((r) => r.user_code >= 1000 && r.user_code <= 9999)).toBe(true);
    expect(new Set(rows.map((r) => r.user_code)).size).toBe(40);
    // Already there: stays.
    expect(await assignUserCode("u0")).toBe(4821);
    expect(await accountByCode("4821")).toEqual({ id: "u0" });
    // Not approved or blocked: not found.
    await q(`UPDATE users SET approved = false WHERE id = 'u0'`);
    expect(await accountByCode(4821)).toBeNull();
    expect(await accountByCode("12")).toBeNull();
  });
});
