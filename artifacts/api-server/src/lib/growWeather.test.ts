import { describe, expect, it, vi } from "vitest";

import type { DayForecast } from "./farmWeather";
import type { PhaseKey } from "./growPlan";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { growDigestMessage, growWeatherWarnings } = await import("./growWeather");

const day = (date: string, d: Partial<DayForecast> = {}): DayForecast => ({ date, minTemp: 10, maxTemp: 22, precipitationMm: 0, maxGustKmh: 20, icon: "sun", ...d });
const always = (...keys: PhaseKey[]) => () => keys;

describe("Grow – weather warnings", () => {
  it("warns about frost, heat, storm and rain in the bloom outdoors", () => {
    const days = [day("2026-05-12", { minTemp: 1 }), day("2026-05-13", { maxTemp: 33, maxGustKmh: 70, precipitationMm: 8 })];
    expect(growWeatherWarnings(days, "outdoor", always("veg")).map((w) => [w.kind, w.date])).toEqual([
      ["frost", "2026-05-12"],
      ["heat", "2026-05-13"],
      ["storm", "2026-05-13"],
    ]);
    expect(growWeatherWarnings(days, "outdoor", always("flower")).map((w) => w.kind)).toContain("rain");
    expect(growWeatherWarnings(days, "outdoor", always("veg"))[0]!.text).toMatch(/^Frostgefahr heute nacht \(1 °C\)/);
  });

  it("warns earlier about heat in the greenhouse, never about wind and rain there", () => {
    const days = [day("2026-07-01", { maxTemp: 29, maxGustKmh: 80, precipitationMm: 20 })];
    expect(growWeatherWarnings(days, "greenhouse", always("flower")).map((w) => w.kind)).toEqual(["heat"]);
    expect(growWeatherWarnings(days, "outdoor", always("flower")).map((w) => w.kind)).toEqual(["storm", "rain"]);
  });

  it("stays quiet indoors, without plants outside and beyond tomorrow", () => {
    const frost = [day("2026-10-20", { minTemp: -2 })];
    expect(growWeatherWarnings(frost, "indoor", always("veg"))).toEqual([]);
    expect(growWeatherWarnings(frost, "outdoor", always("germination", "drying", "done"))).toEqual([]);
    expect(growWeatherWarnings([day("2026-10-20"), day("2026-10-21"), day("2026-10-22", { minTemp: -5 })], "outdoor", always("veg"))).toEqual([]);
    // Each kind once, the first day wins.
    expect(growWeatherWarnings([day("2026-10-20", { minTemp: 0 }), day("2026-10-21", { minTemp: -3 })], "outdoor", always("veg"))).toHaveLength(1);
  });
});

describe("Grow – push text", () => {
  const steps = [{ plant: "Lemon 1", text: "Toppen über dem 5. Nodium." }, { plant: "Lemon 2", text: "Toppen über dem 5. Nodium." }];
  const warnings = [{ kind: "frost" as const, date: "2026-05-12", text: "Frostgefahr heute nacht (1 °C): …" }];

  it("says nothing about growing on the lock screen when discreet", () => {
    expect(growDigestMessage(steps, warnings, "discreet")).toEqual({ title: "Little Farming", body: "Heute: 2 Pflegeschritte für deine Pflanzen und ein Wetterhinweis." });
    expect(growDigestMessage(steps.slice(0, 1), [], "discreet")!.body).toBe("Heute: 1 Pflegeschritt für deine Pflanzen.");
    expect(growDigestMessage([], warnings, "discreet")!.body).toBe("Heute: ein Wetterhinweis.");
    for (const m of [growDigestMessage(steps, warnings, "discreet")!]) expect(`${m.title} ${m.body}`).not.toMatch(/grow|cannabis|hanf/i);
  });

  it("lists the warnings first, then the steps when full", () => {
    expect(growDigestMessage(steps, warnings, "full")).toEqual({
      title: "Grow: Wetter und heute zu tun",
      body: "Frostgefahr heute nacht (1 °C): … · Lemon 1: Toppen über dem 5. Nodium. · Lemon 2: Toppen über dem 5. Nodium.",
    });
    expect(growDigestMessage(steps, [], "full")!.title).toBe("Grow: heute zu tun");
    expect(growDigestMessage([], [], "full")).toBeNull();
  });
});
