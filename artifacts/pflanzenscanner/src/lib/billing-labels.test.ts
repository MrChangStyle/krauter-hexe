import { describe, expect, it } from "vitest";
import { aiPerDay, paketLabel, priceLine, untilText } from "./billing-labels";

describe("Paket & Abo", () => {
  it("names the Paket and its daily AI limit like the server does", () => {
    expect([paketLabel({ active: false, source: null, tier: null }), aiPerDay({ active: false, source: null, tier: null })]).toEqual(["Basis", 3]);
    expect([paketLabel({ active: true, source: "test", tier: "premium" }), aiPerDay({ active: true, source: "test", tier: "premium" })]).toEqual(["Testphase – alles kostenlos", 15]);
    expect(aiPerDay({ active: true, source: "tester", tier: "premium" })).toBe(15);
    expect([paketLabel({ active: true, source: "stripe", tier: "lite" }), aiPerDay({ active: true, source: "stripe", tier: "lite" })]).toEqual(["Lite", 15]);
    expect([paketLabel({ active: true, source: "mock", tier: "premium" }), aiPerDay({ active: true, source: "mock", tier: "premium" })]).toEqual(["Premium", 40]);
    expect(paketLabel({ active: true, source: "manual", tier: "premium" })).toBe("Premium (geschenkt)");
    expect(aiPerDay({ active: true, source: "owner", tier: "premium" })).toBeNull();
  });

  it("shows the price and the end", () => {
    expect(priceLine("lite", "monthly")).toBe("2,99 € im Monat");
    expect(priceLine("premium", "yearly")).toBe("59,90 € im Jahr");
    expect(untilText("2026-12-31T22:59:59.000Z")).toBe("31.12.2026");
    expect(untilText(null)).toBeNull();
  });
});
