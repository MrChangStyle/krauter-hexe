import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { feedDigestMessage, stockOverview, winterWindow } = await import("./feedStock");

type R = Parameters<typeof stockOverview>[1][number];
const item = (feedKey: string, name: string, grams: number) => ({ feedKey, feedId: null, name, grams });
const hens: R = { season: "all", active: true, target: { kind: "herd", id: 1, name: "Hühner", species: "poultry", count: 3 }, items: [item("legehennen", "Legehennen-Alleinfutter", 120), item("koernermix", "Körnermischung Geflügel", 20)] };
const sheepTarget = { kind: "animal" as const, id: 2, name: "Wolke", species: "sheep" as const, count: 1 };
const sheepAll: R = { season: "all", active: true, target: sheepTarget, items: [item("heu", "Wiesenheu", 1800)] };
const sheepWinter: R = { season: "winter", active: false, target: sheepTarget, items: [item("heu", "Wiesenheu", 1600), item("futterruebe", "Futterrüben", 1500)] };
const feeds = new Map(
  (
    [
      ["legehennen", "Legehennen-Alleinfutter", "compound"],
      ["koernermix", "Körnermischung Geflügel", "compound"],
      ["heu", "Wiesenheu", "roughage"],
      ["futterruebe", "Futterrüben", "vegetable"],
    ] as const
  ).map(([k, name, category]) => [`k:${k}`, { feedKey: k, feedId: null, name, category }]),
);
const rows = [
  { id: 1, feedKey: "legehennen", feedId: null, stockKg: 25, countedOn: "2026-10-09", packageKg: 25, pricePerKg: 0.8 },
  { id: 2, feedKey: "heu", feedId: null, stockKg: 30, countedOn: "2026-10-14", packageKg: 15, pricePerKg: 0.25 },
];

describe("Vorrat", () => {
  const o = stockOverview("2026-10-19", [hens, sheepAll, sheepWinter], feeds, rows);

  it("subtracts the daily use since counting and says when to buy more", () => {
    expect(o.stocks.map((s) => [s.name, s.status, s.stockKg, s.dailyKg, s.daysLeft, s.emptyOn, s.reorderOn])).toEqual([
      ["Wiesenheu", "soon", 21, 1.8, 11, "2026-10-30", "2026-10-23"],
      ["Körnermischung Geflügel", "unknown", null, 0.06, null, null, null],
      ["Legehennen-Alleinfutter", "ok", 21.4, 0.36, 59, "2026-12-17", "2026-12-10"],
    ]);
  });

  it("costs per animal and month, naming feeds without a price", () => {
    expect(o.costs).toEqual({
      lines: [
        { target: { kind: "herd", id: 1, name: "Hühner", count: 3 }, perAnimalMonth: 2.92, perMonth: 8.76, missingPrices: ["Körnermischung Geflügel"] },
        { target: { kind: "animal", id: 2, name: "Wolke", count: 1 }, perAnimalMonth: 13.68, perMonth: 13.68, missingPrices: [] },
      ],
      perMonth: 22.44,
      complete: false,
    });
  });

  it("plans the winter with the winter rations and what will be left by then", () => {
    expect(o.winter).toMatchObject({ from: "2026-11-01", to: "2027-03-31", days: 151, gardenKg: 226.5 });
    expect(o.winter.lines.map((l) => [l.name, l.neededKg, l.stockKg, l.missingKg, l.gardenCrop])).toEqual([
      ["Wiesenheu", 241.6, 0, 241.6, null],
      ["Futterrüben", 226.5, 0, 226.5, "rote_bete"],
      ["Legehennen-Alleinfutter", 54.4, 16.7, 37.7, null],
      ["Körnermischung Geflügel", 9.1, 0, 9.1, null],
    ]);
  });

  it("plans the running winter from today", () => {
    expect(winterWindow("2026-12-10")).toEqual({ from: "2026-12-10", to: "2027-03-31" });
    expect(winterWindow("2027-02-01")).toEqual({ from: "2027-02-01", to: "2027-03-31" });
    expect(winterWindow("2026-04-01")).toEqual({ from: "2026-11-01", to: "2027-03-31" });
  });
});

describe("Push Futter nachkaufen", () => {
  const line = (over: object) => ({ name: "Wiesenheu", dailyKg: 1.8, daysLeft: 7, emptyOn: "2026-10-26", reorderOn: "2026-10-19", ...over }) as Parameters<typeof feedDigestMessage>[0][number];

  it("comes on the day to buy more and the day before it is empty – not every day", () => {
    expect(feedDigestMessage([line({})], "2026-10-19")).toEqual({ title: "Futter nachkaufen", body: "Wiesenheu reicht noch 7 Tage (bis 26.10.)." });
    expect(feedDigestMessage([line({})], "2026-10-22")).toBeNull();
    expect(feedDigestMessage([line({ daysLeft: 1 }), line({ name: "Hafer", reorderOn: "2026-10-25", emptyOn: "2026-11-01" })], "2026-10-25")).toEqual({
      title: "Futter nachkaufen",
      body: "Wiesenheu ist morgen leer. Hafer reicht noch 7 Tage (bis 01.11.).",
    });
    expect(feedDigestMessage([line({ dailyKg: 0 })], "2026-10-19")).toBeNull();
  });
});
