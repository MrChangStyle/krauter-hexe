import { describe, expect, it } from "vitest";
import type { Crop } from "@workspace/api-client-react";
import { lateDates, raisedBedLayers, raisedBedYear, recommendedFeeder, refillLiters, seasonExtension, tooHungry } from "./raised-bed";

const crop = (key: string, extra: Partial<Crop>) => ({ key, name: key, feeder: "medium", directSow: null, plantOut: null, ...extra }) as Crop;

describe("Hochbeet-Begleiter", () => {
  it("works out the layers and amounts for the bed's size", () => {
    const { meshM2, layers } = raisedBedLayers({ lengthCm: 200, widthCm: 100, heightCm: 80 });
    expect(meshM2).toBe(2.6);
    expect(layers.map((l) => [l.name, l.cm, l.liters, l.bags])).toEqual([
      ["Grobes Gehölz", 26, 520, null],
      ["Laub & Grassoden", 15, 300, null],
      ["Grober Kompost oder Mist", 11, 220, 7],
      ["Feiner Kompost", 12, 240, 7],
      ["Pflanzerde", 16, 320, 9],
    ]);
    expect(layers.reduce((s, l) => s + l.cm, 0)).toBe(80);
    // Low beds: just compost and soil.
    expect(raisedBedLayers({ lengthCm: 100, widthCm: 100, heightCm: 30 }).layers.map((l) => [l.name, l.cm])).toEqual([
      ["Grober Kompost", 12],
      ["Pflanzerde", 18],
    ]);
    expect(refillLiters({ lengthCm: 200, widthCm: 100 })).toBe(200);
  });

  it("goes from heavy to light feeders over the years", () => {
    expect(raisedBedYear(2024, 2026)).toBe(3);
    expect(raisedBedYear(null, 2026)).toBeNull();
    expect([1, 2, 3, 4, 5].map(recommendedFeeder)).toEqual(["heavy", "heavy", "medium", "light", null]);
    const crops = new Map([
      ["tomate", crop("tomate", { feeder: "heavy" })],
      ["salat", crop("salat", { feeder: "light" })],
    ]);
    const plantings = [
      { label: "Tomate", cropKey: "tomate" },
      { label: "Salat", cropKey: "salat" },
      { label: "Erdbirne", cropKey: null },
    ];
    expect(tooHungry(plantings, crops, 4)).toEqual(["Tomate"]);
    expect(tooHungry(plantings, crops, 1)).toEqual([]);
  });

  it("lists the last sowing and planting dates of the season", () => {
    const crops = [
      crop("feldsalat", { name: "Feldsalat", directSow: { from: 12, to: 18 } }),
      crop("spinat", { name: "Spinat", directSow: { from: 14, to: 16 } }),
      crop("tomate", { name: "Tomate", plantOut: { from: 0, to: 3 } }),
      crop("knoblauch", { name: "Knoblauch", plantOut: { from: 20, to: 26 } }),
    ];
    const list = lateDates(crops, "05-15", "10-20", 2026, "2026-08-01");
    expect(list.map((d) => [d.crop.key, d.kind, d.until])).toEqual([
      ["spinat", "direct_sow", "2026-09-10"],
      ["feldsalat", "direct_sow", "2026-09-24"],
    ]);
    expect(lateDates(crops, "05-15", "10-20", 2026, "2026-10-01")).toEqual([]);
  });

  it("knows how long protection stretches the season", () => {
    expect(seasonExtension("raised", "10-15", 2026)).toEqual([
      { label: "Ohne Schutz", until: "2026-10-15" },
      { label: "Mit Vlies oder Abdeckung", until: "2026-11-05" },
    ]);
    expect(seasonExtension("greenhouse", "10-15", 2026).at(-1)).toEqual({ label: "Im Gewächshaus", until: "2026-11-26" });
  });
});
