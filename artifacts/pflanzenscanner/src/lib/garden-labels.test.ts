import { describe, expect, it } from "vitest";
import { bedArea, bedSize, dayMonth, parseDayMonth, soilAdvice } from "@/lib/garden-labels";

describe("garden labels", () => {
  it("reads and writes day and month", () => {
    expect(dayMonth("05-15")).toBe("15.05.");
    expect(parseDayMonth("15.5.")).toBe("05-15");
    expect(parseDayMonth("3.10")).toBe("10-03");
    expect(parseDayMonth("31.4.")).toBeNull();
    expect(parseDayMonth("Mai")).toBeNull();
  });

  it("speaks the size in metres", () => {
    expect(bedSize({ lengthCm: 200, widthCm: 120, heightCm: 80, type: "raised" })).toBe("2,0 × 1,2 m, 80 cm hoch");
    expect(bedSize({ lengthCm: 450, widthCm: 125, heightCm: null, type: "bed" })).toBe("4,5 × 1,25 m");
    expect(bedArea({ lengthCm: 200, widthCm: 120 })).toBe("2,4 m²");
  });

  it("gives soil advice from finger test and pH", () => {
    expect(soilAdvice(null, null)).toEqual([]);
    const clay = soilAdvice("clay", 5.2);
    expect(clay.some((t) => t.includes("Herbst ausbringen"))).toBe(true);
    expect(clay.some((t) => t.includes("sauer"))).toBe(true);
    expect(soilAdvice("loamy", 6.5).some((t) => t.includes("passt"))).toBe(true);
    expect(soilAdvice(null, 7.8)).toEqual([expect.stringContaining("kalkhaltig")]);
  });
});
