import type {
  CategoryCount,
  HumanStatus,
  Plant,
  PlantCategory,
} from "@workspace/api-client-react";

// All mushrooms are shown in the single "Pilze" category (the giftig/essbar
// info is carried by the safety badge on each card). The historical
// mushroom_poisonous/mushroom_edible split was removed on user request.
export const VIEW_CATEGORIES = [
  "poisonous",
  "edible",
  "medicinal",
  "mushroom",
  "tree",
  "shrub",
  "moss",
  "cactus",
] as const;

export type ViewCategory = (typeof VIEW_CATEGORIES)[number];

export const VIEW_CATEGORY_LABELS: Record<ViewCategory, string> = {
  poisonous: "Giftige Pflanzen",
  edible: "Ungiftige Pflanzen",
  medicinal: "Heilkräuter",
  mushroom: "Pilze",
  tree: "Bäume",
  shrub: "Sträucher",
  moss: "Moose und Flechten",
  cactus: "Kakteen & Sukkulenten",
};

/** Colour of each kind – the Arten tiles in the Lexikon and the filter of Meine Pflanzen. */
export const VIEW_CATEGORY_COLORS: Record<ViewCategory, string> = {
  poisonous:          "bg-rose-100   text-rose-800   border-rose-200   dark:bg-rose-950/50   dark:text-rose-300",
  edible:             "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300",
  medicinal:          "bg-indigo-100  text-indigo-800  border-indigo-200  dark:bg-indigo-950/50  dark:text-indigo-300",
  mushroom:           "bg-amber-100   text-amber-800   border-amber-200   dark:bg-amber-950/50   dark:text-amber-300",
  tree:               "bg-teal-100    text-teal-800    border-teal-200    dark:bg-teal-950/50    dark:text-teal-300",
  shrub:              "bg-lime-100    text-lime-800    border-lime-200    dark:bg-lime-950/50    dark:text-lime-300",
  moss:               "bg-cyan-100    text-cyan-800    border-cyan-200    dark:bg-cyan-950/50    dark:text-cyan-300",
  cactus:             "bg-orange-100  text-orange-800  border-orange-200  dark:bg-orange-950/50  dark:text-orange-300",
};

/** The API category a view category is loaded from. */
export function apiCategoryOf(view: ViewCategory): PlantCategory {
  return view as PlantCategory;
}

/**
 * The humanStatus filter for a view category.
 * Returns null for categories that don't need a humanStatus filter.
 * (No view category filters by humanStatus anymore since the mushroom
 * split was removed; kept for API stability.)
 */
export function humanStatusOf(_view: ViewCategory): HumanStatus | null {
  return null;
}

/** Narrow a category's plant list down to the given view category. */
export function filterPlantsForView(
  plants: Plant[],
  view: ViewCategory,
): Plant[] {
  const statusFilter = humanStatusOf(view);
  if (statusFilter === null) return plants;
  return plants.filter((p) => p.humanStatus === statusFilter);
}

/**
 * Build the category summary (counts + poisonous/edible split) from the full
 * plant list on the client. This mirrors the server's /categories/summary
 * aggregation so the categories page depends only on the already-cached
 * /api/plants list and works fully offline.
 */
export function computeCategorySummary(
  plants: Plant[] | undefined,
): CategoryCount[] {
  if (!plants) return [];
  const byCategory = new Map<PlantCategory, CategoryCount>();
  for (const plant of plants) {
    const category = plant.category as PlantCategory;
    let row = byCategory.get(category);
    if (!row) {
      row = { category, count: 0, poisonousCount: 0, edibleCount: 0 };
      byCategory.set(category, row);
    }
    row.count += 1;
    if (plant.humanStatus === "poisonous") row.poisonousCount += 1;
    else if (plant.humanStatus === "edible") row.edibleCount += 1;
  }
  return [...byCategory.values()];
}

/**
 * Derive the ViewCategory for a single plant. Used by the detail page back
 * button so it can deep-link directly into the right category drill-down.
 */
export function viewCategoryOf(plant: Plant): ViewCategory {
  return plant.category as ViewCategory;
}

/** Entry count of a view category, from the lightweight summary counts. */
export function viewCount(
  summary: CategoryCount[] | undefined,
  view: ViewCategory,
): number {
  const row = summary?.find((s) => s.category === apiCategoryOf(view));
  if (!row) return 0;
  const status = humanStatusOf(view);
  if (status === "poisonous") return row.poisonousCount;
  if (status === "edible") return row.edibleCount;
  return row.count;
}
