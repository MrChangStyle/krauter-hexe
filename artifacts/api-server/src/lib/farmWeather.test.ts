import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { daysFromHours, pickAlerts, weatherWarnings } = await import("./farmWeather");

type Day = Parameters<typeof weatherWarnings>[0][number];
const day = (date: string, over: Partial<Day> = {}): Day => ({ date, minTemp: 5, maxTemp: 15, precipitationMm: 2, maxGustKmh: 30, icon: "cloud", ...over });

/** 24 hourly records of one day with Bright Sky's fields. */
function hours(date: string, temp: (h: number) => number, extra: (h: number) => object = () => ({})) {
  return Array.from({ length: 24 }, (_, h) => ({
    timestamp: `${date}T${String(h).padStart(2, "0")}:00:00+01:00`,
    temperature: temp(h),
    precipitation: 0,
    wind_gust_speed: 20,
    icon: "clear-day",
    ...extra(h),
  }));
}

describe("forecast", () => {
  it("sums up the hours of each Berlin day", () => {
    const records = [
      ...hours("2026-12-01", (h) => -4 + h * 0.5, (h) => (h >= 10 && h <= 14 ? { icon: "snow", precipitation: 0.4 } : {})),
      ...hours("2026-12-02", () => 3, (h) => ({ icon: "cloudy", wind_gust_speed: h === 15 ? 82.4 : 30 })),
      ...hours("2026-12-03", () => 2).slice(0, 6),
    ];
    expect(daysFromHours(records, "2026-12-01")).toEqual([
      { date: "2026-12-01", minTemp: -4, maxTemp: 7.5, precipitationMm: 2, maxGustKmh: 20, icon: "snow" },
      { date: "2026-12-02", minTemp: 3, maxTemp: 3, precipitationMm: 0, maxGustKmh: 82, icon: "cloud" },
    ]);
  });
});

