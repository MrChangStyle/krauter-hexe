/**
 * Bezahlung against a REAL Postgres, through the HTTP routes: the test
 * checkout (order, Paket, cancel), Stripe's signed webhook (running,
 * cancelled, ended, forged), the daily AI limit per Paket and the owner's hand
 * grant not overwriting a paid subscription.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Bezahlung (real database)", () => {
  let server: Server;
  let base = "";
  let as: string | null = "anna";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    // As in app.ts: the raw body for Stripe's signature.
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
    for (const k of ["TEST_PHASE_END", "BILLING_PROVIDER", "STRIPE_WEBHOOK_SECRET"]) delete process.env[k];
    // Leave no Paket behind: it would change other files' AI limits (docs/bezahlung.md).
    await q("TRUNCATE premium");
    server?.close();
  });

  beforeEach(async () => {
    // After the Testphase; nobody is a tester (created after it).
    process.env["TEST_PHASE_END"] = "2020-01-01";
    process.env["BILLING_PROVIDER"] = "mock";
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    await q("TRUNCATE users, premium RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, username, approved, is_owner) VALUES ('owner', 'o@x.de', 'chef', true, true), ('anna', 'anna@x.de', 'anna', true, false), ('bert', 'bert@x.de', 'bert', true, false)`);
    as = "anna";
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

  const limit = async (user: string) => (await import("./premium")).userDailyLimit(user);

  it("orders, uses and cancels a Paket at the test checkout", async () => {
    let r = await api("GET", "/billing");
    expect(r.data).toMatchObject({ enabled: true, provider: "mock", premium: { active: false, tier: null } });
    expect(await limit("anna")).toBe(3);

    r = await api("POST", "/billing/checkout", { tier: "lite", interval: "monthly" });
    expect(r.data.url).toMatch(/\/abo\/testkasse\?paket=lite&zeitraum=monthly$/);
    expect((await api("POST", "/billing/checkout", { tier: "gold", interval: "monthly" })).status).toBe(400);

    r = await api("POST", "/billing/mock/complete", { tier: "lite", interval: "monthly" });
    expect(r.data).toMatchObject({ active: true, source: "mock", tier: "lite", plan: "monthly", subscribed: true, cancelAtPeriodEnd: false });
    expect(await limit("anna")).toBe(15);
    // A second order while one runs: no.
    expect((await api("POST", "/billing/checkout", { tier: "premium", interval: "yearly" })).status).toBe(409);

    r = await api("POST", "/billing/cancel");
    expect(r.data).toMatchObject({ active: true, cancelAtPeriodEnd: true });
    // Still Lite until the end of the paid month.
    expect(await limit("anna")).toBe(15);
    expect((await api("POST", "/billing/portal")).data.url).toMatch(/\/abo$/);

    // Bert has nothing to cancel; the owner orders nothing.
    as = "bert";
    expect((await api("POST", "/billing/cancel")).status).toBe(404);
    expect((await api("POST", "/billing/portal")).status).toBe(404);
    as = "owner";
    expect((await api("POST", "/billing/checkout", { tier: "lite", interval: "monthly" })).status).toBe(409);
  });

  it("is off without a provider", async () => {
    delete process.env["BILLING_PROVIDER"];
    expect((await api("GET", "/billing")).data).toMatchObject({ enabled: false, provider: null });
    expect((await api("POST", "/billing/checkout", { tier: "lite", interval: "monthly" })).status).toBe(503);
    expect((await api("POST", "/billing/mock/complete", { tier: "lite", interval: "monthly" })).status).toBe(404);
  });

  it("keeps the subscription in step with Stripe's signed events", async () => {
    as = null;
    const send = (type: string, object: unknown, secret = "whsec_test") => {
      const body = JSON.stringify({ id: "evt_1", type, data: { object } });
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
      return api("POST", "/webhooks/stripe", body, { "Stripe-Signature": `t=${t},v1=${sig}` });
    };
    const end = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const sub = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, current_period_end: end, metadata: { userId: "anna", tier: "premium", interval: "monthly" } };

    expect((await send("customer.subscription.created", sub, "whsec_wrong")).status).toBe(401);
    expect((await api("POST", "/webhooks/stripe", JSON.stringify({ type: "x" }))).status).toBe(401);
    expect(await q("SELECT * FROM premium")).toEqual([]);

    expect((await send("customer.subscription.created", sub)).status).toBe(200);
    let [row] = await q<any>("SELECT source, tier, plan, customer_id, subscription_id, cancel_at_period_end FROM premium WHERE user_id = 'anna'");
    expect(row).toEqual({ source: "stripe", tier: "premium", plan: "monthly", customer_id: "cus_1", subscription_id: "sub_1", cancel_at_period_end: false });
    expect(await limit("anna")).toBe(40);

    // Other events and unknown accounts are acknowledged and change nothing.
    expect((await send("invoice.paid", {})).status).toBe(200);
    expect((await send("customer.subscription.updated", { ...sub, metadata: { ...sub.metadata, userId: "nobody" } })).status).toBe(200);

    // The owner cannot overwrite a paid subscription by hand.
    as = "owner";
    expect((await api("PUT", "/admin/premium", { email: "anna@x.de", active: false })).status).toBe(409);
    as = null;

    await send("customer.subscription.updated", { ...sub, cancel_at_period_end: true });
    [row] = await q<any>("SELECT cancel_at_period_end FROM premium WHERE user_id = 'anna'");
    expect(row.cancel_at_period_end).toBe(true);

    await send("customer.subscription.deleted", { ...sub, status: "canceled" });
    expect(await limit("anna")).toBe(3);
    as = "anna";
    expect((await api("GET", "/billing")).data.premium).toMatchObject({ active: false, tier: null });
  });

  it("ends a paid subscription before the account goes, and keeps the account if that fails", async () => {
    const { deleteAccount } = await import("./accountDeletion");
    // Stripe refuses this key (or is not reachable): the account must stay.
    process.env["STRIPE_SECRET_KEY"] = "sk_test_not_a_real_key";
    await q(`INSERT INTO premium (user_id, source, tier, plan, active_until, customer_id, subscription_id) VALUES ('anna', 'stripe', 'lite', 'monthly', now() + interval '20 days', 'cus_1', 'sub_1')`);
    await expect(deleteAccount("anna")).rejects.toThrow(/Abo ließ sich gerade nicht beenden/);
    expect(await q("SELECT id FROM users WHERE id = 'anna'")).toHaveLength(1);
    // The test checkout and an ended subscription need no call.
    await q(`INSERT INTO premium (user_id, source, tier, plan, active_until, subscription_id) VALUES ('bert', 'mock', 'lite', 'monthly', now() + interval '20 days', 'mock_sub')`);
    expect(await deleteAccount("bert")).toBe(true);
    await q("UPDATE premium SET active_until = now() - interval '1 day' WHERE user_id = 'anna'");
    expect(await deleteAccount("anna")).toBe(true);
    delete process.env["STRIPE_SECRET_KEY"];
  });

  it("switches the Paket up and down at the test checkout, and back to Basis by cancelling", async () => {
    expect((await api("POST", "/billing/change", { tier: "premium", interval: "monthly" })).status).toBe(404);
    await api("POST", "/billing/mock/complete", { tier: "lite", interval: "monthly" });
    const [{ active_until: firstEnd }] = await q<any>("SELECT active_until FROM premium WHERE user_id = 'anna'");

    // Upgrade: Premium at once, same period.
    let r = await api("POST", "/billing/change", { tier: "premium", interval: "monthly" });
    expect(r.data).toMatchObject({ active: true, tier: "premium", plan: "monthly", subscribed: true });
    expect(await limit("anna")).toBe(40);
    expect((await q<any>("SELECT active_until FROM premium WHERE user_id = 'anna'"))[0].active_until).toEqual(firstEnd);
    expect((await api("POST", "/billing/change", { tier: "premium", interval: "monthly" })).status).toBe(409);
    expect((await api("POST", "/billing/change", { tier: "gold", interval: "monthly" })).status).toBe(400);

    // Downgrade, now yearly: Lite at once, a new year starts.
    r = await api("POST", "/billing/change", { tier: "lite", interval: "yearly" });
    expect(r.data).toMatchObject({ tier: "lite", plan: "yearly" });
    expect(await limit("anna")).toBe(15);
    expect(new Date(r.data.until).getTime() - Date.now()).toBeGreaterThan(360 * 86_400_000);

    // Cancelled, then changed: the cancellation is lifted.
    await api("POST", "/billing/cancel");
    r = await api("POST", "/billing/change", { tier: "premium", interval: "yearly" });
    expect(r.data).toMatchObject({ tier: "premium", cancelAtPeriodEnd: false });
  });

  it("switches a Stripe subscription's price with proration", async () => {
    process.env["BILLING_PROVIDER"] = "stripe";
    process.env["STRIPE_SECRET_KEY"] = "sk_test_x";
    for (const k of ["LITE_MONTHLY", "LITE_YEARLY", "PREMIUM_MONTHLY", "PREMIUM_YEARLY"]) process.env[`STRIPE_PRICE_${k}`] = `price_${k.toLowerCase()}`;
    await q(`INSERT INTO premium (user_id, source, tier, plan, active_until, customer_id, subscription_id) VALUES ('anna', 'stripe', 'premium', 'monthly', now() + interval '20 days', 'cus_1', 'sub_1')`);
    const calls: Array<{ method: string; url: string; body: string }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const u = String(url);
      if (!u.startsWith("https://api.stripe.com/")) return realFetch(url, init);
      calls.push({ method: init?.method ?? "GET", url: u, body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ id: "sub_1", items: { data: [{ id: "si_1" }] } }), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await api("POST", "/billing/change", { tier: "lite", interval: "monthly" });
      expect(r.data).toMatchObject({ tier: "lite", plan: "monthly" });
      expect(calls.map((c) => `${c.method} ${c.url.replace("https://api.stripe.com/v1", "")}`)).toEqual(["GET /subscriptions/sub_1", "POST /subscriptions/sub_1"]);
      const body = decodeURIComponent(calls[1]!.body);
      expect(body).toContain("items[0][id]=si_1");
      expect(body).toContain("items[0][price]=price_lite_monthly");
      expect(body).toContain("proration_behavior=create_prorations");
      expect(body).toContain("metadata[tier]=lite");
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ["STRIPE_SECRET_KEY", "STRIPE_PRICE_LITE_MONTHLY", "STRIPE_PRICE_LITE_YEARLY", "STRIPE_PRICE_PREMIUM_MONTHLY", "STRIPE_PRICE_PREMIUM_YEARLY"]) delete process.env[k];
    }
  });
});
