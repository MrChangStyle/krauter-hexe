import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { energy, lampHours, summarizeCosts } = await import("./growCosts");

const photo = { strainType: "hybrid" as const, flowering: "photo" as const, seedSex: "feminized" as const, flowerWeeks: 9, startedOn: "2026-03-01", flipOn: null, harvestedOn: null };
const auto = { ...photo, strainType: "ruderalis" as const, flowering: "auto" as const, flowerWeeks: 7 };
const tent = { environment: "indoor" as const, medium: "soil" as const, lightWatts: 240, fanWatts: 30 };

describe("Grow – Strom", () => {
  it("knows the lamp hours per phase", () => {
    expect(lampHours("germination", "photo")).toBe(0);
    expect(lampHours("veg", "photo")).toBe(18);
    expect(lampHours("flower", "photo")).toBe(12);
    expect(lampHours("flush", "auto")).toBe(20);
    expect(lampHours("drying", "photo")).toBe(0);
  });

  it("adds up lamp and fans from the seedling to the harvest", () => {
    // 42 days at 18 h (seedling and growth), 63 days at 12 h (bloom and flushing).
    expect(energy(tent, [photo], "2026-04-01")).toEqual({
      from: "2026-03-06",
      to: "2026-06-18",
      lampHours: 42 * 18 + 63 * 12,
      kwhLamp: 362.9,
      kwhFans: 75.6,
      kwh: 438.5,
      // 27 days at 18 h so far.
      kwhSoFar: 136.1,
    });
  });

  it("takes the longest light of the plants on each day", () => {
    const both = energy({ ...tent, fanWatts: null }, [photo, auto], "2026-03-01");
    const alone = energy({ ...tent, fanWatts: null }, [photo], "2026-03-01");
    expect(both.lampHours).toBeGreaterThan(alone.lampHours);
    expect(both.kwhFans).toBe(0);
    expect(energy(tent, [auto], "2026-03-01").lampHours % 20).toBe(0);
  });

  it("costs nothing outdoors, without plants or without devices", () => {
    const zero = { from: null, to: null, lampHours: 0, kwhLamp: 0, kwhFans: 0, kwh: 0, kwhSoFar: 0 };
    expect(energy({ ...tent, environment: "outdoor" }, [photo], "2026-04-01")).toEqual(zero);
    expect(energy(tent, [], "2026-04-01")).toEqual(zero);
    expect(energy({ ...tent, lightWatts: null, fanWatts: null }, [photo], "2026-04-01")).toEqual(zero);
  });
});

describe("Grow – Kosten", () => {
  it("sums electricity and costs and gives the price per gram after the harvest", () => {
    const e = energy(tent, [photo], "2026-04-01");
    const items = [
      { category: "equipment", amount: 100 },
      { category: "soil", amount: 15.5 },
      { category: "soil", amount: 4.5 },
    ];
    expect(summarizeCosts(e, 0.4, items, 0)).toEqual({
      electricityEur: 175.4,
      electricitySoFarEur: 54.44,
      itemsEur: 120,
      byCategory: [
        { category: "equipment", eur: 100 },
        { category: "soil", eur: 20 },
      ],
      totalEur: 295.4,
      dryGrams: 0,
      eurPerGram: null,
    });
    expect(summarizeCosts(e, 0.4, items, 80).eurPerGram).toBe(2.18);
  });
});
