import { describe, expect, it } from "vitest";
import type { FarmAnimal, Fertilizing, Herd, MedicalRecord, RationEvaluation, Seed } from "@workspace/api-client-react";
import { feedArea, fertilizerArea, fertilizerRows, grazingRows, organicFeedRows, organicSpaceRows, seedArea, seedRows, spaceArea, treatmentArea } from "@/lib/organic-check";

const check = (key: string, value: number, ok: boolean) => ({ key, value, target: 0, bound: "min", ok });
const ration = (name: string, ok: boolean, missing: string[] = [], active = true) =>
  ({
    active,
    target: { kind: "herd", id: 1, name, species: "poultry", count: 12 },
    organic: { checks: [check("organic", ok ? 97 : 80, ok), check("roughage", 0, true)], missing },
  }) as unknown as RationEvaluation;
const herd = (name: string, animalCount: number, stallM2: number | null, runM2: number | null) =>
  ({ id: 1, name, species: "poultry", animalCount, stallM2, runM2 }) as Herd;

describe("Bio-Check", () => {
  it("rates the feed by the active rations", () => {
    expect(feedArea([]).status).toBe("open");
    expect(feedArea([ration("Hühner", true, [], false)]).status).toBe("open");
    expect(feedArea([ration("Hühner", true)])).toMatchObject({ status: "ok", text: "1 Ration hält die Bio-Anteile ein." });
    expect(feedArea([ration("Hühner", true, ["Weizen"])])).toMatchObject({ status: "open", text: "Herkunft fehlt bei 1 Futtermittel: Weizen." });
    expect(feedArea([ration("Hühner", false), ration("Ziegen", true)])).toMatchObject({ status: "warn", text: "1 Ration hält die Bio-Anteile nicht ein: Hühner." });
  });

  it("rates the space: too small before missing before fine", () => {
    expect(spaceArea([]).status).toBe("open");
    expect(spaceArea([herd("Hühner", 12, 2, 48)]).status).toBe("ok");
    expect(spaceArea([herd("Hühner", 12, 2, null)])).toMatchObject({ status: "open", text: "Flächen fehlen: Hühner." });
    expect(spaceArea([herd("Hühner", 12, 1, null), herd("Enten", 12, 2, 60)])).toMatchObject({ status: "warn", text: "Zu wenig Platz: Hühner." });
  });

  it("warns from the third chemical treatment of an animal in 12 months", () => {
    const animals = [{ id: 1, name: "Berta", archivedAt: null }, { id: 2, name: "Alt", archivedAt: "2026-01-01" }] as FarmAnimal[];
    const rec = (animalId: number, date: string) => ({ animalId, date, remedyKind: "chemical" }) as MedicalRecord;
    expect(treatmentArea(animals, [rec(1, "2026-03-01"), rec(1, "2026-06-01")], "2026-10-30").status).toBe("ok");
    expect(treatmentArea(animals, [rec(1, "2026-03-01"), rec(1, "2026-06-01"), rec(1, "2026-09-01")], "2026-10-30")).toMatchObject({ status: "warn" });
    // Archived animals and treatments older than a year do not count.
    expect(treatmentArea(animals, [rec(2, "2026-03-01"), rec(2, "2026-04-01"), rec(2, "2026-05-01"), rec(1, "2025-01-01")], "2026-10-30").status).toBe("ok");
  });

  it("builds the rows of the Bio-Dokumentation", () => {
    expect(organicFeedRows([ration("Hühner", false, ["Weizen"])])[0]).toEqual(["Hühner (12)", "80 % (!)", "–", "–", "0 %", "Weizen"]);
    expect(organicSpaceRows([herd("Hühner", 12, 1, null), { ...herd("Pferde", 2, 30, 100), species: "horse" }])).toEqual([["Hühner", "12", "1 m² (!)", "2 m²", "nicht angegeben", "48 m²"]]);
    const pastures = [{ name: "Obstwiese", grazings: [
      { label: "Ziegen", animals: 4, startOn: "2026-05-01", endOn: "2026-05-20" },
      { label: "Schafe", animals: 3, startOn: "2025-05-01", endOn: "2025-06-01" },
      { label: "Hühner", animals: 12, startOn: "2026-04-01", endOn: null },
    ] }];
    expect(grazingRows(pastures, { from: "2026-01-01", to: "2026-10-30" }, (d) => d)).toEqual([
      ["Obstwiese", "Hühner", "12", "2026-04-01", "läuft"],
      ["Obstwiese", "Ziegen", "4", "2026-05-01", "2026-05-20"],
    ]);
  });

  it("rates the seed: conventional before unknown; own seed counts as organic", () => {
    const seed = (name: string, organic: boolean | null, source = "bought", archived = false) => ({ name, organic, source, archived, variety: null, openPollinated: null, harvestYear: null }) as unknown as Seed;
    expect(seedArea([]).status).toBe("open");
    expect(seedArea([seed("Tomate", true), seed("Bohne", null, "saved")])).toMatchObject({ status: "ok" });
    expect(seedArea([seed("Tomate", true), seed("Möhre", null)])).toMatchObject({ status: "open", text: "Bio-Saatgut nicht angegeben: Möhre." });
    expect(seedArea([seed("Möhre", null), seed("Mais", false), seed("Alt", false, "bought", true)])).toMatchObject({ status: "warn", text: "Konventionell (nur mit Ausnahmegenehmigung): Mais." });
    expect(seedRows([seed("Mais", false), seed("Bohne", null, "saved")], (s) => s.source, () => "1 Tüte")).toEqual([
      ["Mais", "–", "bought", "konventionell (!)", "–", "–", "1 Tüte"],
      ["Bohne", "–", "saved", "eigener Hof", "–", "–", "1 Tüte"],
    ]);
  });

  it("rates the fertiliser: mineral in 12 months is red, nothing is open", () => {
    const f = (id: number, date: string, kind: string, bedName = "Hochbeet") => ({ id, bedId: 1, bedName, date, kind, label: null, amountKg: null }) as Fertilizing;
    expect(fertilizerArea([], "2026-10-30").status).toBe("open");
    expect(fertilizerArea([f(1, "2025-03-01", "compost")], "2026-10-30").status).toBe("open");
    expect(fertilizerArea([f(1, "2026-03-01", "compost"), f(2, "2026-04-01", "manure_own")], "2026-10-30")).toMatchObject({ status: "ok", text: "2 Düngungen in 12 Monaten, alle organisch." });
    expect(fertilizerArea([f(1, "2026-03-01", "mineral", "Beet 2"), f(2, "2026-04-01", "mineral", "Beet 2")], "2026-10-30")).toMatchObject({ status: "warn", text: "Mineraldünger in 12 Monaten: Beet 2 – im Ökolandbau nicht zugelassen." });
    expect(fertilizerRows([{ ...f(2, "2026-04-01", "mineral"), amountKg: 2.5 }, f(1, "2026-03-01", "compost"), f(3, "2025-01-01", "compost")], { from: "2026-01-01", to: "2026-10-30" }, (d) => d)).toEqual([
      ["2026-03-01", "Hochbeet", "Kompost", "–", "–"],
      ["2026-04-01", "Hochbeet", "Mineraldünger (Kunstdünger) (!)", "–", "2,5 kg"],
    ]);
  });
});
