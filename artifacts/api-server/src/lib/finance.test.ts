import { describe, expect, it } from "vitest";
import { aiCostPerRequestCent, invoicePayment, lastMonths, monthlyCents, paketKey } from "./finance";

describe("Finanzen", () => {
  it("counts a yearly subscription as a twelfth per month", () => {
    expect(monthlyCents("lite", "monthly")).toBe(299);
    expect(monthlyCents("premium", "yearly")).toBe(499);
  });

  it("groups accounts by Paket", () => {
    const base = { until: null, plan: null, cancelAtPeriodEnd: false, subscribed: false };
    expect(paketKey({ ...base, active: false, source: null, tier: null })).toBe("basis");
    expect(paketKey({ ...base, active: true, source: "stripe", tier: "lite" })).toBe("lite");
    expect(paketKey({ ...base, active: true, source: "mock", tier: "premium" })).toBe("premium");
    expect(paketKey({ ...base, active: true, source: "manual", tier: "premium" })).toBe("manual");
    expect(paketKey({ ...base, active: true, source: "tester", tier: "premium" })).toBe("tester");
  });

  it("lists the last months in Berlin, newest first", () => {
    // 31 Dec 23:30 UTC is already January in Berlin.
    expect(lastMonths(new Date("2026-12-31T23:30:00Z"), 3)).toEqual(["2027-01", "2026-12", "2026-11"]);
  });

  it("reads the AI cost per request, with a default", () => {
    expect(aiCostPerRequestCent(undefined)).toBe(0.3);
    expect(aiCostPerRequestCent("0,5")).toBe(0.5);
    expect(aiCostPerRequestCent("x")).toBe(0.3);
  });

  it("reads a Stripe invoice in old and new API shapes", () => {
    expect(invoicePayment({ id: "in_0", amount_paid: 0 })).toBeNull();
    expect(
      invoicePayment({ id: "in_1", amount_paid: 599, currency: "eur", subscription: "sub_1", status_transitions: { paid_at: 1_800_000_000 }, subscription_details: { metadata: { userId: "anna", tier: "premium", interval: "monthly" } } }),
    ).toMatchObject({ externalId: "in_1", amountCents: 599, userId: "anna", tier: "premium", plan: "monthly", subscriptionId: "sub_1", paidAt: new Date(1_800_000_000_000) });
    expect(invoicePayment({ id: "in_2", amount_paid: 2990, parent: { subscription_details: { subscription: "sub_2", metadata: { userId: "bert" } } } })).toMatchObject({ userId: "bert", subscriptionId: "sub_2" });
  });
});
