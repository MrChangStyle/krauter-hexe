import { describe, expect, it } from "vitest";
import { formatRange, formatValue, grams, light, lightText } from "./feed-labels";

describe("feed labels", () => {
  it("turns a check into a traffic light", () => {
    expect(light({ status: "ok", severe: false })).toBe("green");
    expect(light({ status: "low", severe: false })).toBe("yellow");
    expect(light({ status: "high", severe: true })).toBe("red");
    expect(lightText({ status: "low", severe: true })).toBe("zu wenig");
    expect(lightText({ status: "high", severe: false })).toBe("zu viel");
  });

  it("formats values and ranges in German", () => {
    expect(formatValue({ nutrient: "calcium", value: 27.6 })).toBe("27,6 g/kg");
    expect(formatValue({ nutrient: "amount", value: 0.1056 })).toBe("0,106 kg");
    expect(formatRange({ nutrient: "crudeProtein", min: 17, max: 21 })).toBe("17–21");
    expect(formatRange({ nutrient: "copper", min: 0, max: 15 })).toBe("bis 15");
    expect(grams(120)).toBe("120 g");
    expect(grams(1700)).toBe("1,7 kg");
  });
});
