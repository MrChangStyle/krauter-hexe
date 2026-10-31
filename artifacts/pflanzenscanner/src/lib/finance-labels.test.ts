import { describe, expect, it } from "vitest";
import { euro, financeCsv, monthLabel } from "./finance-labels";

describe("Finanzen", () => {
  it("writes euros the German way", () => {
    expect(euro(123456)).toBe("1.234,56 €");
    expect(euro(-50)).toBe("−0,50 €");
  });

  it("names months", () => {
    expect(monthLabel("2026-10")).toMatch(/Okt.* 2026/);
  });

  it("builds a CSV oldest month first, with the cost Richtwert", () => {
    const csv = financeCsv({
      aiCostPerRequestCent: 0.3,
      months: [
        { month: "2026-10", revenueCents: 6289, payments: 2, aiRequests: 200, aiCostCents: 60, resultCents: 6229 },
        { month: "2026-09", revenueCents: 0, payments: 0, aiRequests: 10, aiCostCents: 3, resultCents: -3 },
      ],
    });
    expect(csv.split("\n").slice(0, 3)).toEqual([
      "Monat;Umsatz (EUR);Zahlungen;KI-Anfragen;KI-Kosten geschätzt (EUR);Ergebnis (EUR)",
      "2026-09;0,00;0;10;0,03;-0,03",
      "2026-10;62,89;2;200;0,60;62,29",
    ]);
    expect(csv).toContain("0,3 Cent je Anfrage");
  });
});
