import { describe, expect, it } from "vitest";
import { breedingTitle, cycleStatusText, nextHeatText, outcomeText, parentChoices, progress, relDay } from "./breeding-labels";

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

describe("Brunstkalender", () => {
  const a = { status: "open" as const, until: null, lastHeat: null, nextHeat: null, inSeason: true, season: null };

  it("says how far a day is", () => {
    expect(["2026-10-19", "2026-10-20", "2026-10-18", "2026-10-24", "2026-10-15"].map((d) => relDay(d, "2026-10-19"))).toEqual(["heute", "morgen", "gestern", "in 5 Tagen", "vor 4 Tagen"]);
  });

  it("names where a female stands", () => {
    expect(cycleStatusText({ status: "pregnant", until: "2027-03-01" })).toBe("Tragend – Geburt um den 01.03.2027");
    expect(cycleStatusText({ status: "nursing", until: "2026-12-21" })).toBe("Säugt – Absetzen am 21.12.2026");
    expect(cycleStatusText({ status: "resting", until: "2026-11-02" })).toBe("Pause nach der Geburt – wieder decken ab 02.11.2026");
    expect(cycleStatusText(a)).toBe("Deckbereit");
  });

  it("says when to watch for heat, or why it cannot", () => {
    expect(nextHeatText({ ...a, nextHeat: "2026-10-31", lastHeat: "2026-10-10" }, "2026-10-19")).toBe("Nächste Brunst um den 31.10.2026 (in 12 Tagen)");
    expect(nextHeatText({ ...a, nextHeat: "2026-10-19", lastHeat: "2026-09-28" }, "2026-10-19")).toBe("Brunst heute erwartet");
    expect(nextHeatText({ ...a, inSeason: false, season: "August bis Februar" }, "2026-05-01")).toBe("Außerhalb der Brunstsaison (August bis Februar)");
    expect(nextHeatText({ ...a, lastHeat: "2026-01-01" }, "2026-10-19")).toBe("Letzte Brunst zu lange her – die nächste bitte eintragen.");
    expect(nextHeatText(a, "2026-10-19")).toBe("Noch keine Brunst eingetragen.");
    expect(nextHeatText({ ...a, status: "pregnant" }, "2026-10-19")).toBeNull();
  });
});