describe("weather warnings", () => {
  it("warns about frost for the animals, with what to do", () => {
    const w = weatherWarnings([day("2026-12-01", { minTemp: -1 }), day("2026-12-02", { minTemp: -4.5 })], ["poultry", "guineaPig"], false);
    expect(w).toEqual([
      {
        kind: "frost",
        date: "2026-12-02",
        text: "Frost bis −4,5 °C (morgen): Tränken frostfrei halten – mehrmals am Tag frisches Wasser, Einstreu dicker. Meerschweinchen frostfrei unterbringen.",
      },
    ]);
    expect(weatherWarnings([day("2026-12-01", { minTemp: -12 })], ["rabbit"], false)[0]).toMatchObject({ kind: "hardFrost", text: expect.stringMatching(/^Strenger Frost bis −12 °C \(heute\).*Kaninchen/) });
  });

  it("knows that rabbits suffer from heat earlier", () => {
    const warm = [day("2026-07-01", { maxTemp: 28.5 }), day("2026-07-02")];
    expect(weatherWarnings(warm, ["poultry"], false)).toEqual([]);
    expect(weatherWarnings(warm, ["rabbit", "goat"], false)[0]!.text).toMatch(/^Hitze bis 28,5 °C \(heute\).*Kaninchen und Meerschweinchen.*Weidetiere/);
  });

  it("warns about storm and heavy rain, and tells the garden to water when it is hot and dry", () => {
    const w = weatherWarnings([day("2026-07-01", { maxTemp: 31, precipitationMm: 0 }), day("2026-07-02", { maxGustKmh: 90, precipitationMm: 0.5 })], ["sheep"], true);
    expect(w.map((x) => [x.kind, x.date])).toEqual([["heat", "2026-07-01"], ["storm", "2026-07-02"], ["dry", "2026-07-01"]]);
    expect(weatherWarnings([day("2026-07-01", { precipitationMm: 25 }), day("2026-07-02")], ["horse"], true).map((x) => x.kind)).toEqual(["rain"]);
  });

  it("warns once about a spell of three or more frost or hot days, instead of the single day", () => {
    // Frost from tomorrow for three days, then mild: a spell until Friday.
    const week = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07"];
    const frost = week.map((d, i) => day(d, { minTemp: i >= 1 && i <= 3 ? -2 - i : 2 }));
    const w = weatherWarnings(frost, ["goat"], false);
    expect(w).toEqual([
      { kind: "frostSpell", date: "2026-12-02", text: expect.stringMatching(/^Frostperiode: 3 Tage in Folge Frost bis −5 °C \(bis Fr 04\.12\.\): Tränken mehrmals/) },
    ]);
    // Two frost days are no spell; a spell starting only in three days is not yet one.
    expect(weatherWarnings(week.map((d, i) => day(d, { minTemp: i < 2 ? -1 : 3 })), ["goat"], false).map((x) => x.kind)).toEqual(["frost"]);
    expect(weatherWarnings(week.map((d, i) => day(d, { minTemp: i >= 3 ? -1 : 3 })), ["goat"], false)).toEqual([]);
    // Hard frost still comes on its own.
    expect(weatherWarnings(week.map((d) => day(d, { minTemp: -12 })), ["goat"], false).map((x) => x.kind)).toEqual(["frostSpell", "hardFrost"]);
    // A heat wave for the whole week.
    const hot = weatherWarnings(week.map((d) => day(d, { maxTemp: 32 })), ["rabbit"], false);
    expect(hot.map((x) => x.kind)).toEqual(["heatSpell"]);
    expect(hot[0]!.text).toMatch(/^Hitzewelle: 7 Tage in Folge bis 32 °C \(bis Mo 07\.12\. und länger\):.*Kaninchen/);
  });

  it("says nothing about animals on a farm without animals, and nothing on mild days", () => {
    expect(weatherWarnings([day("2026-12-01", { minTemp: -5 }), day("2026-12-02")], [], true)).toEqual([]);
    expect(weatherWarnings([day("2026-05-01"), day("2026-05-02")], ["cattle"], true)).toEqual([]);
  });
});

describe("official DWD warnings", () => {
  const rec = (id: string, over: Record<string, unknown> = {}) =>
    ({
      alert_id: id,
      status: "actual",
      onset: "2026-12-01T14:00:00+01:00",
      expires: "2026-12-01T20:00:00+01:00",
      category: "met",
      response_type: "prepare",
      severity: "moderate",
      event_code: 31,
      event_de: "GEWITTER",
      headline_de: "Amtliche WARNUNG vor GEWITTER",
      description_de: "Es treten Gewitter auf.",
      instruction_de: "",
      ...over,
    }) as Parameters<typeof pickAlerts>[0][number];
  const now = new Date("2026-12-01T12:00:00+01:00");

  it("keeps real weather and heat warnings that are not over, the worst first", () => {
    const picked = pickAlerts(
      [
        rec("gewitter"),
        rec("hitze", { category: "health", severity: "severe", event_de: "STARKE HITZE", onset: "2026-12-01T16:00:00+01:00" }),
        rec("test", { status: "test" }),
        rec("entwarnung", { response_type: "allclear" }),
        rec("vorbei", { expires: "2026-12-01T11:00:00+01:00" }),
        rec("offen", { expires: null, severity: "minor" }),
        rec("ohne", { severity: null }),
      ],
      now,
    );
    expect(picked.map((a) => a.id)).toEqual(["hitze", "gewitter", "offen"]);
    // An empty instruction counts as none.
    expect(picked[1]).toEqual({
      id: "gewitter",
      event: "GEWITTER",
      headline: "Amtliche WARNUNG vor GEWITTER",
      description: "Es treten Gewitter auf.",
      instruction: null,
      severity: "moderate",
      onset: "2026-12-01T14:00:00+01:00",
      expires: "2026-12-01T20:00:00+01:00",
    });
  });
});
