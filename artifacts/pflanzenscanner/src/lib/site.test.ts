import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULES } from "@/lib/modules";
import { FarmSpecies } from "@workspace/api-client-react";
import { MODULE_SITE, PLANS, SITE_NAV, SITE_PATHS, SITE_SPECIES, recommend, sitePageOf, yearlySaving, type FinderInput } from "@/lib/site";

const none: FinderInput = { plants: [], animals: [], pasture: false, team: false, sells: false, ai: "never" };
const ids = (input: Partial<FinderInput>) => recommend({ ...none, ...input }).modules.map((m) => m.id);

describe("Homepage – pages", () => {
  it("knows its pages and leaves the app's routes alone", () => {
    expect(sitePageOf("/preise")).toBe("pricing");
    expect(sitePageOf("/funktionen/tiere/")).toBe("animals");
    expect(sitePageOf("/")).toBeNull();
    expect(sitePageOf("/pflanzen")).toBeNull();
    expect(sitePageOf("/farm")).toBeNull();
    expect(SITE_NAV.map((n) => SITE_PATHS[n.page])).not.toContain("/");
  });
});

describe("Homepage – Tierarten", () => {
  it("shows every species of the app (and the bees), each once", () => {
    const species = Object.values(FarmSpecies).filter((s) => s !== "other");
    expect(SITE_SPECIES.map((s) => s.key).sort()).toEqual([...species, "bees"].sort());
    expect(SITE_SPECIES.filter((s) => s.isNew).map((s) => s.key)).toEqual(["duck", "goose", "turkey", "quail"]);
  });
});

describe("Homepage – modules and packages", () => {
  it("describes every module, and only those", () => {
    const modules = MODULES.filter((m) => !m.isArea).map((m) => m.id).sort();
    expect(Object.keys(MODULE_SITE).sort()).toEqual(modules);
    for (const [id, m] of Object.entries(MODULE_SITE)) expect(m!.points.length, id).toBeGreaterThanOrEqual(2);
  });

  it("shows every module with a screenshot of the app that exists", () => {
    const dir = join(__dirname, "../../public/site/screens");
    for (const [id, m] of Object.entries(MODULE_SITE)) expect(existsSync(join(dir, `${m!.screen}.jpg`)), `${id}: ${m!.screen}`).toBe(true);
    // No screenshot without a use.
    const used = new Set([...Object.values(MODULE_SITE).map((m) => m!.screen), "hof", "hilfe"]);
    for (const file of readdirSync(dir)) expect(used.has(file.replace(/\.jpg$/, "")), file).toBe(true);
  });

  it("has a free Basis and paid packages that save with a year", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["basis", "lite", "premium"]);
    expect(PLANS[0]).toMatchObject({ monthly: 0, yearly: 0 });
    expect(PLANS[1]!.monthly).toBeLessThan(PLANS[2]!.monthly);
    expect(PLANS[1]!.aiPerDay).toBeLessThan(PLANS[2]!.aiPerDay);
    for (const p of PLANS.slice(1)) expect(yearlySaving(p)).toBeGreaterThan(10);
  });
});

describe("Modul-Finder", () => {
  it("gives chickens and a vegetable garden what they need – and no bees", () => {
    const m = ids({ plants: ["garden"], animals: ["poultry"] });
    expect(m).toEqual(expect.arrayContaining(["garden", "pantry", "pests", "farm-tasks", "feed", "duties", "breeding", "wildlife", "yields", "export"]));
    expect(m).not.toContain("bees");
    expect(m).not.toContain("pasture");
    expect(m).not.toContain("grow");
    expect(m).not.toContain("members");
  });

  it("gives beekeepers the bees and their duties, not the stable", () => {
    const m = ids({ animals: ["bees"] });
    expect(m).toEqual(["duties", "yields", "bees"]);
  });

  it("gives alpaca keepers pasture, feed, breeding and the duties", () => {
    const m = ids({ animals: ["alpaca"] });
    expect(m).toEqual(expect.arrayContaining(["farm-tasks", "feed", "duties", "medicines", "export", "breeding", "pasture", "yields"]));
    expect(m).not.toContain("bees");
    expect(m).not.toContain("wildlife");
  });

  it("adds the pasture for grazers, the team when others help", () => {
    expect(ids({ animals: ["goat"] })).toContain("pasture");
    expect(ids({ animals: ["rabbit"] })).not.toContain("pasture");
    expect(ids({ animals: ["rabbit"], pasture: true })).toContain("pasture");
    expect(ids({ team: true })).toEqual(["handover", "members"]);
  });

  it("keeps house plants to the plant modules, and lists in the app's order", () => {
    expect(ids({ plants: ["indoor"] })).toEqual(["my-plants", "care-plan", "plant-doc", "lexicon"]);
    const order = MODULES.map((m) => m.id);
    const m = ids({ plants: ["garden", "herbs"], animals: ["sheep"], team: true });
    expect([...m].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(m);
  });

  it("picks the package from how much AI is wanted", () => {
    expect(recommend({ ...none, plants: ["garden"], animals: ["goat"] }).plan).toBe("basis");
    expect(recommend({ ...none, plants: ["garden"], ai: "sometimes" }).plan).toBe("lite");
    // Often, but only garden AI: Lite is enough.
    expect(recommend({ ...none, plants: ["garden"], ai: "often" })).toMatchObject({ plan: "lite" });
    const hof = recommend({ ...none, animals: ["poultry"], ai: "often" });
    expect(hof.plan).toBe("premium");
    expect(hof.planWhy).toContain("Futterplaner");
    expect(recommend({ ...none, plants: ["grow"], ai: "sometimes" })).toMatchObject({ plan: "premium", planWhy: "Der Grow-KI-Check gehört zu Premium." });
    expect(recommend({ ...none, plants: ["grow"] }).plan).toBe("basis");
  });

  it("explains every recommended module", () => {
    const r = recommend({ plants: ["indoor", "garden", "herbs", "grow"], animals: ["poultry", "goat", "sheep", "cattle", "pig", "horse", "rabbit", "bees", "pets"], pasture: true, team: true, sells: true, ai: "often" });
    // Everything selected: every module is recommended.
    expect(r.modules.map((m) => m.id).sort()).toEqual(MODULES.filter((m) => !m.isArea).map((m) => m.id).sort());
    for (const m of r.modules) expect(m.why.length, m.id).toBeGreaterThan(10);
  });
});

describe("Modul-Finder → app", () => {
  it("hides what was not chosen, and an area without any chosen module", async () => {
    const { hiddenForChoice } = await import("@/lib/site");
    const hidden = hiddenForChoice(["garden", "care-plan"]);
    expect(hidden).toContain("bees");
    expect(hidden).toContain("animals");
    expect(hidden).not.toContain("plants");
    expect(hidden).not.toContain("garden");
    expect(hiddenForChoice(["bees"])).toContain("plants");
  });
});
