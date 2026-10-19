import { describe, expect, it } from "vitest";

import { activeSeason, mix, newShareOn, nextSeasonStart, phases, seasonHints, seasonOf } from "./feedSeason";

describe("seasons", () => {
  it("splits the year into summer (April–October) and winter", () => {
    expect(seasonOf("2026-03-31")).toBe("winter");
    expect(seasonOf("2026-04-01")).toBe("summer");
    expect(seasonOf("2026-10-31")).toBe("summer");
    expect(seasonOf("2026-11-01")).toBe("winter");
    expect(nextSeasonStart("2026-06-15")).toEqual({ season: "winter", day: "2026-11-01" });
    expect(nextSeasonStart("2026-12-15")).toEqual({ season: "summer", day: "2027-04-01" });
    expect(nextSeasonStart("2027-02-01")).toEqual({ season: "summer", day: "2027-04-01" });
  });

  it("prefers the season's ration and falls back to the all-year one", () => {
    expect(activeSeason(["all", "winter"], "2026-12-01")).toBe("winter");
    expect(activeSeason(["all", "winter"], "2026-06-01")).toBe("all");
    expect(activeSeason(["winter"], "2026-06-01")).toBeNull();
  });
});

describe("change of feed", () => {
  it("goes in four steps of 25 %", () => {
    expect(Array.from({ length: 14 }, (_, d) => newShareOn(d, 14))).toEqual([0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 1, 1, 1]);
    expect(phases(7)).toEqual([
      { fromDay: 1, toDay: 2, newShare: 0.25 },
      { fromDay: 3, toDay: 4, newShare: 0.5 },
      { fromDay: 5, toDay: 6, newShare: 0.75 },
      { fromDay: 7, toDay: 7, newShare: 1 },
    ]);
  });

  it("blends old and new feeds, rounding larger amounts to 5 g", () => {
    const same = (a: string, b: string) => a === b;
    expect(
      mix(
        [{ key: "heu", grams: 1500 }, { key: "gras", grams: 400 }],
        [{ key: "heu", grams: 1700 }, { key: "moehre", grams: 30 }],
        0.25,
        same,
      ),
    ).toEqual([{ key: "heu", grams: 1550 }, { key: "moehre", grams: 8 }, { key: "gras", grams: 300 }]);
    expect(mix([{ key: "gras", grams: 400 }], [{ key: "heu", grams: 100 }], 1, same)).toEqual([{ key: "heu", grams: 100 }]);
  });
});

describe("season hints", () => {
  it("names frost and missing green feed in winter, pasture in summer", () => {
    expect(seasonHints("goat", "2026-12-01", ["roughage", "fresh"])).toEqual([
      expect.stringMatching(/^Frisches Gras/),
      expect.stringMatching(/Raufutter um 10–20 % erhöhen/),
    ]);
    expect(seasonHints("poultry", "2026-12-01", ["compound"])).toEqual([expect.stringMatching(/abends etwas Körner/)]);
    expect(seasonHints("horse", "2026-05-01", ["fresh"])).toEqual([expect.stringMatching(/Hufrehe/)]);
    expect(seasonHints("sheep", "2026-05-01", ["roughage"])).toEqual([expect.stringMatching(/Sommerration anlegen/)]);
    expect(seasonHints("sheep", "2026-10-10", ["roughage"])).toEqual([]);
    expect(seasonHints("poultry", "2026-05-01", ["compound"])).toEqual([]);
    expect(seasonHints("dog", "2026-12-01", [])).toEqual([]);
  });
});
