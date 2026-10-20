import { describe, expect, it } from "vitest";

import { currentPhase, defaultFlowerWeeks, flowerStart, kcangCheck, phases, plantPlan, steps, targets, type GrowForPlan, type PlantForPlan } from "./growPlan";

const photo = { strainType: "hybrid" as const, flowering: "photo" as const, seedSex: "feminized" as const, flowerWeeks: 9, startedOn: "2026-03-01", flipOn: null, harvestedOn: null };
const auto = { ...photo, strainType: "ruderalis" as const, flowering: "auto" as const, flowerWeeks: 7 };
const tent = { environment: "indoor" as const, medium: "soil" as const };
const garden = { environment: "outdoor" as const, medium: "soil" as const };

describe("Grow-Plan – timing", () => {
  it("knows the usual flowering weeks", () => {
    expect(defaultFlowerWeeks("indica", "photo")).toBe(8);
    expect(defaultFlowerWeeks("sativa", "photo")).toBe(11);
    expect(defaultFlowerWeeks("sativa", "auto")).toBe(7);
  });

  it("starts flowering by the light indoors, by the season outdoors, by itself for autoflowers", () => {
    // Indoors: 19 days to the end of the seedling phase + 4 weeks of growth.
    expect(flowerStart(photo, tent)).toBe("2026-04-17");
    expect(flowerStart({ ...photo, flipOn: "2026-04-30" }, tent)).toBe("2026-04-30");
    expect(flowerStart(photo, garden)).toBe("2026-08-01");
    expect(flowerStart(photo, { ...garden, environment: "greenhouse" })).toBe("2026-07-25");
    expect(flowerStart(auto, garden)).toBe("2026-04-10");
    // Started late outdoors: at least three weeks of growth.
    expect(flowerStart({ ...photo, startedOn: "2026-07-20" }, garden)).toBe("2026-08-29");
  });

  it("lines the phases up without gaps", () => {
    const { phases: list, harvestOn } = phases(photo, tent);
    expect(list.map((p) => p.key)).toEqual(["germination", "seedling", "veg", "flower", "flush", "drying", "curing"]);
    expect(harvestOn).toBe("2026-06-19");
    for (let k = 1; k < list.length; k++) {
      const prev = new Date(`${list[k - 1]!.to}T12:00:00Z`).getTime();
      expect(new Date(`${list[k]!.from}T12:00:00Z`).getTime() - prev, list[k]!.key).toBe(86_400_000);
    }
    // Flushing: the last 10 days in soil, 7 in coco.
    expect(list.find((p) => p.key === "flush")).toEqual({ key: "flush", from: "2026-06-09", to: "2026-06-18" });
    expect(phases(photo, { ...tent, medium: "coco" }).phases.find((p) => p.key === "flush")!.from).toBe("2026-06-12");
  });

  it("uses the real harvest day once there is one", () => {
    const early = phases({ ...photo, harvestedOn: "2026-06-05" }, tent);
    expect(early.harvestOn).toBe("2026-06-05");
    expect(early.phases.map((p) => p.key)).not.toContain("flush");
    expect(early.phases.find((p) => p.key === "drying")!.from).toBe("2026-06-05");
  });

  it("finds today's phase", () => {
    const { phases: list } = phases(photo, tent);
    expect(currentPhase(list, "2026-03-02")).toBe("germination");
    expect(currentPhase(list, "2026-04-01")).toBe("veg");
    expect(currentPhase(list, "2026-05-01")).toBe("flower");
    expect(currentPhase(list, "2026-08-30")).toBe("done");
  });
});

describe("Grow-Plan – targets and steps", () => {
  it("sets the light and the pH by grow and medium", () => {
    expect(targets("veg", photo, tent).light).toMatch(/^18\/6/);
    expect(targets("flower", photo, tent).light).toMatch(/^12\/12/);
    expect(targets("flower", auto, tent).light).toMatch(/^20\/4/);
    expect(targets("veg", photo, garden).light).toMatch(/Natürliches Licht/);
    expect(targets("veg", photo, tent).ph).toEqual([6.2, 6.8]);
    expect(targets("veg", photo, { ...tent, medium: "hydro" }).ph).toEqual([5.6, 6.0]);
    expect(targets("flush", photo, tent).ec).toEqual([0, 0.4]);
    expect(targets("drying", photo, tent).ph).toBeNull();
  });

  it("tops photoperiodic plants, never autoflowers, and switches the light only indoors", () => {
    const texts = (p: PlantForPlan, g: GrowForPlan) => steps(p, g, "2026-03-01").map((s) => s.text);
    expect(texts(photo, tent).some((t) => t.startsWith("Toppen"))).toBe(true);
    expect(texts(auto, tent).some((t) => t.startsWith("Toppen"))).toBe(false);
    expect(texts(photo, tent).some((t) => t.startsWith("Licht auf 12/12"))).toBe(true);
    expect(texts(photo, garden).some((t) => t.startsWith("Licht auf 12/12"))).toBe(false);
    expect(texts(photo, garden).some((t) => t.includes("Eisheiligen"))).toBe(true);
    expect(texts(photo, garden).some((t) => t.includes("Schimmel"))).toBe(true);
    // Regular seeds: check the sex.
    expect(texts(photo, tent).some((t) => t.startsWith("Geschlecht"))).toBe(false);
    expect(texts({ ...photo, seedSex: "regular" }, tent).some((t) => t.startsWith("Geschlecht"))).toBe(true);
  });

  it("sorts the steps and marks the past ones", () => {
    const list = steps(photo, tent, "2026-04-01");
    expect(list.map((s) => s.on)).toEqual([...list.map((s) => s.on)].sort());
    expect(list[0]).toMatchObject({ on: "2026-03-01", past: true });
    expect(list.at(-1)!.past).toBe(false);
  });

  it("warns about late outdoor starts", () => {
    expect(plantPlan({ ...photo, startedOn: "2026-07-10" }, garden, "2026-07-10").hints[0]).toMatch(/^Spät gestartet/);
    expect(plantPlan({ ...photo, strainType: "sativa", flowerWeeks: 12 }, garden, "2026-03-01").hints.some((h) => h.includes("Schimmelgefahr"))).toBe(true);
    expect(plantPlan(photo, tent, "2026-04-01")).toMatchObject({ current: "veg", day: 32, harvestOn: "2026-06-19", flipOn: "2026-04-17", hints: [] });
  });
});

describe("KCanG check", () => {
  it("allows 3 plants and 50 g at home per adult", () => {
    expect(kcangCheck(3, 1, 40)).toMatchObject({ maxPlants: 3, plantsOver: false, maxGrams: 50, gramsOver: false });
    expect(kcangCheck(4, 1, 60)).toMatchObject({ plantsOver: true, gramsOver: true });
    expect(kcangCheck(5, 2, 60)).toMatchObject({ maxPlants: 6, plantsOver: false, maxGrams: 100, gramsOver: false });
  });
});
