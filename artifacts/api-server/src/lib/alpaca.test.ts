/**
 * Alpakas (docs/alpaka.md) across the modules: names, ration, needs, breeding,
 * weaning, pasture worms, weather, duties, medicines and the garden.
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
const { START_RATIONS, ALPACA_TASKS } = await import("./farmSetup");
const { BREEDING } = await import("./breeding");
const { CYCLES, WEANING } = await import("./breedingCycle");
const { parasiteHint } = await import("./pastureCare");
const { weatherWarnings } = await import("./farmWeather");
const { COLD_RULES } = await import("./feedWeather");
const { dutiesFor } = await import("./farmDuties");
const { withdrawalFor } = await import("./medicines");
const { FODDER_CROPS, FODDER_KG_PER_DAY } = await import("./gardenAssistant");
const { DIET } = await import("./farmAi");

const item = (key: string, grams: number) => ({ ...feedByKey(key)!, grams });

describe("Alpakas", () => {
  it("are a species with names for one and a group", () => {
    expect(FARM_SPECIES).toContain("alpaca");
    expect(NAMES.alpaca).toEqual({ one: "Alpaka", group: "Alpakas", prefix: "A" });
    expect(DIET.alpaca).toBe("herbivore");
  });

  it("start on hay and alpaca minerals, and that ration fits their needs", () => {
    const start = START_RATIONS.alpaca!;
    expect(start.items).toEqual([["heu", 1500], ["mineral_alpaka", 10]]);
    expect(feedByKey("mineral_alpaka")!.forSpecies).toEqual(["alpaca"]);
    const { checks } = checkRation("alpaca", needFor("alpaca", "maintenance")!, start.items.map(([k, g]) => item(k, g)));
    expect(checks.filter((c) => c.status !== "ok")).toEqual([]);
  });

  it("get fat on concentrate: too little fibre is flagged with an alpaca tip", () => {
    const { checks } = checkRation("alpaca", needFor("alpaca", "maintenance")!, [item("heu", 600), item("hafer", 600)]);
    const fibre = checks.find((c) => c.nutrient === "crudeFibre")!;
    expect(fibre.status).toBe("low");
    expect(fibre.tip).toMatch(/verfetten/);
  });

  it("get the usual care as stall tasks", () => {
    expect(ALPACA_TASKS.map((t) => [t.actionType, t.intervalValue, t.intervalUnit])).toEqual([
      ["Klauen-/Hufpflege", 3, "Monate"],
      ["Gesundheitskontrolle", 4, "Monate"],
      ["Sonstiges", 12, "Monate"],
    ]);
  });

  it("carry about 11.5 months, with a spit test, and have no heat to watch", () => {
    const rule = BREEDING.alpaca!;
    expect(rule.days).toBe(345);
    expect(rule.young).toBe("Cria");
    expect(rule.steps[0]![1]).toMatch(/Spucktest/);
    expect(CYCLES.alpaca).toBeUndefined();
    expect(WEANING.alpaca![0]).toBe(180);
  });

  it("share worms with sheep and goats, and get the tip about their dung piles", () => {
    const before = { id: 1, pastureId: 1, label: "Schafe", species: "sheep" as const, startOn: "2026-05-01", endOn: "2026-05-20" };
    const now = { id: 2, pastureId: 1, label: "Alpakas", species: "alpaca" as const, startOn: "2026-06-10", endOn: null };
    const hint = parasiteHint("Hang", 1, now, [before, now])!;
    expect(hint.text).toMatch(/^Auf Hang standen Schafe schon bis 20\.05\./);
    expect(hint.text).toMatch(/Kothaufen ein- bis zweimal die Woche absammeln\.$/);
  });

  it("suffer from heat early, cope with cold", () => {
    const hot = [{ date: "2026-07-01", minTemp: 15, maxTemp: 31, precipitationMm: 0, maxGustKmh: 20, icon: "sun" as const }];
    expect(weatherWarnings(hot, ["alpaca"], false)[0]!.text).toMatch(/Alpakas leiden früh unter Hitze/);
    expect(weatherWarnings(hot, ["goat"], false)[0]!.text).not.toMatch(/Alpakas/);
    expect(COLD_RULES.alpaca!.limit).toBe(-10);
  });

  it("are registered with the veterinary office; the Tierseuchenkasse depends on the Land", () => {
    const keys = dutiesFor(["alpaca"], [], new Map(), "2026-10-26").map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(["registration", "stock_register", "catering_waste", "alpaca_tsk", "alpaca_herd"]));
    expect(keys).not.toContain("tsk_report");
    expect(keys).not.toContain("hit_report");
  });

  it("are food-producing: the meat withdrawal counts", () => {
    expect(withdrawalFor({ withdrawalMeatDays: 28, withdrawalMilkDays: 5, withdrawalEggsDays: null }, "alpaca")).toBe(28);
  });

  it("get a little root fodder from the garden", () => {
    expect(FODDER_KG_PER_DAY.alpaca).toBeGreaterThan(0);
    expect(FODDER_CROPS.alpaca).toContain("moehre");
  });
});
