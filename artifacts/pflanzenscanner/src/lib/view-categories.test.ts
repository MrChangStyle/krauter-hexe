import { describe, expect, it } from "vitest";
import type { Plant } from "@workspace/api-client-react";
import {
  apiCategoryOf,
  humanStatusOf,
  filterPlantsForView,
  computeCategorySummary,
  viewCount,
  viewCategoryOf,
  VIEW_CATEGORIES,
  type ViewCategory,
} from "@/lib/view-categories";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let nextId = 1;

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: nextId++,
    germanName: "Testpflanze",
    botanicalName: "Planta testis",
    category: "medicinal",
    humanStatus: "poisonous",
    poultryStatus: "poisonous",
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

// Mushrooms: one edible, one poisonous — both live in the single "mushroom"
// view category (the giftig/essbar info is carried by the safety badge).
const edibleMushroom = makePlant({
  germanName: "Champignon",
  category: "mushroom",
  humanStatus: "edible",
});
const poisonousMushroom = makePlant({
  germanName: "Fliegenpilz",
  category: "mushroom",
  humanStatus: "poisonous",
});

// Non-mushroom plants
const poisonousPlant = makePlant({
  germanName: "Tollkirsche",
  category: "poisonous",
  humanStatus: "poisonous",
});
const ediblePlant = makePlant({
  germanName: "Bärlauch",
  category: "edible",
  humanStatus: "edible",
});
const tree = makePlant({
  germanName: "Eiche",
  category: "tree",
  humanStatus: "poisonous",
});

const ALL_PLANTS = [edibleMushroom, poisonousMushroom, poisonousPlant, ediblePlant, tree];

// ---------------------------------------------------------------------------
// VIEW_CATEGORIES – the mushroom split is gone
// ---------------------------------------------------------------------------

describe("VIEW_CATEGORIES", () => {
  it("contains a single mushroom category and no split variants", () => {
    expect(VIEW_CATEGORIES).toContain("mushroom");
    expect(VIEW_CATEGORIES as readonly string[]).not.toContain("mushroom_edible");
    expect(VIEW_CATEGORIES as readonly string[]).not.toContain("mushroom_poisonous");
  });
});

// ---------------------------------------------------------------------------
// apiCategoryOf
// ---------------------------------------------------------------------------

describe("apiCategoryOf", () => {
  it("maps every view category 1:1 to its API category", () => {
    for (const v of VIEW_CATEGORIES) {
      expect(apiCategoryOf(v)).toBe(v);
    }
  });
});

// ---------------------------------------------------------------------------
// humanStatusOf
// ---------------------------------------------------------------------------

describe("humanStatusOf", () => {
  it("returns null for every view category (no status filtering anymore)", () => {
    for (const v of VIEW_CATEGORIES) {
      expect(humanStatusOf(v)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// filterPlantsForView
// ---------------------------------------------------------------------------

describe("filterPlantsForView", () => {
  it("mushroom view passes both edible and poisonous mushrooms through", () => {
    const mushrooms = [edibleMushroom, poisonousMushroom];
    const result = filterPlantsForView(mushrooms, "mushroom");
    expect(result.map((p) => p.germanName)).toEqual(["Champignon", "Fliegenpilz"]);
  });

  it("non-mushroom views pass the full list through unchanged", () => {
    const plants = [poisonousPlant, ediblePlant, tree];
    expect(filterPlantsForView(plants, "poisonous")).toEqual(plants);
    expect(filterPlantsForView(plants, "edible")).toEqual(plants);
    expect(filterPlantsForView(plants, "tree")).toEqual(plants);
  });
});

// ---------------------------------------------------------------------------
// viewCategoryOf
// ---------------------------------------------------------------------------

describe("viewCategoryOf", () => {
  it("maps every mushroom to the single mushroom category regardless of status", () => {
    expect(viewCategoryOf(edibleMushroom)).toBe("mushroom");
    expect(viewCategoryOf(poisonousMushroom)).toBe("mushroom");
  });

  it("maps other plants to their own category", () => {
    expect(viewCategoryOf(tree)).toBe("tree");
    expect(viewCategoryOf(ediblePlant)).toBe("edible");
  });
});

// ---------------------------------------------------------------------------
// computeCategorySummary
// ---------------------------------------------------------------------------

describe("computeCategorySummary", () => {
  it("returns [] when plants are undefined", () => {
    expect(computeCategorySummary(undefined)).toEqual([]);
  });

  it("returns [] for an empty list", () => {
    expect(computeCategorySummary([])).toEqual([]);
  });

  it("counts total, poisonous, and edible per category", () => {
    const summary = computeCategorySummary(ALL_PLANTS);
    const mushroom = summary.find((s) => s.category === "mushroom");
    expect(mushroom).toBeDefined();
    expect(mushroom!.count).toBe(2);
    expect(mushroom!.poisonousCount).toBe(1);
    expect(mushroom!.edibleCount).toBe(1);
  });

  it("groups plants by category correctly", () => {
    const summary = computeCategorySummary(ALL_PLANTS);
    const categories = summary.map((s) => s.category).sort();
    expect(categories).toEqual(["edible", "mushroom", "poisonous", "tree"].sort());
  });

  it("plants that are neither edible nor poisonous do not inflate poisonousCount or edibleCount", () => {
    const medic = makePlant({ category: "medicinal", humanStatus: "unknown" as never });
    const summary = computeCategorySummary([medic]);
    const row = summary.find((s) => s.category === "medicinal");
    expect(row!.count).toBe(1);
    expect(row!.poisonousCount).toBe(0);
    expect(row!.edibleCount).toBe(0);
  });

  it("each plant is counted exactly once", () => {
    const summary = computeCategorySummary(ALL_PLANTS);
    const total = summary.reduce((acc, s) => acc + s.count, 0);
    expect(total).toBe(ALL_PLANTS.length);
  });
});

// ---------------------------------------------------------------------------
// viewCount
// ---------------------------------------------------------------------------

describe("viewCount", () => {
  const summary = computeCategorySummary(ALL_PLANTS);

  it("returns the total count for the mushroom category (edible + poisonous)", () => {
    expect(viewCount(summary, "mushroom")).toBe(2);
  });

  it("returns total count for other view categories", () => {
    const treeCount = viewCount(summary, "tree");
    expect(treeCount).toBe(1);
  });

  it("returns 0 when the category is not in the summary", () => {
    expect(viewCount(summary, "shrub")).toBe(0);
    expect(viewCount(summary, "moss")).toBe(0);
  });

  it("returns 0 when summary is undefined", () => {
    expect(viewCount(undefined, "mushroom")).toBe(0);
  });
});
