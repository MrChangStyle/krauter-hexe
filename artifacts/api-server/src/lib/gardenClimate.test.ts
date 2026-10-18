import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { frostDaysOfYear, roundCoord, typicalFrostDates } = await import("./gardenClimate");
const { validMonthDay } = await import("./gardenBeds");

const days = (entries: [string, number][]) => new Map(entries);

describe("frost dates from weather history", () => {
  it("finds the last spring and first autumn frost of a year", () => {
    const spring = days([["2024-03-30", -3], ["2024-04-21", -0.4], ["2024-05-02", 1.2], ["2024-04-10", 2]]);
    const autumn = days([["2024-10-03", 0.5], ["2024-10-19", 0], ["2024-11-02", -4]]);
    expect(frostDaysOfYear(spring, autumn)).toEqual({ last: "04-21", first: "10-19" });
    expect(frostDaysOfYear(days([["2024-04-01", 3]]), days([]))).toEqual({ last: null, first: null });
  });

  it("takes the median over the years and needs five of them", () => {
    const years = [
      { last: "04-10", first: "10-30" },
      { last: "04-20", first: "10-20" },
      { last: "05-12", first: "10-05" },
      { last: "04-25", first: "10-25" },
      { last: "04-18", first: "11-02" },
    ];
    expect(typicalFrostDates(years)).toEqual({ lastFrost: "04-20", firstFrost: "10-25", years: 5 });
    expect(typicalFrostDates(years.slice(0, 4))).toBeNull();
  });

  it("rounds a position to about 10 km", () => {
    expect(roundCoord(52.5183)).toBe(52.5);
    expect(roundCoord(13.4467)).toBe(13.4);
  });

  it("knows real calendar days", () => {
    expect(validMonthDay("05-15")).toBe(true);
    expect(validMonthDay("02-29")).toBe(false);
    expect(validMonthDay("13-01")).toBe(false);
    expect(validMonthDay("5-15")).toBe(false);
  });
});
