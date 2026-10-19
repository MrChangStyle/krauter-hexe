import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { yieldsOf } = await import("./gardenHarvests");
const { DEFAULT_GOALS, planGarden } = await import("./gardenAssistant");

const h = (id: number, plantingId: number | null, cropKey: string, cells: number, amountKg: number, use: "kitchen" | "fodder") => ({
  id,
  plantingId,
  cropKey,
  label: cropKey,
  cells,
  amountKg,
  use,
});

describe("harvests", () => {
  it("adds up kg per use and counts each planting's area once", () => {
    const y = yieldsOf(2026, [
      h(1, 1, "tomate", 4, 2, "kitchen"), // 0.36 m²
      h(2, 1, "tomate", 4, 1.6, "kitchen"),
      h(3, 2, "mangold", 2, 0.9, "fodder"), // 0.18 m²
      h(4, 2, "mangold", 2, 0.5, "kitchen"),
    ]);
    expect(y).toMatchObject({ season: 2026, kitchenKg: 4.1, fodderKg: 0.9, kitchenKgPerM2: 7.6, fodderKgPerM2: 5 });
    expect(y.crops.map((c) => [c.label, c.kg, c.m2, c.kgPerM2])).toEqual([
      ["tomate", 3.6, 0.36, 10],
      ["mangold", 1.4, 0.18, 7.8],
    ]);
  });

  it("lets the plan learn from them", () => {
    const beds = [{ id: 1, name: "Beet", lengthCm: 500, widthCm: 200 }];
    const goals = { ...DEFAULT_GOALS, people: 1, animalShare: 50, directions: ["vegetables" as const] };
    const rabbits = [{ species: "rabbit" as const, count: 4 }];
    const before = planGarden(goals, rabbits, beds);
    expect(before.learned).toBeNull();
    expect(before.kitchenNeedM2).toBe(40);
    expect(before.fodder.needM2).toBe(79); // 180 kg / 3 + 75 kg / 4
    // Twice the rule-of-thumb kitchen yield halves the area; fodder at 6 kg/m².
    const yields = { season: 2025, kitchenKg: 30, fodderKg: 20, kitchenKgPerM2: 6, fodderKgPerM2: 6, crops: [{ cropKey: "tomate", label: "Tomate", kg: 10, m2: 0.36, kgPerM2: 27.8 }] };
    const after = planGarden(goals, rabbits, beds, yields);
    expect(after.kitchenNeedM2).toBe(20);
    expect(after.fodder.needM2).toBe(49); // 180 / 6 + 75 / 4
    expect(after.learned).toEqual({ season: 2025, kitchenKgPerM2: 6, fodderKgPerM2: 6 });
    expect(after.tips[0]).toBe("Gerechnet mit euren Ernten 2025: Küche 6 kg/m² (Faustwert 3), Tierfutter 6 kg/m² (Faustwert 3).");
    expect(after.tips[1]).toBe("Am meisten pro m² brachte Tomate: 27,8 kg/m².");
    // Outliers are bounded.
    expect(planGarden(goals, [], beds, { ...yields, kitchenKgPerM2: 0.1 }).kitchenNeedM2).toBe(80);
  });
});
