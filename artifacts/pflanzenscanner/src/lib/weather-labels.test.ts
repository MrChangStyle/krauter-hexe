import { describe, expect, it } from "vitest";
import { alertWindow, berlinToday, dayLabel, tempText } from "./weather-labels";

describe("weather labels", () => {
  it("names the days and rounds temperatures", () => {
    expect(dayLabel("2026-12-01", "2026-12-01")).toBe("Heute");
    expect(dayLabel("2026-12-02", "2026-12-01")).toBe("Morgen");
    expect(dayLabel("2026-12-03", "2026-12-01")).toBe("Do");
    expect(tempText(-3.6)).toBe("−4°");
    expect(tempText(12.4)).toBe("12°");
    expect(berlinToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("alertWindow", () => {
  it("says from when to when a warning holds, in Berlin time", () => {
    expect(alertWindow("2026-12-01T14:00:00+01:00", "2026-12-01T20:00:00+01:00", "2026-12-01")).toBe("Heute 14:00 – 20:00");
    expect(alertWindow("2026-12-01T22:00:00+01:00", "2026-12-02T03:00:00+01:00", "2026-12-01")).toBe("Heute 22:00 – Morgen 03:00");
    // UTC from the service, summer time in Berlin.
    expect(alertWindow("2026-07-01T04:00:00Z", null, "2026-06-30")).toBe("ab Morgen 06:00");
  });
});
