import { describe, expect, it } from "vitest";
import { berlinToday, dayLabel, tempText } from "./weather-labels";

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
