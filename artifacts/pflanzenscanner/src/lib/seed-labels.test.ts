import { describe, expect, it } from "vitest";
import { amountText, seedBasis } from "./seed-labels";

describe("seed labels", () => {
  it("says what the status is based on", () => {
    expect(seedBasis({ harvestYear: 2025, useBy: null, goodUntil: 2028, germinationRate: null, testedOn: null })).toBe("Ernte 2025 · keimt gut bis etwa 2028");
    expect(seedBasis({ harvestYear: null, useBy: "2027-12-31", goodUntil: 2027, germinationRate: 0.85, testedOn: "2026-10-10" })).toBe(
      "verwendbar bis 31.12.2027 · Keimprobe 10.10.2026: 85 %",
    );
    expect(seedBasis({ harvestYear: null, useBy: null, goodUntil: null, germinationRate: null, testedOn: null })).toBe("Alter unbekannt");
    expect(seedBasis({ harvestYear: 2019, useBy: null, goodUntil: 2022, germinationRate: 0.85, testedOn: "2026-10-19" })).toBe("Ernte 2019 · Keimprobe 19.10.2026: 85 %");
  });

  it("words the amount", () => {
    expect(amountText(1, "Tüten")).toBe("1 Tüte");
    expect(amountText(2, "Tüten")).toBe("2 Tüten");
    expect(amountText(12.5, "g")).toBe("12,5 g");
  });
});
