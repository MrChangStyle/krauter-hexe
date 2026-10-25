import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { coldBoost } = await import("./feedWeather");

const day = (date: string, minTemp: number) => ({ date, minTemp, maxTemp: minTemp + 6, precipitationMm: 0, maxGustKmh: 20, icon: "cloud" as const });
const week = (lows: number[]) => lows.map((t, i) => day(`2027-01-0${i + 1}`, t));
const hay = { name: "Wiesenheu", grams: 2000, category: "roughage" as const };
const grain = { name: "Hafer", grams: 300, category: "grain" as const };

describe("Wetter im Futterplaner", () => {
  it("adds about 1 % per degree below the species' limit, from the coldest of the next three days", () => {
    // Goat: limit 0 °C, coldest −8 °C on the 2nd → 8 % more hay; the −20 °C on day 4 is too far ahead.
    expect(coldBoost("goat", [hay, grain], week([-3, -8, -1, -20]))).toEqual({
      date: "2027-01-02",
      minTemp: -8,
      percent: 8,
      extra: [{ name: "Wiesenheu", grams: 160 }],
      text: "Kälte bis −8 °C: etwa 8 % mehr Heu: +160 g Wiesenheu je Tier und Tag.",
    });
    // Poultry: limit 5 °C, grain and compound feed.
    expect(coldBoost("poultry", [{ name: "Legemehl", grams: 120, category: "compound" }], week([-5]))).toMatchObject({ percent: 10, extra: [{ name: "Legemehl", grams: 12 }] });
  });

  it("says nothing while it stays above the limit, or for animals without a rule", () => {
    // Horse: −10 °C is still fine with a winter coat.
    expect(coldBoost("horse", [hay], week([-10, -5]))).toBeNull();
    expect(coldBoost("horse", [hay], week([-12]))).toMatchObject({ percent: 2 });
    expect(coldBoost("guineaPig", [hay], week([-15]))).toBeNull();
    expect(coldBoost("goat", [hay], [])).toBeNull();
  });

  it("stops at 25 % – then the shelter matters more – and asks for hay when the ration has none", () => {
    const hard = coldBoost("goat", [hay], week([-30]))!;
    expect(hard.percent).toBe(25);
    expect(hard.text).toMatch(/trockener, zugfreier Stall/);
    expect(coldBoost("rabbit", [{ name: "Pellets", grams: 50, category: "compound" }], week([-6]))).toMatchObject({
      extra: [],
      text: "Kälte bis −6 °C: etwa 6 % mehr Heu – die Ration enthält kein Heu, bitte ergänzen.",
    });
  });
});
