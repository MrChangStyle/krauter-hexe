import type {
  GrowCostCategory,
  GrowEnvironment,
  GrowFlowering,
  GrowHealthFindingCategory,
  GrowHealthResultStatus,
  GrowMedium,
  GrowPhaseKey,
  GrowSeedSex,
  GrowTrichomeResultStage,
  StrainType,
} from "@workspace/api-client-react";

/** The Grow module can be switched off for builds that go into the app stores. */
export const GROW_ENABLED = import.meta.env.VITE_DISABLE_GROW !== "true";

export const ENVIRONMENT_LABELS: Record<GrowEnvironment, string> = {
  indoor: "Indoor im Zelt",
  outdoor: "Outdoor im Freien",
  greenhouse: "Im Gewächshaus",
};

export const MEDIUM_LABELS: Record<GrowMedium, string> = {
  soil: "Erde",
  coco: "Kokos",
  hydro: "Hydro",
};

export const STRAIN_TYPE_LABELS: Record<StrainType, string> = {
  indica: "Indica",
  sativa: "Sativa",
  hybrid: "Hybrid",
  ruderalis: "Ruderalis",
};

export const FLOWERING_LABELS: Record<GrowFlowering, string> = {
  photo: "Photoperiodisch",
  auto: "Autoflower",
};

export const SEED_SEX_LABELS: Record<GrowSeedSex, string> = {
  feminized: "Feminisiert",
  regular: "Regulär",
  unknown: "Unbekannt",
};

export const PHASE_LABELS: Record<GrowPhaseKey, string> = {
  germination: "Keimung",
  seedling: "Sämling",
  veg: "Wachstum",
  flower: "Blüte",
  flush: "Spülen",
  drying: "Trocknen",
  curing: "Curing",
  done: "Fertig",
};

/** One colour per phase for the timeline (text stays in the normal ink). */
export const PHASE_COLORS: Record<GrowPhaseKey, string> = {
  germination: "#C9B79C",
  seedling: "#A7C957",
  veg: "#4C956C",
  flower: "#B5838D",
  flush: "#6D9DC5",
  drying: "#BC8A5F",
  curing: "#8D6E63",
  done: "#9E9E9E",
};

/** Default flowering weeks, as on the server (lib/growPlan.ts) – for the form's preview. */
export function defaultFlowerWeeks(type: StrainType, flowering: GrowFlowering): number {
  if (flowering === "auto" || type === "ruderalis") return 7;
  return { indica: 8, hybrid: 9, sativa: 11 }[type];
}

/** "22–26 °C", "6,2–6,8", null when there is no range. */
export function rangeText(range: number[] | null | undefined, unit = ""): string | null {
  if (!range || range.length !== 2) return null;
  const f = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return `${f(range[0]!)}–${f(range[1]!)}${unit ? ` ${unit}` : ""}`;
}

/** "Woche 3 der Blüte" style day count: "Tag 32". */
export function dayText(day: number): string {
  return `Tag ${day} · Woche ${Math.ceil(day / 7)}`;
}

export const FINDING_LABELS: Record<GrowHealthFindingCategory, string> = {
  deficiency: "Mangel",
  excess: "Überdüngung",
  pest: "Schädling",
  disease: "Krankheit/Schimmel",
  environment: "Umwelt-Stress",
  other: "Sonstiges",
};

export const HEALTH_STATUS_LABELS: Record<GrowHealthResultStatus, string> = {
  healthy: "Sieht gesund aus",
  watch: "Beobachten",
  problem: "Handlungsbedarf",
};

export const TRICHOME_STAGE_LABELS: Record<GrowTrichomeResultStage, string> = {
  early: "Noch zu früh",
  window: "Erntefenster",
  late: "Spät – bald ernten",
};

export const COST_CATEGORY_LABELS: Record<GrowCostCategory, string> = {
  equipment: "Ausrüstung",
  soil: "Erde/Substrat",
  fertilizer: "Dünger",
  seeds: "Samen",
  water: "Wasser",
  other: "Sonstiges",
};
