import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { FEED_CATALOG, feedByKey } = await import("./feedCatalog");
const { FEED_NEEDS, checkRation, needFor, rationValues } = await import("./feedNeeds");
const { feedReference, fromLabel, stagesFor } = await import("./feedPlanner");

const item = (key: string, grams: number) => ({ ...feedByKey(key)!, grams });
const status = (checks: { nutrient: string; status: string; severe: boolean }[], n: string) => {
  const c = checks.find((x) => x.nutrient === n)!;
  return `${c.status}${c.severe ? "!" : ""}`;
};

describe("feed list and needs", () => {
  it("has plausible values throughout", () => {
    for (const f of FEED_CATALOG) {
      expect(f.dryMatter).toBeGreaterThan(0);
      expect(f.crudeProtein + f.crudeFat + f.crudeFibre).toBeLessThanOrEqual(100);
    }
    for (const stages of Object.values(FEED_NEEDS)) {
      for (const need of Object.values(stages!)) {
        for (const [min, max] of [need!.crudeProtein, need!.crudeFibre, need!.calcium, need!.phosphorus]) expect(min).toBeLessThan(max);
      }
    }
    expect(stagesFor("poultry")).toEqual(["maintenance", "growth", "laying", "molt", "winter"]);
    expect(stagesFor("cat")).toEqual(["maintenance"]);
    expect(feedReference().species.find((s) => s.species === "dog")).toEqual({ species: "dog", stages: ["maintenance"], hasNeeds: false });
  });

  it("works on dry matter", () => {
    // 1 kg carrots (12 % DM) and 100 g hay (86 % DM)
    const v = rationValues([item("moehre", 1000), item("heu", 100)]);
    expect(v.dmKg).toBe(0.206);
    expect(v.crudeFibre).toBe(r((0.12 * 9 + 0.086 * 30) / 0.206));
  });

  it("converts label values (as fed) to dry matter", () => {
    expect(fromLabel(88, { crudeProtein: 16.5, crudeFat: 4.4, crudeFibre: 4, calcium: 3.6, phosphorus: 0.5, copper: 15 })).toEqual({
      dryMatter: 88,
      crudeProtein: 18.75,
      crudeFat: 5,
      crudeFibre: 4.55,
      calcium: 40.91,
      phosphorus: 5.68,
      copper: 17.05,
    });
  });
});

function r(x: number) {
  return Math.round(x * 10) / 10;
}

describe("checking a ration", () => {
  it("is happy with laying hens on layer feed", () => {
    const { checks } = checkRation("poultry", needFor("poultry", "laying")!, [item("legehennen", 120)]);
    expect(checks.map((c) => `${c.nutrient}:${c.status}`)).toEqual(["amount:ok", "crudeProtein:ok", "crudeFibre:ok", "calcium:ok", "phosphorus:ok"]);
  });

  it("flags too much grain for laying hens and suggests oyster shell", () => {
    const { checks } = checkRation("poultry", needFor("poultry", "laying")!, [item("legehennen", 80), item("koernermix", 40)]);
    expect(status(checks, "calcium")).toBe("low!");
    expect(checks.find((c) => c.nutrient === "calcium")!.tip).toMatch(/Muschelkalk/);
    expect(status(checks, "crudeProtein")).toBe("low");
    expect(checks.find((c) => c.nutrient === "crudeProtein")!.tip).toMatch(/Körner höchstens ein Drittel/);
  });

  it("wants hay for rabbits", () => {
    const { checks } = checkRation("rabbit", needFor("rabbit", "maintenance")!, [item("kaninchenpellets", 80), item("moehre", 100)]);
    expect(status(checks, "crudeFibre")).toBe("low");
    expect(checks.find((c) => c.nutrient === "crudeFibre")!.tip).toMatch(/Heu zur freien Aufnahme/);
    expect(status(checks, "amount")).toBe("low!");
    const better = checkRation("rabbit", needFor("rabbit", "maintenance")!, [item("heu", 110), item("kaninchenpellets", 25), item("loewenzahn", 100)]);
    expect(better.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("reds any copper above the limit for sheep", () => {
    const need = needFor("sheep", "maintenance")!;
    const ok = checkRation("sheep", need, [item("heu", 1700), item("mineral_schaf", 20)]);
    expect(status(ok.checks, "copper")).toBe("ok");
    const bad = checkRation("sheep", need, [item("heu", 1700), item("mineral_rind", 20)]);
    expect(status(bad.checks, "copper")).toBe("high!");
    expect(bad.checks.find((c) => c.nutrient === "copper")!.tip).toMatch(/kupferarmes Schaf-Mineralfutter/);
  });
});
