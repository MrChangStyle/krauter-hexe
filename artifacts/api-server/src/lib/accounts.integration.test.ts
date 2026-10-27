/**
 * Testphase against a REAL Postgres: the first FREE_TESTER_SLOTS accounts
 * besides the owner start without approval – accounts that already exist
 * count too, a blocked account is never let in.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (a throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushes } = vi.hoisted(() => ({ pushes: [] as Array<{ to: string; body: string; url: string }> }));
vi.mock("./webPush", () => ({
  sendPushToUser: (to: string, p: { body: string; url: string }) => {
    pushes.push({ to, body: p.body, url: p.url });
    return Promise.resolve(1);
  },
}));

import { approveIfFreeTesterSlot, freeTesterSlots, notifyOwnerOfNewAccount } from "./accounts";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe("freeTesterSlots", () => {
  afterEach(() => {
    delete process.env["FREE_TESTER_SLOTS"];
  });

  it("is 20 unless set, 0 switches it off, nonsense falls back", () => {
    expect(freeTesterSlots()).toBe(20);
    process.env["FREE_TESTER_SLOTS"] = "0";
    expect(freeTesterSlots()).toBe(0);
    process.env["FREE_TESTER_SLOTS"] = "35";
    expect(freeTesterSlots()).toBe(35);
    process.env["FREE_TESTER_SLOTS"] = "viele";
    expect(freeTesterSlots()).toBe(20);
  });
});

describe.skipIf(!enabled)("Testphase: die ersten Tester ohne Freigabe (real database)", () => {
  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }
  const approved = async (id: string) => (await q<{ approved: boolean }>("SELECT approved FROM users WHERE id = $1", [id]))[0]!.approved;

  beforeEach(async () => {
    process.env["FREE_TESTER_SLOTS"] = "3";
    await q("TRUNCATE users RESTART IDENTITY CASCADE");
    // The owner and two testers from before – one let in by hand, one still waiting.
    await q(`INSERT INTO users (id, email, approved, is_owner, created_at) VALUES
      ('chef', 'chef@example.org', true, true, now() - interval '3 days'),
      ('alt1', 'alt1@example.org', true, false, now() - interval '2 days'),
      ('alt2', 'alt2@example.org', false, false, now() - interval '1 day')`);
  });

  afterEach(() => {
    delete process.env["FREE_TESTER_SLOTS"];
  });

  it("lets a new account in while there is a place – the existing ones count, the owner not", async () => {
    await q("INSERT INTO users (id, email, approved) VALUES ('neu3', 'neu3@example.org', false)");
    expect((await approveIfFreeTesterSlot("neu3"))?.approved).toBe(true);
    // Place 4 of 3: waits for the owner.
    await q("INSERT INTO users (id, email, approved) VALUES ('neu4', 'neu4@example.org', false)");
    expect(await approveIfFreeTesterSlot("neu4")).toBeNull();
    expect(await approved("neu4")).toBe(false);
  });

  it("never lets a blocked account in, and does nothing when switched off", async () => {
    await q("INSERT INTO users (id, email, approved, blocked_at) VALUES ('neu3', 'neu3@example.org', false, now())");
    expect(await approveIfFreeTesterSlot("neu3")).toBeNull();
    await q("DELETE FROM users WHERE id = 'neu3'");
    process.env["FREE_TESTER_SLOTS"] = "0";
    await q("INSERT INTO users (id, email, approved) VALUES ('neu5', 'neu5@example.org', false)");
    expect(await approveIfFreeTesterSlot("neu5")).toBeNull();
    expect(await approved("neu5")).toBe(false);
  });

  it("gives the last place to only one of two sign-ups at the same moment", async () => {
    await q(`INSERT INTO users (id, email, approved, created_at) VALUES
      ('b', 'b@example.org', false, '2030-01-01T00:00:00Z'), ('a', 'a@example.org', false, '2030-01-01T00:00:00Z')`);
    const [ra, rb] = await Promise.all([approveIfFreeTesterSlot("a"), approveIfFreeTesterSlot("b")]);
    expect([ra?.approved ?? false, rb?.approved ?? false].filter(Boolean)).toHaveLength(1);
    expect(await approved("a")).toBe(true);
  });

  it("tells the owner who signed up and whether the account starts at once", async () => {
    pushes.length = 0;
    await notifyOwnerOfNewAccount({ id: "neu3", email: "neu3@example.org", firstName: "Lena", approved: true });
    await notifyOwnerOfNewAccount({ id: "neu4", email: "neu4@example.org", firstName: null, approved: false });
    expect(pushes).toEqual([
      { to: "chef", body: "Lena hat sich angemeldet und kann sofort loslegen.", url: "/verwaltung#benutzer" },
      { to: "chef", body: "neu4@example.org hat sich angemeldet und wartet auf deine Freischaltung.", url: "/verwaltung#benutzer" },
    ]);
  });
});
