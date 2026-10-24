import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { harvestReport, harvestValue } = await import("./harvestReport");

const prices: Record<string, number> = { "crop:tomate": 4, "crop:zucchini": 2, "crop:other": 3, fodder: 0.3 };
const price = (key: string) => prices[key] ?? 3;
let id = 0;
const h = (o: Partial<Parameters<typeof harvestValue>[0]> & Record<string, unknown>) => ({
  id: ++id,
  plantingId: 1,
  bedId: 1,
  season: 2026,
  cropKey: "tomate",
  label: "Tomate",
  cells: 4,
  harvestedOn: "2026-08-01",
  amountKg: 1,
  use: "kitchen" as const,
  ...o,
});
const beds = new Map([[1, "Hochbeet"], [2, "Acker"]]);

describe("harvestReport", () => {
  it("values kitchen at the crop's price and fodder as fodder", () => {
    expect(harvestValue(h({ amountKg: 2 }), price)).toBe(8);
    expect(harvestValue(h({ amountKg: 10, use: "fodder" }), price)).toBe(3);
    expect(harvestValue(h({ cropKey: null, amountKg: 1 }), price)).toBe(3);
  });

  it("sums a season per crop and bed, counts each planting's area once", () => {
    const r = harvestReport(
      2026,
      [
        h({ amountKg: 3, harvestedOn: "2026-08-01" }),
        h({ amountKg: 2, harvestedOn: "2026-09-02" }),
        h({ plantingId: 2, bedId: 2, cells: 8, cropKey: "zucchini", label: "Zucchini", amountKg: 10, harvestedOn: "2026-07-10" }),
        h({ plantingId: 2, bedId: 2, cells: 8, cropKey: "zucchini", label: "Zucchini", amountKg: 5, use: "fodder", harvestedOn: "2026-08-20" }),
        h({ plantingId: 3, bedId: null, cropKey: null, label: "Mangold rot", cells: 2, amountKg: 1 }),
        h({ season: 2025, amountKg: 4 }),
        h({ season: 2025, cropKey: "zucchini", label: "Zucchini", amountKg: 6 }),
        h({ season: 2021, amountKg: 9 }),
      ],
      beds,
      price,
    );
    expect(r).toMatchObject({ season: 2026, kg: 21, kitchenKg: 16, fodderKg: 5, value: 44.5, previous: { kg: 10, value: 28 } });
    expect(r.months).toEqual([0, 0, 0, 0, 0, 0, 10, 9, 2, 0, 0, 0]);
    expect(r.crops.map((c) => [c.label, c.kg, c.m2, c.kgPerM2, c.value, c.valuePerM2, c.harvests, c.beds, c.previousKg])).toEqual([
      ["Zucchini", 15, 0.72, 20.8, 21.5, 29.86, 2, ["Acker"], 6],
      ["Tomate", 5, 0.36, 13.9, 20, 55.56, 2, ["Hochbeet"], 4],
      ["Mangold rot", 1, 0.18, 5.6, 3, 16.67, 1, ["Ohne Beet"], null],
    ]);
    expect(r.beds.map((b) => [b.name, b.kg, b.value, b.m2, b.valuePerM2, b.crops])).toEqual([
      ["Acker", 15, 21.5, 0.72, 29.86, ["Zucchini"]],
      ["Hochbeet", 5, 20, 0.36, 55.56, ["Tomate"]],
      ["Ohne Beet", 1, 3, 0.18, 16.67, ["Mangold rot"]],
    ]);
    expect(r.best.map((b) => b.label)).toEqual(["Tomate", "Zucchini", "Mangold rot"]);
    // Five seasons back at most, oldest first.
    expect(r.years.map((y) => [y.season, y.kg])).toEqual([[2025, 10], [2026, 21]]);
  });

  it("gives an empty season without breaking", () => {
    const r = harvestReport(2027, [h({})], beds, price);
    expect(r).toMatchObject({ kg: 0, value: 0, crops: [], beds: [], best: [], previous: { kg: 1, value: 4 }, years: [{ season: 2026, kg: 1, value: 4 }] });
    expect(harvestReport(2031, [h({})], beds, price)).toMatchObject({ previous: null, years: [] });
  });
});
