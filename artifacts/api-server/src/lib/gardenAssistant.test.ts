import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { DEFAULT_GOALS, planGarden } = await import("./gardenAssistant");

const bed = (id: number, lengthCm: number, widthCm: number) => ({ id, name: `Beet ${id}`, lengthCm, widthCm });

describe("Garten-Assistent", () => {
  it("adds up the kitchen need per person and direction", () => {
    const plan = planGarden({ people: 2, animalShare: 0, directions: ["vegetables", "herbs", "storage"], hoursPerWeek: null }, [], [bed(1, 300, 120)]);
    expect(plan.kitchenNeedM2).toBe(124);
    expect(plan.availableM2).toBe(3.6);
    expect(plan.kitchenCoverage).toBe(3);
    expect(plan.fodderCoverage).toBeNull();
    expect(plan.beds).toEqual([
      expect.objectContaining({ bedId: 1, role: "kitchen", areaM2: 3.6, wishes: expect.stringMatching(/^Für die Küche: Tomate, Buschbohne/) }),
    ]);
    expect(plan.tips[0]).toMatch(/reichen für einen Teil des Bedarfs – für alles bräuchtest du etwa 124 m²/);
  });

  it("works out green fodder from the animals and gives whole beds to it", () => {
    const animals = [
      { species: "rabbit" as const, count: 4 },
      { species: "poultry" as const, count: 10 },
      { species: "horse" as const, count: 1 },
    ];
    const beds = [bed(1, 400, 200), bed(2, 300, 120), bed(3, 200, 100), bed(4, 500, 300)];
    const plan = planGarden({ ...DEFAULT_GOALS, people: 1, animalShare: 30 }, animals, beds);
    expect(plan.fodder).toMatchObject({ perDayKg: 1.3, summerKg: 234, winterKg: 98, needM2: 103 });
    expect(plan.fodder.animals.find((a) => a.species === "horse")).toMatchObject({ perDayKg: 0 });
    // 30 % of 28.6 m² ≈ 8.6 m² (up to a quarter more) → the 8 m² bed and the 2 m² bed.
    expect(plan.beds.filter((b) => b.role === "fodder").map((b) => b.bedId)).toEqual([1, 3]);
    expect(plan.fodderM2).toBe(10);
    expect(plan.kitchenM2).toBe(18.6);
    expect(plan.fodderCoverage).toBe(10);
    const fodderBed = plan.beds.find((b) => b.role === "fodder")!;
    expect(fodderBed.wishes).toMatch(/^Tierfutter für Kaninchen und Hühner: Möhre, Mangold/);
    expect(fodderBed.crops).not.toContain("kartoffel");
    expect(plan.tips.join(" ")).toMatch(/Pferde: Futter kommt von Weide/);
    expect(plan.tips.join(" ")).toMatch(/98 kg Lagerfutter/);
  });

  it("keeps everything in the kitchen without fodder share, and warns about time", () => {
    const plan = planGarden({ ...DEFAULT_GOALS, animalShare: 0, hoursPerWeek: 1 }, [{ species: "rabbit", count: 2 }], [bed(1, 500, 300)]);
    expect(plan.beds[0]!.role).toBe("kitchen");
    expect(plan.manageableM2).toBe(10);
    expect(plan.tips.join(" ")).toMatch(/etwa 2 Stunden pro Woche/);
  });

  it("gives the smallest bed to fodder when every bed is bigger than the share", () => {
    const plan = planGarden({ ...DEFAULT_GOALS, animalShare: 10 }, [{ species: "goat", count: 2 }], [bed(1, 500, 300), bed(2, 400, 300)]);
    expect(plan.beds.find((b) => b.role === "fodder")?.bedId).toBe(2);
  });
});
