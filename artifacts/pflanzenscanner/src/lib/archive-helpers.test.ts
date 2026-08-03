import { describe, expect, it } from "vitest";
import type { Plant } from "@workspace/api-client-react";
import { firstLetter, availableLetters, applyAlpha } from "@/lib/archive-helpers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let nextId = 1;

function makePlant(germanName: string, overrides: Partial<Plant> = {}): Plant {
  return {
    id: nextId++,
    germanName,
    botanicalName: "Planta testis",
    category: "medicinal",
    humanStatus: "edible",
    poultryStatus: "safe",
    edibilityDetails: "",
    animalToxicityDetails: "",
    activeIngredients: "",
    humanBenefits: "",
    poultryBenefits: "",
    habitat: "",
    siteConditions: "",
    otherUses: "",
    fertilizerTips: "",
    animals: {},
    symptoms: {},
    hasSideImage: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Plant;
}

const kamille    = makePlant("Kamille");
const koenigin   = makePlant("Königin der Nacht");
const arnika     = makePlant("Arnika");
const beinwell   = makePlant("Beinwell");
const artemisia  = makePlant("artemisia"); // lowercase first letter

// ---------------------------------------------------------------------------
// firstLetter
// ---------------------------------------------------------------------------

describe("firstLetter", () => {
  it("returns the first character upper-cased (de locale)", () => {
    expect(firstLetter(kamille)).toBe("K");
    expect(firstLetter(arnika)).toBe("A");
  });

  it("upper-cases a lower-case first character", () => {
    expect(firstLetter(artemisia)).toBe("A");
  });

  it("preserves German umlauts as their umlaut form when upper-casing", () => {
    const ueberraschung = makePlant("überraschung");
    // toLocaleUpperCase("de") renders ü → Ü
    expect(firstLetter(ueberraschung)).toBe("Ü");
  });
});

// ---------------------------------------------------------------------------
// availableLetters
// ---------------------------------------------------------------------------

describe("availableLetters", () => {
  it("returns an empty list for an empty plant array", () => {
    expect(availableLetters([])).toEqual([]);
  });

  it("deduplicates letters that appear in multiple names", () => {
    const plants = [kamille, koenigin]; // both start with K
    expect(availableLetters(plants)).toEqual(["K"]);
  });

  it("sorts letters alphabetically (de locale)", () => {
    const plants = [kamille, arnika, beinwell];
    expect(availableLetters(plants)).toEqual(["A", "B", "K"]);
  });

  it("normalises first letter before grouping (lower+upper same letter → one entry)", () => {
    const plants = [kamille, artemisia]; // K and a → K and A (no collision)
    const letters = availableLetters(plants);
    expect(letters).toHaveLength(2);
    expect(letters).toContain("K");
    expect(letters).toContain("A");
  });

  it("returns a single letter for a list where all names share the same initial", () => {
    const plants = [kamille, koenigin];
    expect(availableLetters(plants)).toEqual(["K"]);
  });
});

// ---------------------------------------------------------------------------
// applyAlpha
// ---------------------------------------------------------------------------

describe("applyAlpha", () => {
  const plants = [kamille, arnika, beinwell, koenigin]; // original insertion order

  it("returns the original list unchanged when letter is null", () => {
    expect(applyAlpha(plants, null)).toEqual(plants);
  });

  it("filters to only the matching initial letter", () => {
    const result = applyAlpha(plants, "K");
    expect(result.map((p) => p.germanName)).toEqual(
      expect.arrayContaining(["Kamille", "Königin der Nacht"]),
    );
    expect(result.every((p) => firstLetter(p) === "K")).toBe(true);
  });

  it("sorts alphabetically (de locale) when a letter is chosen", () => {
    const result = applyAlpha(plants, "K");
    const names = result.map((p) => p.germanName);
    // "Kamille" < "Königin der Nacht" in de locale
    expect(names.indexOf("Kamille")).toBeLessThan(names.indexOf("Königin der Nacht"));
  });

  it("does not sort when no letter is chosen (preserves original order)", () => {
    const result = applyAlpha(plants, null);
    expect(result.map((p) => p.germanName)).toEqual(
      plants.map((p) => p.germanName),
    );
  });

  it("returns an empty list when no plants match the chosen letter", () => {
    expect(applyAlpha(plants, "Z")).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const original = [...plants];
    applyAlpha(plants, "K");
    expect(plants.map((p) => p.germanName)).toEqual(
      original.map((p) => p.germanName),
    );
  });
});
