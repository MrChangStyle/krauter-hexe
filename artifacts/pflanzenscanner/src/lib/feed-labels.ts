import type { FeedCategory, FeedStockLine, LifeStage, NutrientCheck, RationSeason } from "@workspace/api-client-react";

export const STAGE_LABELS: Record<LifeStage, string> = {
  maintenance: "Erhaltung",
  growth: "Wachstum",
  laying: "Legeperiode",
  molt: "Mauser",
  pregnancy: "Trächtigkeit",
  lactation: "Säugezeit / Milch",
  winter: "Winter",
};

export const CATEGORY_LABELS: Record<FeedCategory, string> = {
  roughage: "Raufutter",
  fresh: "Grünfutter",
  vegetable: "Saftfutter & Gemüse",
  grain: "Getreide",
  compound: "Fertigfutter",
  mineral: "Mineralfutter",
};

export const NUTRIENT_LABELS: Record<NutrientCheck["nutrient"], { label: string; unit: string }> = {
  amount: { label: "Menge (Trockenmasse)", unit: "kg" },
  crudeProtein: { label: "Rohprotein", unit: "%" },
  crudeFibre: { label: "Rohfaser", unit: "%" },
  calcium: { label: "Calcium", unit: "g/kg" },
  phosphorus: { label: "Phosphor", unit: "g/kg" },
  copper: { label: "Kupfer", unit: "mg/kg" },
};

/** "low"+severe → red, any other miss → yellow. */
export function light(check: Pick<NutrientCheck, "status" | "severe">): "green" | "yellow" | "red" {
  if (check.status === "ok") return "green";
  return check.severe ? "red" : "yellow";
}

export function lightText(check: Pick<NutrientCheck, "status" | "severe">): string {
  if (check.status === "ok") return "ausreichend";
  if (check.status === "low") return check.severe ? "zu wenig" : "knapp";
  return check.severe ? "deutlich zu viel" : "zu viel";
}

const num = (v: number, digits = 1) => v.toLocaleString("de-DE", { maximumFractionDigits: digits });

export function formatValue(check: Pick<NutrientCheck, "nutrient" | "value">): string {
  return `${num(check.value, check.nutrient === "amount" ? 3 : 1)} ${NUTRIENT_LABELS[check.nutrient].unit}`;
}

export function formatRange(check: Pick<NutrientCheck, "nutrient" | "min" | "max">): string {
  const d = check.nutrient === "amount" ? 3 : 1;
  return check.nutrient === "copper" ? `bis ${num(check.max, d)}` : `${num(check.min, d)}–${num(check.max, d)}`;
}

/** Grams, or kilograms from 1000 g on. */
export function grams(g: number): string {
  return g >= 1000 ? `${num(g / 1000, 2)} kg` : `${num(g, 1)} g`;
}

export const SEASON_LABELS: Record<RationSeason, string> = {
  all: "Ganzjährig",
  summer: "Sommer (Apr–Okt)",
  winter: "Winter (Nov–Mär)",
};

/** "Winterration", "Sommerration", "Ration" (all year). */
export function rationName(season: RationSeason): string {
  return season === "summer" ? "Sommerration" : season === "winter" ? "Winterration" : "Ration";
}

/** "2026-10-22" → "22.10." */
export function shortDate(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
}

export function shareText(share: number): string {
  return `${Math.round(share * 100)} %`;
}

export const STOCK_STATUS: Record<FeedStockLine["status"], { label: string; tone: string }> = {
  empty: { label: "Leer", tone: "bg-red-600 text-white" },
  soon: { label: "Bald leer", tone: "bg-amber-400 text-amber-950" },
  unknown: { label: "Nicht erfasst", tone: "bg-muted text-muted-foreground" },
  ok: { label: "Reicht", tone: "bg-emerald-600 text-white" },
  unused: { label: "Nicht in Ration", tone: "bg-muted text-muted-foreground" },
};

export function euro(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function kg(n: number): string {
  if (n > 0 && n < 1) return `${Math.round(n * 1000)} g`;
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: n < 10 ? 1 : 0 })} kg`;
}

/** Small bales of hay or straw (about 15 kg) for an amount of roughage. */
export const BALE_KG = 15;
export function bales(kgAmount: number): number {
  return Math.ceil(kgAmount / BALE_KG);
}
