import type { DashboardWidgetId, ModuleId } from "@workspace/api-client-react";

/**
 * The modules of Little Farming (docs/module.md). Every account can hide any
 * of them – a whole area (Pflanzen, Tiere) or a single module. Basis modules
 * carry no label; modules with paid features show "Lite" without and
 * "Premium" with Premium. The ids are ModuleId in the API.
 */

export type ModuleArea = "pflanzen" | "tiere";

export interface ModuleDef {
  id: ModuleId;
  area: ModuleArea;
  label: string;
  hint: string;
  /** "lite": works for free, Premium adds more (the AI). "base": no label. */
  tier: "base" | "lite";
  /** The area itself (its tab in the bottom bar), not a module in it. */
  isArea?: boolean;
}

export const MODULES: readonly ModuleDef[] = [
  { id: "plants", area: "pflanzen", label: "Bereich Pflanzen", hint: "Der Reiter „Pflanzen“ unten", tier: "base", isArea: true },
  { id: "my-plants", area: "pflanzen", label: "Meine Pflanzen", hint: "Scans, Zimmer, Beet", tier: "base" },
  { id: "care-plan", area: "pflanzen", label: "Pflegeplan", hint: "Aufgaben & Erinnerungen", tier: "base" },
  { id: "plant-doc", area: "pflanzen", label: "Pflanzendoc", hint: "Diagnose & Pflege-Guide", tier: "base" },
  { id: "pests", area: "pflanzen", label: "Schädlinge & Nützlinge", hint: "Bio & chemisch", tier: "base" },
  { id: "lexicon", area: "pflanzen", label: "Lexikon", hint: "Alle Arten · mit Pilzen", tier: "base" },
  { id: "herb-witch", area: "pflanzen", label: "Kräuter-Hexe", hint: "Heilkräuter-Ratgeber", tier: "base" },
  { id: "garden", area: "pflanzen", label: "Beet-Architekt", hint: "Beete, Standort, Saatgut", tier: "base" },
  { id: "pantry", area: "pflanzen", label: "Vorratskammer", hint: "Eingekochtes, Eingefrorenes, Honig", tier: "base" },
  { id: "grow", area: "pflanzen", label: "Grow", hint: "Eigenanbau ab 18 · KI-Check mit Premium", tier: "lite" },
  { id: "animals", area: "tiere", label: "Bereich Tiere", hint: "Der Reiter „Tiere“ unten", tier: "base", isArea: true },
  { id: "farm-tasks", area: "tiere", label: "Stall-Aufgaben", hint: "Füttern, Ausmisten, Erinnerungen", tier: "base" },
  { id: "feed", area: "tiere", label: "Futterplaner", hint: "Rationen, Bedarf, Vorrat", tier: "base" },
  { id: "breeding", area: "tiere", label: "Zucht", hint: "Trächtigkeit, Brut, Jungtiere", tier: "base" },
  { id: "medicines", area: "tiere", label: "Arzneimittel", hint: "Vorrat, Charge, Wartezeit", tier: "base" },
  { id: "duties", area: "tiere", label: "Pflichten & Tierseuchen", hint: "Anmeldung, Kasse, Stallpflicht", tier: "base" },
  { id: "yields", area: "tiere", label: "Ertrag & Bilanz", hint: "Eier, Milch, Ernte, Kosten", tier: "base" },
  { id: "pasture", area: "tiere", label: "Weide", hint: "Flächen, Weidetagebuch, Ruhezeit", tier: "base" },
  { id: "bees", area: "tiere", label: "Bienen", hint: "Stockkarte, Varroa, Honig", tier: "base" },
  { id: "wildlife", area: "tiere", label: "Wildtier-Radar", hint: "Kameras & Raubtier-Alarm", tier: "base" },
  { id: "handover", area: "tiere", label: "Übergabe", hint: "Vertretung für ein paar Tage", tier: "base" },
  { id: "members", area: "tiere", label: "Farm & Team", hint: "Team, Vertretung, Kontakte", tier: "base" },
  { id: "export", area: "tiere", label: "Veterinäramt-Export", hint: "Bestandsliste & Medizin als PDF", tier: "base" },
];

const AREA_OF: Record<ModuleArea, ModuleId> = { pflanzen: "plants", tiere: "animals" };

/** Which module a dashboard widget belongs to – it goes when its module goes. */
export const WIDGET_MODULE: Record<DashboardWidgetId, ModuleId> = {
  "plant-tasks": "care-plan",
  garden: "garden",
  seeds: "garden",
  grow: "grow",
  "farm-tasks": "farm-tasks",
  animals: "animals",
  duties: "duties",
  feed: "feed",
  medicines: "medicines",
  breeding: "breeding",
  yields: "yields",
};

/** Shown unless it or its area is hidden. */
export function moduleVisible(hidden: readonly ModuleId[], id: ModuleId): boolean {
  if (hidden.includes(id)) return false;
  const def = MODULES.find((m) => m.id === id);
  return !def || def.isArea || !hidden.includes(AREA_OF[def.area]);
}

/** "Lite" or "Premium" for modules with paid features, nothing for the basis. */
export function tierLabel(id: ModuleId, premium: boolean): "Lite" | "Premium" | null {
  return MODULES.find((m) => m.id === id)?.tier === "lite" ? (premium ? "Premium" : "Lite") : null;
}

export function toggleModule(hidden: readonly ModuleId[], id: ModuleId): ModuleId[] {
  return hidden.includes(id) ? hidden.filter((m) => m !== id) : [...hidden, id];
}

/**
 * Modul-Freigaben (docs/team.md): the farm modules an admin can grant per
 * member – the same list as FARM_MODULES on the server.
 */
export const FARM_MODULE_IDS: readonly ModuleId[] = ["farm-tasks", "feed", "breeding", "medicines", "duties", "yields", "wildlife", "handover", "export", "members", "garden", "bees", "pantry", "pasture"];

/** Whether the viewer may use `id` on this farm (admins and members without a list: everything). */
export function farmModuleGranted(farm: { role: string; modules?: readonly ModuleId[] | null } | null | undefined, id: ModuleId): boolean {
  if (!farm || farm.role === "admin" || !farm.modules) return true;
  return !FARM_MODULE_IDS.includes(id) || farm.modules.includes(id);
}

/** "Alle Module" or "3 von 11 Modulen". */
export function grantSummary(modules: readonly ModuleId[] | null | undefined): string {
  if (!modules) return "Alle Module";
  const n = modules.filter((m) => FARM_MODULE_IDS.includes(m)).length;
  return n === 0 ? "Keine Module" : `${n} von ${FARM_MODULE_IDS.length} Modulen`;
}
