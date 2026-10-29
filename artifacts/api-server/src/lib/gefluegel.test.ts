/**
 * Gänse, Enten, Puten, Wachteln (docs/gefluegel.md) across the modules:
 * names, ration and needs, brood, duties, weather, medicines, pasture worms,
 * the garden and the plant archive.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { FARM_SPECIES } = await import("@workspace/db");
const { NAMES } = await import("./farmAnimals");
const { feedByKey } = await import("./feedCatalog");
const { checkRation, needFor } = await import("./feedNeeds");
const { START_RATIONS } = await import("./farmSetup");
const { BREEDING } = await import("./breeding");
const { weatherWarnings } = await import("./farmWeather");
const { COLD_RULES } = await import("./feedWeather");
const { dutiesFor } = await import("./farmDuties");
const { withdrawalFor } = await import("./medicines");
const { FODDER_CROPS, FODDER_KG_PER_DAY } = await import("./gardenAssistant");
const { archiveKindFor } = await import("./farmAi");
const { POULTRY_SPECIES, isPoultry } = await import("./species");

const NEW = ["goose", "duck", "turkey", "quail"] as const;
const item = (key: string, grams: number) => ({ ...feedByKey(key)!, grams });

describe("Gänse, Enten, Puten, Wachteln", () => {
  it("are species of their own and count as poultry", () => {
    for (const s of NEW) {
      expect(FARM_SPECIES).toContain(s);
      expect(isPoultry(s)).toBe(true);
    }
    expect(POULTRY_SPECIES).toContain("poultry");
    expect(isPoultry("goat")).toBe(false);
    expect([NAMES.goose.group, NAMES.duck.group, NAMES.turkey.group, NAMES.quail.group]).toEqual(["Gänse", "Enten", "Puten", "Wachteln"]);
  });

  it("start on a ration that fits their needs", () => {
    for (const s of NEW) {
      const start = START_RATIONS[s]!;
      const { checks } = checkRation(s, needFor(s, start.stage)!, start.items.map(([k, g]) => item(k, g)));
      expect(checks.filter((c) => c.status !== "ok"), s).toEqual([]);
    }
  });

  it("flag a quail fed on grains alone", () => {
    const { checks } = checkRation("quail", needFor("quail", "laying")!, [item("koernermix", 25)]);
    expect(checks.find((c) => c.nutrient === "crudeProtein")).toMatchObject({ status: "low", tip: expect.stringMatching(/Wachteln brauchen/) });
  });

  it("brood for their own number of days", () => {
    expect([BREEDING.goose!.days, BREEDING.duck!.days, BREEDING.turkey!.days, BREEDING.quail!.days]).toEqual([30, 28, 28, 17]);
    for (const s of NEW) expect(BREEDING[s]!.kind).toBe("incubation");
    expect(BREEDING.goose!.young).toBe("Gössel");
    expect(BREEDING.duck!.steps[0]![1]).toMatch(/35 Tage/);
  });

  it("have the poultry duties – Newcastle only for chickens and turkeys, bathing water for waterfowl", () => {
    const keys = (s: (typeof FARM_SPECIES)[number]) => dutiesFor([s], [], new Map(), "2026-10-29").map((d) => d.key);
    for (const s of NEW) expect(keys(s), s).toEqual(expect.arrayContaining(["registration", "stock_register", "avian_flu"]));
    expect(keys("turkey")).toEqual(expect.arrayContaining(["nd_vaccination", "turkey_blackhead"]));
    expect(keys("goose")).not.toContain("nd_vaccination");
    expect(keys("duck")).toContain("waterfowl_water");
    expect(keys("quail")).toEqual(expect.arrayContaining(["quail_keeping"]));
    expect(keys("quail")).not.toContain("waterfowl_water");
  });

  it("get frost notes of their own", () => {
    const frost = [{ date: "2026-12-01", minTemp: -4, maxTemp: 1, precipitationMm: 0, maxGustKmh: 20, icon: "sun" as const }];
    expect(weatherWarnings(frost, ["duck"], false)[0]!.text).toMatch(/Badewasser täglich eisfrei/);
    expect(weatherWarnings(frost, ["quail"], false)[0]!.text).toMatch(/Wachteln zugfrei/);
    expect(weatherWarnings(frost, ["poultry"], false)[0]!.text).not.toMatch(/Badewasser|Wachteln/);
    expect(COLD_RULES.goose!.limit).toBeLessThan(COLD_RULES.quail!.limit);
  });

  it("are food-producing: meat and egg withdrawal count", () => {
    for (const s of NEW) expect(withdrawalFor({ withdrawalMeatDays: 7, withdrawalMilkDays: null, withdrawalEggsDays: 10 }, s)).toBe(10);
  });

  it("use the archive's Geflügel and get greens from the garden", () => {
    for (const s of NEW) {
      expect(archiveKindFor(s)).toBe("poultry");
      expect(FODDER_KG_PER_DAY[s]).toBeGreaterThan(0);
      expect(FODDER_CROPS[s].length).toBeGreaterThan(0);
    }
  });
});
