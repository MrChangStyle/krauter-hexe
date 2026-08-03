import { describe, it, expect } from "vitest";
import type { Plant, AnimalInfo } from "@workspace/api-client-react";
import {
  humanBadge,
  animalBadge,
  animalCardClass,
  mushroomEdibleForDisplay,
} from "./plant-detail-helpers";

// ---------------------------------------------------------------------------
// Minimal plant factory so tests don't repeat boilerplate
// ---------------------------------------------------------------------------

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: 1,
    germanName: "Testpflanze",
    botanicalName: "Testus plantus",
    category: "edible",
    humanStatus: "toxic",
    edibilityDetails: "",
    activeIngredients: "",
    habitat: "",
    siteConditions: "",
    otherUses: "",
    fertilizerTips: "",
    humanBenefits: "",
    poultryStatus: "safe",
    animalToxicityDetails: "",
    poultryBenefits: "",
    hasSideImage: false,
    createdAt: new Date().toISOString(),
    symptoms: {},
    animals: {},
    ...overrides,
  } as unknown as Plant;
}

function animalInfo(status: "safe" | "toxic"): AnimalInfo {
  return {
    status,
    toxicityDetails: "details",
    benefits: "",
  } as unknown as AnimalInfo;
}

// ---------------------------------------------------------------------------
// humanBadge — non-mushroom plants
// ---------------------------------------------------------------------------

describe("humanBadge – non-mushroom plants", () => {
  it("returns safe=true and Essbar label when humanStatus is edible", () => {
    const result = humanBadge(makePlant({ category: "edible", humanStatus: "edible" }));
    expect(result.safe).toBe(true);
    expect(result.label).toBe("Ungiftig");
  });

  it("returns safe=false and GIFTIG label when humanStatus is toxic", () => {
    const result = humanBadge(makePlant({ category: "edible", humanStatus: "toxic" }));
    expect(result.safe).toBe(false);
    expect(result.label).toBe("GIFTIG");
  });

  it("treats any non-edible status as toxic for regular plants", () => {
    const result = humanBadge(makePlant({ category: "poisonous", humanStatus: "toxic" }));
    expect(result.safe).toBe(false);
  });

  it("shows Essbar for edible plant even without a side image (no mushroom gate)", () => {
    // Regular edible plants never need a side photo
    const result = humanBadge(makePlant({ category: "edible", humanStatus: "edible", hasSideImage: false }));
    expect(result.safe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// humanBadge — mushroom two-photo gate
// ---------------------------------------------------------------------------

describe("humanBadge – mushroom two-photo gate", () => {
  it("shows GIFTIG for a mushroom that is marked edible but has no side image", () => {
    // The dangerous case: edible status without confirmed side photo → must NOT show Essbar
    const result = humanBadge(makePlant({ category: "mushroom", humanStatus: "edible", hasSideImage: false }));
    expect(result.safe).toBe(false);
    expect(result.label).toBe("GIFTIG");
  });

  it("shows Essbar for a mushroom that is edible AND has its side image confirmed", () => {
    const result = humanBadge(makePlant({ category: "mushroom", humanStatus: "edible", hasSideImage: true }));
    expect(result.safe).toBe(true);
    expect(result.label).toBe("Ungiftig");
  });

  it("shows GIFTIG for a toxic mushroom regardless of hasSideImage", () => {
    const result = humanBadge(makePlant({ category: "mushroom", humanStatus: "toxic", hasSideImage: true }));
    expect(result.safe).toBe(false);
  });

  it("shows GIFTIG for a toxic mushroom without side image", () => {
    const result = humanBadge(makePlant({ category: "mushroom", humanStatus: "toxic", hasSideImage: false }));
    expect(result.safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mushroomEdibleForDisplay — direct gate tests
// ---------------------------------------------------------------------------

describe("mushroomEdibleForDisplay", () => {
  it("returns false when category is not mushroom even with edible + side image", () => {
    expect(
      mushroomEdibleForDisplay({ category: "edible", humanStatus: "edible", hasSideImage: true }),
    ).toBe(false);
  });

  it("returns false when humanStatus is toxic even with mushroom category and side image", () => {
    expect(
      mushroomEdibleForDisplay({ category: "mushroom", humanStatus: "toxic", hasSideImage: true }),
    ).toBe(false);
  });

  it("returns false when edible mushroom but side image is missing", () => {
    expect(
      mushroomEdibleForDisplay({ category: "mushroom", humanStatus: "edible", hasSideImage: false }),
    ).toBe(false);
  });

  it("returns false when all conditions are wrong", () => {
    expect(
      mushroomEdibleForDisplay({ category: "poisonous", humanStatus: "toxic", hasSideImage: false }),
    ).toBe(false);
  });

  it("returns true only when mushroom category, edible status, AND side image all present", () => {
    expect(
      mushroomEdibleForDisplay({ category: "mushroom", humanStatus: "edible", hasSideImage: true }),
    ).toBe(true);
  });

  it("treats null/undefined hasSideImage as absent (falsy)", () => {
    expect(
      mushroomEdibleForDisplay({
        category: "mushroom",
        humanStatus: "edible",
        hasSideImage: null as unknown as boolean,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// animalBadge
// ---------------------------------------------------------------------------

describe("animalBadge", () => {
  it("returns pending when the animals map has no entry for the key", () => {
    const plant = makePlant({ animals: {} });
    const result = animalBadge(plant, "cat");
    expect(result.variant).toBe("pending");
  });

  it("returns safe when the fact sheet status is safe", () => {
    const plant = makePlant({ animals: { poultry: animalInfo("safe") } });
    const result = animalBadge(plant, "poultry");
    expect(result.variant).toBe("safe");
    expect(result.label).toBe("Genießbar");
  });

  it("returns toxic when the fact sheet status is toxic", () => {
    const plant = makePlant({ animals: { rabbit: animalInfo("toxic") } });
    const result = animalBadge(plant, "rabbit");
    expect(result.variant).toBe("toxic");
    expect(result.label).toBe("GIFTIG");
  });

  it("falls back to legacy poultry columns when animals.poultry is absent", () => {
    const plant = makePlant({ animals: {}, poultryStatus: "safe" });
    const result = animalBadge(plant, "poultry");
    expect(result.variant).toBe("safe");
  });

  it("legacy poultry falls back correctly when status is toxic", () => {
    const plant = makePlant({ animals: {}, poultryStatus: "toxic" as never });
    const result = animalBadge(plant, "poultry");
    expect(result.variant).toBe("toxic");
  });
});

// ---------------------------------------------------------------------------
// animalCardClass
// ---------------------------------------------------------------------------

describe("animalCardClass", () => {
  it("returns emerald classes for safe", () => {
    expect(animalCardClass("safe")).toContain("emerald");
  });

  it("returns rose classes for toxic", () => {
    expect(animalCardClass("toxic")).toContain("rose");
  });

  it("returns neutral classes for pending", () => {
    const cls = animalCardClass("pending");
    expect(cls).not.toContain("emerald");
    expect(cls).not.toContain("rose");
  });
});
