import { describe, expect, it } from "vitest";
import { breedingTitle, outcomeText, parentChoices, progress } from "./breeding-labels";

describe("breeding labels", () => {
  it("offers mothers and fathers of the species, not archived", () => {
    const a = (id: number, sex: string, species = "goat", archivedAt: string | null = null) => ({ id, sex, species, archivedAt }) as never;
    const animals = [a(1, "female"), a(2, "male"), a(3, "unknown"), a(4, "neutered"), a(5, "female", "sheep"), a(6, "female", "goat", "2026-01-01")];
    expect(parentChoices(animals, "goat", "mother").map((x) => x.id)).toEqual([1, 3]);
    expect(parentChoices(animals, "goat", "father").map((x) => x.id)).toEqual([2, 3]);
  });

  it("words title, progress and outcome", () => {
    expect(breedingTitle({ motherName: "Lotte", eggCount: null, kind: "pregnancy" })).toBe("Lotte");
    expect(breedingTitle({ motherName: null, eggCount: 12, kind: "incubation" })).toBe("Brut mit 12 Eiern");
    expect(progress({ day: 75, durationDays: 150 })).toBe(0.5);
    expect(progress({ day: 160, durationDays: 150 })).toBe(1);
    expect(outcomeText({ status: "born", kind: "pregnancy", endedOn: "2026-09-28", bornAlive: 2, bornDead: 1 })).toBe("Geboren am 28.09.2026: 2 lebend, 1 tot");
    expect(outcomeText({ status: "born", kind: "incubation", endedOn: "2026-10-19", bornAlive: 9, bornDead: 0 })).toBe("Geschlüpft am 19.10.2026: 9 lebend");
    expect(outcomeText({ status: "failed", kind: "pregnancy", endedOn: "2026-10-15", bornAlive: null, bornDead: null })).toBe("Nicht trächtig oder abgebrochen (15.10.2026)");
    expect(outcomeText({ status: "running", kind: "pregnancy", endedOn: null, bornAlive: null, bornDead: null })).toBeNull();
  });
});
