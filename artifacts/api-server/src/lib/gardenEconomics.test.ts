import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test";
});

const { gardenEconomics, minimumWage } = await import("./gardenEconomics");
type Report = Parameters<typeof gardenEconomics>[0];
type Cost = Parameters<typeof gardenEconomics>[1][number];
type Hours = Parameters<typeof gardenEconomics>[2][number];

const beds = [
  { id: 1, name: "Hochbeet", lengthCm: 200, widthCm: 100 },
  { id: 2, name: "Gemüsebeet", lengthCm: 400, widthCm: 200 },
];
const report = (o: Partial<Report> = {}): Report => ({
  season: 2026,
  value: 120,
  kg: 40,
  beds: [
    { bedId: 1, name: "Hochbeet", kg: 30, value: 100, m2: 1, valuePerM2: 100, crops: ["Tomate"] },
    { bedId: 2, name: "Gemüsebeet", kg: 10, value: 20, m2: 2, valuePerM2: 10, crops: ["Kartoffel"] },
  ],
  best: [{ label: "Tomate", valuePerM2: 100 }],
  ...o,
});
let id = 0;
const cost = (amountEur: number, o: Partial<Cost> = {}): Cost => ({ id: ++id, date: "2026-04-01", category: "seeds", amountEur, bedId: null, note: null, ...o });
const hours = (h: number, o: Partial<Hours> = {}): Hours => ({ id: ++id, date: "2026-05-01", hours: h, bedId: null, note: null, ...o });

describe("gardenEconomics", () => {
  it("sets the harvest value against the costs and the logged hours", () => {
    const e = gardenEconomics(report(), [cost(20), cost(15.5, { category: "soil", bedId: 1 }), cost(4.5, { category: "water" })], [hours(10), hours(5, { bedId: 2 })], beds);
    expect(e).toMatchObject({
      value: 120,
      area: 10,
      costs: { total: 40, lines: [{ category: "seeds", eur: 20 }, { category: "soil", eur: 15.5 }, { category: "water", eur: 4.5 }] },
      hours: { total: 15, estimated: false },
      surplus: 80,
      perHour: 5.33,
      costPerKg: 1,
      surplusPerM2: 8,
      minimumWage: 13.9,
    });
    expect(e.costs.entries[1]).toMatchObject({ bedId: 1, bedName: "Hochbeet" });
  });

  it("splits per bed, with the costs for the whole garden last", () => {
    const e = gardenEconomics(report(), [cost(10), cost(30, { bedId: 2 }), cost(5, { bedId: 1 })], [hours(2, { bedId: 1 })], beds);
    expect(e.beds).toEqual([
      { bedId: 1, name: "Hochbeet", m2: 2, value: 100, costs: 5, surplus: 95, hours: 2 },
      { bedId: 2, name: "Gemüsebeet", m2: 8, value: 20, costs: 30, surplus: -10, hours: 0 },
      { bedId: null, name: "Für den ganzen Garten", m2: null, value: 0, costs: 10, surplus: -10, hours: 0 },
    ]);
    expect(e.hints).toContain("Gemüsebeet: 30,00 € Kosten, aber nur 20,00 € Ernte.");
  });

  it("estimates the time from the bed area without logged hours", () => {
    // 10 m²: 1 h a week for 30 weeks.
    const e = gardenEconomics(report(), [cost(30)], [], beds);
    expect(e.hours).toMatchObject({ total: 30, estimated: true });
    expect(e.perHour).toBe(3);
    expect(e.hints).toContain("3,00 € je Stunde (Zeit geschätzt) – zum Vergleich: Mindestlohn 13,90 €. Frische, Geschmack und Freude zählen hier nicht mit.");
    expect(e.hints.at(-1)).toMatch(/^Die Zeit ist geschätzt/);
    expect(gardenEconomics(report(), [], [], []).hours).toMatchObject({ total: 0, estimated: false });
  });

  it("says when the season cost more than it brought, and asks for costs when there are none", () => {
    expect(gardenEconomics(report(), [cost(150)], [hours(1)], beds).hints[0]).toBe("Die Saison hat 30,00 € mehr gekostet, als die Ernte im Laden wert wäre.");
    expect(gardenEconomics(report(), [], [hours(1)], beds).hints[0]).toMatch(/^Noch keine Gartenausgaben/);
    // A good hour beats the minimum wage.
    expect(gardenEconomics(report(), [cost(10)], [hours(5)], beds).hints).toContain("22,00 € je Stunde – mehr als der Mindestlohn (13,90 €).");
  });

  it("compares with the season before and has no ratios without a harvest", () => {
    const e = gardenEconomics(report({ value: 0, kg: 0, beds: [], best: [] }), [cost(12)], [], [], { value: 50, costs: 20 });
    expect(e).toMatchObject({ surplus: -12, costPerKg: null, surplusPerM2: null, perHour: null, previous: { value: 50, costs: 20, surplus: 30 } });
  });

  it("takes the minimum wage of the season", () => {
    expect(minimumWage(2025)).toBe(12.82);
    expect(minimumWage(2027)).toBe(14.6);
    expect(minimumWage(2030)).toBe(14.6);
    expect(minimumWage(2020)).toBe(12.41);
  });
});
