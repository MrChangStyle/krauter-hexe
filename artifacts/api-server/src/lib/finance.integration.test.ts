/**
 * Finanzen (docs/finanzen.md) against a REAL Postgres: Paket of every
 * account, payments from the test checkout and Stripe's invoice.paid (once
 * only), revenue and estimated AI costs per month, owner only; payments stay
 * when the account goes.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled = !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Finanzen (real database)", () => {
  let server: Server;
  let base = "";
  let as: string | null = "owner";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          if (req.url?.startsWith("/webhooks/stripe")) (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
        },
      }),
    );
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (as) {
        (req as unknown as { user: unknown }).user = { id: as, email: `${as}@x.de`, approved: true, isOwner: as === "owner" };
        (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      } else (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => false;
      next();
    });
    app.use((await import("../routes/billing")).default);
    app.use((await import("../routes/premium")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const k of ["TEST_PHASE_END", "BILLING_PROVIDER", "STRIPE_WEBHOOK_SECRET", "AI_COST_PER_REQUEST_CENT"]) delete process.env[k];
    await q("TRUNCATE premium, payments");
    server?.close();
  });

  beforeEach(async () => {
    process.env["TEST_PHASE_END"] = "2020-01-01";
    process.env["BILLING_PROVIDER"] = "mock";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    process.env["AI_COST_PER_REQUEST_CENT"] = "0.5";
    await q("TRUNCATE users, premium, payments RESTART IDENTITY CASCADE");
    await q("DELETE FROM usage_daily WHERE metric = 'ai_actions'");
    await q(`INSERT INTO users (id, email, username, approved, is_owner, user_code) VALUES
      ('owner', 'o@x.de', 'chef', true, true, 1000), ('anna', 'anna@x.de', 'anna', true, false, 2000),
      ('bert', 'bert@x.de', 'bert', true, false, 3000), ('cleo', 'cleo@x.de', 'cleo', true, false, 4000)`);
    as = "owner";
  });

  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };

  it("shows every account's Paket, revenue, AI costs and the result per month", async () => {
    // Anna pays Lite monthly at the test checkout, Bert gets Premium by hand, Cleo has Basis.
    as = "anna";
    await api("POST", "/billing/mock/complete", { tier: "lite", interval: "monthly" });
    await q(`INSERT INTO premium (user_id, source, tier) VALUES ('bert', 'manual', 'premium')`);
    // Stripe: an invoice of Cleo's yearly Premium – sent twice, counted once.
    as = null;
    const invoice = { id: "in_1", amount_paid: 5990, currency: "eur", customer: "cus_c", subscription: "sub_c", status_transitions: { paid_at: Math.floor(Date.now() / 1000) }, subscription_details: { metadata: { userId: "cleo", tier: "premium", interval: "yearly" } } };
    for (let i = 0; i < 2; i++) {
      const body = JSON.stringify({ id: `evt_${i}`, type: "invoice.paid", data: { object: invoice } });
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
      expect((await api("POST", "/webhooks/stripe", body, { "Stripe-Signature": `t=${t},v1=${sig}` })).status).toBe(200);
    }
    // 200 AI requests this month.
    await q(`INSERT INTO usage_daily (day, metric, value) VALUES (to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')::date, 'ai_actions', 200)`);

    as = "anna";
    expect((await api("GET", "/admin/finance")).status).toBe(403);
    as = "owner";
    const f = (await api("GET", "/admin/finance")).data;
    expect(f.counts).toEqual({ owner: 1, premium: 0, lite: 1, manual: 1, tester: 0, test: 0, basis: 1 });
    expect(f.mrrCents).toBe(299);
    expect(f.aiCostPerRequestCent).toBe(0.5);
    expect(f.months).toHaveLength(12);
    expect(f.months[0]).toMatchObject({ revenueCents: 299 + 5990, payments: 2, aiRequests: 200, aiCostCents: 100, resultCents: 299 + 5990 - 100 });
    const anna = f.accounts.find((a: any) => a.id === "anna");
    expect(anna).toMatchObject({ paket: "lite", plan: "monthly", userCode: 2000, monthlyCents: 299, cancelAtPeriodEnd: false });
    expect(f.accounts.find((a: any) => a.id === "cleo")).toMatchObject({ paket: "basis" });
    expect(f.payments.map((p: any) => [p.email, p.amountCents])).toEqual(expect.arrayContaining([["anna@x.de", 299], ["cleo@x.de", 5990]]));

    // A cancelled subscription no longer counts as recurring.
    as = "anna";
    await api("POST", "/billing/cancel");
    as = "owner";
    expect((await api("GET", "/admin/finance")).data.mrrCents).toBe(0);

    // The account goes, its payment stays for the bookkeeping – without the account.
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");
    const rows = await q<{ account_id: string | null; amount_cents: number }>("SELECT account_id, amount_cents FROM payments ORDER BY id");
    expect(rows).toEqual([{ account_id: null, amount_cents: 299 }, { account_id: "cleo", amount_cents: 5990 }]);
  });
});
