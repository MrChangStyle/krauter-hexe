import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// Pure rules only – the database is never reached.
vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { GRACE_DAYS, billingProvider, periodEnd, stripeForm, subscriptionUpdate, verifyStripeSignature } = await import("./billing");
const { AI_DAILY_LIMITS, aiDailyLimit } = await import("./premium");

const STRIPE_ENV = {
  BILLING_PROVIDER: "stripe",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_LITE_MONTHLY: "price_1",
  STRIPE_PRICE_LITE_YEARLY: "price_2",
  STRIPE_PRICE_PREMIUM_MONTHLY: "price_3",
  STRIPE_PRICE_PREMIUM_YEARLY: "price_4",
};

describe("Bezahlung", () => {
  it("is only on when fully set up, and the test checkout never in production", () => {
    expect(billingProvider({})).toBeNull();
    expect(billingProvider(STRIPE_ENV)).toBe("stripe");
    expect(billingProvider({ ...STRIPE_ENV, STRIPE_PRICE_PREMIUM_YEARLY: "" })).toBeNull();
    expect(billingProvider({ BILLING_PROVIDER: "mock", NODE_ENV: "test" })).toBe("mock");
    expect(billingProvider({ BILLING_PROVIDER: "mock", NODE_ENV: "production" })).toBeNull();
  });

  it("gives each Paket its daily AI limit; the Testphase keeps the 15", () => {
    expect(aiDailyLimit({ active: false, source: null, tier: null })).toBe(AI_DAILY_LIMITS.basis);
    expect(aiDailyLimit({ active: true, source: "stripe", tier: "lite" })).toBe(15);
    expect(aiDailyLimit({ active: true, source: "stripe", tier: "premium" })).toBe(40);
    expect(aiDailyLimit({ active: true, source: "manual", tier: "premium" })).toBe(40);
    expect(aiDailyLimit({ active: true, source: "test", tier: "premium" })).toBe(15);
    expect(aiDailyLimit({ active: true, source: "tester", tier: "premium" })).toBe(15);
    expect(AI_DAILY_LIMITS.basis).toBe(3);
  });

  it("encodes Stripe's form parameters with brackets", () => {
    expect(stripeForm({ mode: "subscription", line_items: [{ price: "p 1", quantity: 1 }], subscription_data: { metadata: { tier: "lite" } }, customer: undefined })).toEqual([
      "mode=subscription",
      "line_items%5B0%5D%5Bprice%5D=p%201",
      "line_items%5B0%5D%5Bquantity%5D=1",
      "subscription_data%5Bmetadata%5D%5Btier%5D=lite",
    ]);
  });

  it("accepts only a fresh, correct Stripe signature", () => {
    const body = '{"type":"customer.subscription.updated"}';
    const t = 1_800_000_000;
    const sig = createHmac("sha256", "whsec_x").update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_x", t + 10)).toBe(true);
    expect(verifyStripeSignature(Buffer.from(body), `t=${t},v0=abc,v1=${sig}`, "whsec_x", t)).toBe(true);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_y", t)).toBe(false);
    expect(verifyStripeSignature(`${body} `, `t=${t},v1=${sig}`, "whsec_x", t)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_x", t + 301)).toBe(false);
    expect(verifyStripeSignature(body, undefined, "whsec_x", t)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=zz`, "whsec_x", t)).toBe(false);
  });

  it("turns a subscription into the premium row: running with grace, cancelled, over", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    const end = Math.floor(new Date("2026-12-01T10:00:00Z").getTime() / 1000);
    const sub = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { userId: "anna", tier: "lite", interval: "monthly" } };
    // The period's end sits on the item in newer API versions.
    const running = subscriptionUpdate({ ...sub, items: { data: [{ current_period_end: end }] } }, now)!;
    expect(running).toMatchObject({ userId: "anna", values: { source: "stripe", tier: "lite", plan: "monthly", customerId: "cus_1", subscriptionId: "sub_1", cancelAtPeriodEnd: false } });
    expect(running.values.activeUntil.getTime()).toBe((end + GRACE_DAYS * 86_400) * 1000);
    expect(subscriptionUpdate({ ...sub, current_period_end: end, cancel_at_period_end: true }, now)!.values.cancelAtPeriodEnd).toBe(true);
    expect(subscriptionUpdate({ ...sub, current_period_end: end, status: "canceled" }, now)!.values.activeUntil).toEqual(now);
    expect(subscriptionUpdate({ ...sub, metadata: { userId: "anna" } }, now)).toBeNull();
  });

  it("runs a test period for a month or a year", () => {
    const from = new Date("2026-01-31T12:00:00Z");
    expect(periodEnd("yearly", from).toISOString()).toBe("2027-01-31T12:00:00.000Z");
    expect(periodEnd("monthly", new Date("2026-11-15T12:00:00Z")).toISOString()).toBe("2026-12-15T12:00:00.000Z");
  });
});
