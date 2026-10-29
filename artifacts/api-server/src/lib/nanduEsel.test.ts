/**
 * Nandus und Esel (docs/nandu-esel.md) across the modules: names, ration and
 * needs, breeding, duties, weather, medicines, pasture worms and the archive.
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
const { START_RATIONS, DONKEY_TASKS } = await import("./farmSetup");
const { BREEDING } = await import("./breeding");
const { CYCLES, WEANING } = await import("./breedingCycle");
const { parasiteHint } = await import("./pastureCare");
const { weatherWarnings } = await import("./farmWeather");
const { dutiesFor } = await import("./farmDuties");
const { withdrawalFor } = await import("./medicines");
const { archiveKindFor } = await import("./farmAi");
const { isPoultry } = await import("./species");

const item = (key: string, grams: number) => ({ ...feedByKey(key)!, grams });
const keys = (s: "rhea" | "donkey") => dutiesFor([s], [], new Map(), "2026-10-29").map((d) => d.key);

describe("Nandus", () => {
  it("are a species and count as poultry (Laufvögel)", () => {
    expect(FARM_SPECIES).toContain("rhea");
    expect(NAMES.rhea).toEqual({ one: "Nandu", group: "Nandus", prefix: "NA" });
    expect(isPoultry("rhea")).toBe(true);
    expect(archiveKindFor("rhea")).toBe("poultry");
  });

  it("start on a ration that fits their needs", () => {
    const start = START_RATIONS.rhea!;
    const { checks } = checkRation("rhea", needFor("rhea", start.stage)!, start.items.map(([k, g]) => item(k, g)));
    expect(checks.filter((c) => c.status !== "ok")).toEqual([]);
  });

  it("brood about 36 days, eggs weighed instead of candled", () => {
    expect(BREEDING.rhea).toMatchObject({ kind: "incubation", days: 36, young: "Nandu-Küken" });
    expect(BREEDING.rhea!.steps[0]![1]).toMatch(/wiegen/);
  });

  it("are registered as poultry, with the avian flu rules and a note on permits", () => {
    expect(keys("rhea")).toEqual(expect.arrayContaining(["registration", "stock_register", "avian_flu", "rhea_permit", "rhea_group"]));
    expect(keys("rhea")).not.toContain("nd_vaccination");
  });
});

describe("Esel", () => {
  it("are a species with names, eating like horses", () => {
    expect(FARM_SPECIES).toContain("donkey");
    expect(NAMES.donkey.group).toBe("Esel");
    expect(archiveKindFor("donkey")).toBe("horse");
    expect(isPoultry("donkey")).toBe(false);
  });

  it("start on straw and hay that fit their low needs, and protein-rich hay alone is flagged", () => {
    const start = START_RATIONS.donkey!;
    const { checks } = checkRation("donkey", needFor("donkey", start.stage)!, start.items.map(([k, g]) => item(k, g)));
    expect(checks.filter((c) => c.status !== "ok")).toEqual([]);
    const lucerne = checkRation("donkey", needFor("donkey", "maintenance")!, [item("luzerneheu", 3500)]).checks;
    expect(lucerne.find((c) => c.nutrient === "crudeProtein")).toMatchObject({ status: "high", tip: expect.stringMatching(/Esel brauchen sehr wenig Eiweiß/) });
  });

  it("get hooves, a faecal sample and the teeth as tasks", () => {
    expect(DONKEY_TASKS.map((t) => t.intervalValue)).toEqual([8, 4, 12]);
  });

  it("carry about twelve months, with a heat to watch and late weaning", () => {
    expect(BREEDING.donkey).toMatchObject({ kind: "pregnancy", days: 365, young: "Eselfohlen" });
    expect(CYCLES.donkey!.cycleDays).toBe(23);
    expect(WEANING.donkey![0]).toBe(210);
  });

  it("need an Equidenpass, company and the TSK like horses", () => {
    expect(keys("donkey")).toEqual(expect.arrayContaining(["registration", "equine_pass", "donkey_company"]));
  });

  it("share worms with horses", () => {
    const before = { id: 1, pastureId: 1, label: "Pferde", species: "horse" as const, startOn: "2026-05-01", endOn: "2026-05-20" };
    const now = { id: 2, pastureId: 1, label: "Esel", species: "donkey" as const, startOn: "2026-06-10", endOn: null };
    expect(parasiteHint("Koppel", 1, now, [before, now])!.text).toMatch(/^Auf Koppel standen Pferde schon bis 20\.05\./);
  });

  it("get a note on rain: their coat is not waterproof", () => {
    const wet = [{ date: "2026-10-01", minTemp: 8, maxTemp: 12, precipitationMm: 30, maxGustKmh: 20, icon: "rain" as const }];
    expect(weatherWarnings(wet, ["donkey"], false).find((w) => w.kind === "rain")!.text).toMatch(/kein wasserdichtes Fell/);
    expect(weatherWarnings(wet, ["horse"], false).find((w) => w.kind === "rain")!.text).not.toMatch(/Esel/);
  });

  it("are food-producing: meat withdrawal counts", () => {
    expect(withdrawalFor({ withdrawalMeatDays: 28, withdrawalMilkDays: null, withdrawalEggsDays: null }, "donkey")).toBe(28);
  });
});
