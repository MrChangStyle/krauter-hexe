import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { BREEDING, breedingMessage, relation, schedule } = await import("./breeding");

describe("Zucht – schedule", () => {
  it("has steps inside the pregnancy for every species", () => {
    for (const [species, rule] of Object.entries(BREEDING)) {
      const plan = schedule(species as never, "2026-01-01", rule!.days, "2026-01-01");
      expect(plan.steps.length, species).toBe(rule!.steps.length + 1);
      expect(plan.steps.at(-1)!.on, species).toBe(plan.dueOn);
      expect(plan.earliestOn < plan.dueOn && plan.dueOn < plan.latestOn, species).toBe(true);
    }
  });

  it("counts steps from the start or back from the expected day", () => {
    const goat = schedule("goat", "2026-09-01", 150, "2026-10-19");
    expect(goat.dueOn).toBe("2027-01-29");
    expect(goat.earliestOn).toBe("2027-01-24");
    expect(goat.steps.map((s) => [s.on, s.past])).toEqual([
      ["2026-09-22", true],
      ["2026-12-04", false],
      ["2026-12-18", false],
      ["2027-01-22", false],
      ["2027-01-29", false],
    ]);
    // A short incubation (quail, 17 days) keeps its steps between set and hatch.
    const quail = schedule("poultry", "2026-10-01", 17, "2026-10-01");
    expect(quail.steps.map((s) => s.on)).toEqual(["2026-10-08", "2026-10-11", "2026-10-15", "2026-10-18"]);
    expect(quail.steps.at(-1)!.text).toBe("Schlupf erwartet.");
  });
});

describe("Zucht – relationship", () => {
  // 1 + 2 → 3, 4; 1 + 5 → 6; 3 + 7 → 8; 4 + 9 → 10
  const family = new Map([
    [3, { motherId: 2, fatherId: 1 }],
    [4, { motherId: 2, fatherId: 1 }],
    [6, { motherId: 5, fatherId: 1 }],
    [8, { motherId: 7, fatherId: 3 }],
    [10, { motherId: 4, fatherId: 9 }],
  ]);
  it("finds parents, siblings, grandparents and cousins", () => {
    expect(relation(2, 3, family)).toBe("Elterntier und Nachkomme");
    expect(relation(3, 4, family)).toBe("Vollgeschwister");
    expect(relation(4, 6, family)).toBe("Halbgeschwister");
    expect(relation(8, 1, family)).toBe("Großelternteil und Enkel");
    expect(relation(8, 10, family)).toBe("Cousins (gemeinsame Großeltern)");
    expect(relation(7, 9, family)).toBeNull();
  });
});

describe("Zucht – push", () => {
  it("lists today's steps of running records", () => {
    const rec = (over: object) => ({ status: "running", motherName: null, eggCount: 12, steps: [], ...over }) as never;
    expect(
      breedingMessage(
        [
          rec({ motherName: "Lotte", steps: [{ on: "2026-10-19", text: "Nestbox einstellen.", past: false }] }),
          rec({ steps: [{ on: "2026-10-19", text: "Schieren.", past: false }] }),
          rec({ status: "born", motherName: "Erna", steps: [{ on: "2026-10-19", text: "Geburt erwartet.", past: false }] }),
          rec({ motherName: "Flocke", steps: [{ on: "2026-10-20", text: "Morgen.", past: false }] }),
        ],
        "2026-10-19",
      ),
    ).toEqual({ title: "Zucht: 2 Dinge heute", body: "Lotte: Nestbox einstellen. · Brut (12 Eier): Schieren." });
    expect(breedingMessage([], "2026-10-19")).toBeNull();
  });
});
