import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { careIntervalDays, careNextDue, careNote, frostAhead, isWinter, rainWaters } = await import("./careWeather");

const task = (overrides = {}) => ({
  actionType: "Gießen",
  intervalValue: 4,
  intervalUnit: "Tage" as const,
  lastCompletedAt: new Date("2026-12-01T10:00:00Z"),
  createdAt: new Date("2026-01-01T10:00:00Z"),
  outdoor: false,
  rainSkippedOn: null,
  ...overrides,
});
const day = (date: string, minTemp: number, precipitationMm = 0) => ({ date, minTemp, maxTemp: 10, precipitationMm, maxGustKmh: 10, icon: "cloud" as const });

describe("winter rules", () => {
  it("knows winter from November to February", () => {
    expect(["2026-10-31", "2026-11-01", "2027-02-28", "2027-03-01"].map(isWinter)).toEqual([false, true, true, false]);
  });

  it("waters half as often again in winter, only when switched on", () => {
    expect(careIntervalDays(task(), "2026-12-10", true)).toBe(6);
    expect(careIntervalDays(task({ intervalValue: 1, intervalUnit: "Wochen" }), "2026-12-10", true)).toBe(11);
    expect(careIntervalDays(task(), "2026-12-10", false)).toBe(4);
    expect(careIntervalDays(task(), "2026-06-10", true)).toBe(4);
    expect(careIntervalDays(task({ actionType: "Besprühen" }), "2026-12-10", true)).toBe(4);
    expect(careNextDue(task(), "2026-12-03", true)).toBe("2026-12-07");
  });

  it("pauses fertilising until March", () => {
    const feed = task({ actionType: "Düngen", intervalValue: 2, intervalUnit: "Wochen", lastCompletedAt: new Date("2026-10-20T10:00:00Z") });
    expect(careNextDue(feed, "2026-11-05", true)).toBe("2027-03-01");
    expect(careNextDue(feed, "2027-01-15", true)).toBe("2027-03-01");
    expect(careNextDue(feed, "2027-03-01", true)).toBe("2026-11-03");
    expect(careNextDue(feed, "2026-11-05", false)).toBe("2026-11-03");
    expect(careNote(feed, "2026-11-05", true)).toMatch(/^Winterpause/);
  });

  it("notes the rain before the winter", () => {
    expect(careNote(task({ rainSkippedOn: "2026-12-02" }), "2026-12-02", true)).toBe("Heute hat der Regen gegossen.");
    expect(careNote(task({ rainSkippedOn: "2026-12-02" }), "2026-12-03", true)).toBe("Winter: seltener gießen, alle 6 Tage.");
    expect(careNote(task(), "2026-06-03", true)).toBeNull();
  });
});

describe("weather", () => {
  it("lets rain water outdoor watering only", () => {
    expect(rainWaters(task({ outdoor: true }), day("2026-05-01", 8, 5))).toBe(true);
    expect(rainWaters(task({ outdoor: true }), day("2026-05-01", 8, 4.9))).toBe(false);
    expect(rainWaters(task(), day("2026-05-01", 8, 20))).toBe(false);
    expect(rainWaters(task({ outdoor: true, actionType: "Düngen" }), day("2026-05-01", 8, 20))).toBe(false);
    expect(rainWaters(task({ outdoor: true }), null)).toBe(false);
  });

  it("finds the coldest frost night in the next three days", () => {
    expect(frostAhead([day("a", 2), day("b", 1), day("c", 3), day("d", -8)])).toBeNull();
    expect(frostAhead([day("a", 2), day("b", -1), day("c", -3)])!.date).toBe("c");
  });
});
