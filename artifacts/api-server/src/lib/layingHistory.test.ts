import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { layingHints, layingHistory, laysOn, weekStart } = await import("./layingHistory");
type Hen = Parameters<typeof laysOn>[0];

const hen = (id: number, extra: Partial<Hen> = {}): Hen => ({ id, name: `Henne ${id}`, herdId: 1, birthDate: null, archivedOn: null, ...extra });
/** One entry per day from `from` for `days` days. */
const daily = (from: string, days: number, amount: number, extra = {}) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), amount, herdId: null, animalId: null, ...extra };
  });

describe("weekStart / laysOn", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
  });

  it("counts hens from 20 weeks of age until archived", () => {
    expect(laysOn(hen(1), "2026-01-01")).toBe(true);
    expect(laysOn(hen(1, { birthDate: "2026-06-01" }), "2026-10-18")).toBe(false);
    expect(laysOn(hen(1, { birthDate: "2026-06-01" }), "2026-10-19")).toBe(true);
    expect(laysOn(hen(1, { archivedOn: "2026-10-10" }), "2026-10-10")).toBe(true);
    expect(laysOn(hen(1, { archivedOn: "2026-10-10" }), "2026-10-11")).toBe(false);
  });
});

describe("layingHistory", () => {
  it("gives 26 weeks with eggs per hen and day, the current week up to today", () => {
    const hens = [hen(1), hen(2), hen(3, { herdId: 2 }), hen(4, { herdId: 2, archivedOn: "2026-10-01" })];
    const entries = [...daily("2026-10-12", 7, 3), ...daily("2026-10-19", 3, 2)];
    const h = layingHistory("2026-10-21", hens, entries, [{ id: 1, name: "Stall" }, { id: 2, name: "Wiese" }]);
    expect(h.weeks).toHaveLength(26);
    expect(h.weeks.at(-1)).toEqual({ start: "2026-10-19", days: 3, eggs: 6, hens: 3, perHenDay: 0.67 });
    expect(h.weeks.at(-2)).toEqual({ start: "2026-10-12", days: 7, eggs: 21, hens: 3, perHenDay: 1 });
    // Hen 4 was still there in late September.
    expect(h.weeks.find((w) => w.start === "2026-09-21")!.hens).toBe(4);
  });

  it("splits by group and by hen", () => {
    const hens = [hen(1), hen(2), hen(3, { herdId: 2 })];
    const entries = [
      ...daily("2026-10-01", 20, 2, { herdId: 1 }),
      { date: "2026-10-15", amount: 1, herdId: null, animalId: 3 },
      { date: "2026-10-18", amount: 1, herdId: null, animalId: 3 },
      { date: "2026-08-01", amount: 9, herdId: null, animalId: 1 }, // too old for the 30 days
    ];
    const h = layingHistory("2026-10-21", hens, entries, [{ id: 1, name: "Stall" }, { id: 2, name: "Wiese" }, { id: 3, name: "Leer" }]);
    expect(h.groups).toEqual([
      { herdId: 1, name: "Stall", hens: 2, eggs: 40, perHenDay: 0.67 },
      { herdId: 2, name: "Wiese", hens: 1, eggs: 2, perHenDay: 0.07 },
    ]);
    expect(h.hens).toEqual([{ animalId: 3, name: "Henne 3", eggs: 2, lastEgg: "2026-10-18" }]);
  });

  it("gives eggs for the whole farm to the only group", () => {
    const h = layingHistory("2026-10-21", [hen(1), hen(2)], daily("2026-10-01", 10, 1), [{ id: 1, name: "Stall" }]);
    expect(h.groups).toEqual([{ herdId: 1, name: "Stall", hens: 2, eggs: 10, perHenDay: 0.17 }]);
  });
});

describe("layingHints", () => {
  const four = [hen(1), hen(2), hen(3), hen(4)];

  it("explains a drop in autumn with the moult", () => {
    const entries = [...daily("2026-09-01", 36, 3), ...daily("2026-10-07", 14, 1)];
    const hints = layingHints("2026-10-20", entries, four);
    expect(hints.map((h) => h.kind)).toEqual(["drop", "moult"]);
    expect(hints[0]!.title).toBe("Legeleistung um 67 % gesunken");
    expect(hints[0]!.text).toContain("meist die Mauser");
  });

  it("asks about a silent week instead of reporting a drop", () => {
    const entries = daily("2026-04-01", 30, 3);
    expect(layingHints("2026-05-10", entries, four).map((h) => h.kind)).toEqual(["quiet"]);
  });

  it("names winter and heat, old hens and young hens", () => {
    expect(layingHints("2026-12-15", [], four).map((h) => h.kind)).toEqual(["winter"]);
    expect(layingHints("2026-07-15", [], four).map((h) => h.kind)).toEqual(["heat"]);
    const hints = layingHints("2026-05-10", [], [hen(1, { birthDate: "2022-04-01" }), hen(2, { birthDate: "2026-03-01" }), hen(3, { birthDate: "2026-04-01" })]);
    expect(hints.map((h) => [h.kind, h.title])).toEqual([
      ["old", "1 Henne ist älter als 3 Jahre"],
      ["young", "2 Junghennen"],
    ]);
    expect(hints[1]!.text).toContain("ab 19.07.2026");
  });
});
