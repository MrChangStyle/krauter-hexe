import { describe, expect, it } from "vitest";
import { bales, euro, lines, formatRange, formatValue, grams, kg, light, lightText, rationName, shareText, shortDate } from "./feed-labels";

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

  it("names seasonal rations and the steps of a change", () => {
    expect(rationName("winter")).toBe("Winterration");
    expect(rationName("all")).toBe("Ration");
    expect(shortDate("2026-10-22")).toBe("22.10.");
    expect(shareText(0.75)).toBe("75 %");
  });

  it("formats money, weights and bales", () => {
    expect(euro(2.9)).toBe("2,90 €");
    expect(kg(1.75)).toBe("1,8 kg");
    expect(kg(241.6)).toBe("242 kg");
    expect(kg(0.025)).toBe("25 g");
    expect(kg(0)).toBe("0 kg");
    expect(bales(241.6)).toBe(17);
  });

  it("splits recipe text into lines", () => {
    expect(lines(" Einweichen \n\n  Spülen\n")).toEqual(["Einweichen", "Spülen"]);
  });
});
