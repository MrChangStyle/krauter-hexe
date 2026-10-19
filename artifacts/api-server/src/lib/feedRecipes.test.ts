import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { BUILT_IN_RECIPES, recipeFlags } = await import("./feedRecipes");
const { buildCalendar } = await import("./feedCalendar");

describe("recipes", () => {
  it("come with hygiene rules", () => {
    expect(BUILT_IN_RECIPES.map((r) => r.id)).toEqual(["b:fermentiertes-huehnerfutter", "b:keimfutter-gefluegel", "b:keimfutter-kleintiere", "b:wiesenkraeuter"]);
    for (const r of BUILT_IN_RECIPES) expect(r.hygiene.length).toBeGreaterThan(1);
    expect(BUILT_IN_RECIPES.flatMap((r) => [r.title, ...r.ingredients.map((i) => i.name), ...r.steps]).some((t) => recipeFlags({ title: t, ingredients: [], steps: [] }).length > 0)).toBe(false);
  });

  it("flags kitchen scraps and foods poisonous to animals for the owner", () => {
    expect(
      recipeFlags({
        title: "Resteessen für Hühner",
        ingredients: [
          { name: "Küchenreste", amount: "1 Schüssel" },
          { name: "Avocadoschalen", amount: "2" },
          { name: "Hafer", amount: "100 g" },
        ],
        steps: ["Mit Zwiebeln andünsten"],
      }),
    ).toEqual([
      "Küchen- oder Speisereste dürfen nicht an Nutztiere (VO (EG) 1069/2009).",
      "Avocado ist für viele Tiere giftig.",
      "Zwiebelgewächse schädigen die roten Blutkörperchen.",
    ]);
    expect(recipeFlags({ title: "Keimgerste", ingredients: [{ name: "Gerste", amount: "50 g" }], steps: ["Einweichen"] })).toEqual([]);
  });
});

describe("fodder calendar", () => {
  const cal = buildCalendar(2026, ["rabbit", "horse", "poultry"], new Set(["moehre", "mangold"]));
  const month = (m: number) => cal.months[m - 1]!;

  it("lists what the beds give each month, planted crops first", () => {
    expect(cal.species).toEqual(["rabbit", "poultry"]);
    const july = month(7).fresh;
    expect(july.slice(0, 2).map((c) => [c.name, c.planted])).toEqual([["Mangold", true], ["Möhre", true]]);
    expect(july.find((c) => c.key === "mangold")!.species).toEqual(["rabbit", "poultry"]);
    expect(july.find((c) => c.key === "moehre")!.species).toEqual(["rabbit"]);
    expect(month(7).stored).toEqual([]);
  });

  it("adds storable roots and squash from the store in winter", () => {
    expect(month(1).stored.map((c) => c.key).sort()).toEqual(["kuerbis", "moehre"]);
    // Parsnips stay in the ground over winter: fresh, not from the store.
    expect(month(1).fresh.map((c) => c.key)).toContain("pastinake");
    expect(month(1).fresh.every((c) => !month(1).stored.some((s) => s.key === c.key))).toBe(true);
  });
});
