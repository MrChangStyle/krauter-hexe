import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { DEFAULT_PRICES, defaultPrice, layingRate, summarize } = await import("./farmYields");
const { GARDEN_CATALOG } = await import("./gardenCatalog");

describe("Ertrag – prices", () => {
  it("has a price for every crop of the catalog and falls back for others", () => {
    for (const crop of GARDEN_CATALOG) expect(DEFAULT_PRICES[`crop:${crop.key}`], crop.key).toBeDefined();
    expect(defaultPrice("crop:other")).toBe(3);
  });
});

describe("Ertrag – summary", () => {
  it("values garden harvests and animal products per line and month", () => {
    const s = summarize(
      2026,
      [
        { cropKey: "tomate", label: "Tomate", harvestedOn: "2026-08-03", amountKg: 4, use: "kitchen" },
        { cropKey: "tomate", label: "Tomate", harvestedOn: "2026-09-01", amountKg: 2.5, use: "kitchen" },
        { cropKey: "moehre", label: "Möhre", harvestedOn: "2026-09-10", amountKg: 10, use: "fodder" },
        { cropKey: null, label: "Topinambur", harvestedOn: "2026-10-01", amountKg: 1, use: "kitchen" },
      ],
      [
        { product: "eggs", date: "2026-09-02", amount: 30 },
        { product: "eggs", date: "2026-10-01", amount: 20 },
        { product: "milk", date: "2026-10-02", amount: 3 },
      ],
      (key) => (key === "crop:tomate" ? 5 : defaultPrice(key)),
    );
    expect(s.garden).toEqual({
      kg: 17.5,
      value: 38.5,
      lines: [
        { key: "tomate", name: "Tomate", kitchenKg: 6.5, fodderKg: 0, pricePerKg: 5, value: 32.5 },
        { key: "moehre", name: "Möhre", kitchenKg: 0, fodderKg: 10, pricePerKg: 1.5, value: 3 },
        { key: "label:Topinambur", name: "Topinambur", kitchenKg: 1, fodderKg: 0, pricePerKg: 3, value: 3 },
      ],
    });
    expect(s.animals).toEqual({
      value: 24.5,
      lines: [
        { product: "eggs", unit: "Stück", amount: 50, price: 0.4, value: 20 },
        { product: "milk", unit: "l", amount: 3, price: 1.5, value: 4.5 },
      ],
    });
    expect(s.months[7]).toEqual({ month: 8, garden: 20, animals: 0 });
    expect(s.months[8]).toEqual({ month: 9, garden: 15.5, animals: 12 });
    expect(s.months[9]).toEqual({ month: 10, garden: 3, animals: 12.5 });
    expect(s.total).toBe(63);
  });

  it("works out eggs per hen and day", () => {
    expect(layingRate(150, 6)).toBe(0.83);
    expect(layingRate(10, 0)).toBeNull();
  });
});
