import type { FarmAnimal, Fertilizing, Herd, MedicalRecord, RationEvaluation, Seed } from "@workspace/api-client-react";
import { addDays } from "./garden-calendar";
import { FERTILIZER_LABELS } from "./fertilizing";
import { ORGANIC_TREATMENT_LIMIT, chemicalTreatments } from "./farm-health";
import { spaceCheck } from "./organic-space";

/**
 * Bio-Check (docs/bio.md, B5): one light per area of an organic farm, built
 * from what the modules already know.
 */
export type CheckStatus = "ok" | "warn" | "open";

export interface CheckArea {
  key: "feed" | "space" | "treatments" | "seeds" | "fertilizer";
  label: string;
  status: CheckStatus;
  /** One short line: what is fine or what is missing. */
  text: string;
  href: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Futter: the active rations' shares against the Richtwerte. */
export function feedArea(rations: readonly RationEvaluation[] | undefined): CheckArea {
  const base = { key: "feed" as const, label: "Futter", href: "/farm/futter" };
  const active = (rations ?? []).filter((r) => r.active && r.organic);
  if (active.length === 0) return { ...base, status: "open", text: "Noch keine Ration – im Futterplaner anlegen." };
  const failing = active.filter((r) => r.organic!.checks.some((c) => !c.ok));
  const missing = new Set(active.flatMap((r) => r.organic!.missing));
  if (failing.length > 0) {
    return { ...base, status: "warn", text: `${plural(failing.length, "Ration hält", "Rationen halten")} die Bio-Anteile nicht ein: ${failing.map((r) => r.target.name).join(", ")}.` };
  }
  if (missing.size > 0) return { ...base, status: "open", text: `Herkunft fehlt bei ${plural(missing.size, "Futtermittel", "Futtermitteln")}: ${[...missing].join(", ")}.` };
  return { ...base, status: "ok", text: `${plural(active.length, "Ration hält", "Rationen halten")} die Bio-Anteile ein.` };
}

/** Platz: stall and run of each group with values for its species. */
export function spaceArea(herds: readonly Herd[] | undefined): CheckArea {
  const base = { key: "space" as const, label: "Platz", href: "/farm/tiere" };
  const checked = (herds ?? []).map((h) => ({ h, c: spaceCheck(h.species, h.animalCount, h.stallM2, h.runM2) })).filter((x) => x.c);
  if (checked.length === 0) return { ...base, status: "open", text: "Keine Gruppe mit Bio-Mindestflächen – Gruppen unter Meine Tiere anlegen." };
  const tooSmall = checked.filter((x) => x.c!.stallOk === false || x.c!.runOk === false);
  if (tooSmall.length > 0) return { ...base, status: "warn", text: `Zu wenig Platz: ${tooSmall.map((x) => x.h.name).join(", ")}.` };
  const unknown = checked.filter((x) => x.c!.stallOk === null || x.c!.runOk === null);
  if (unknown.length > 0) return { ...base, status: "open", text: `Flächen fehlen: ${unknown.map((x) => x.h.name).join(", ")}.` };
  return { ...base, status: "ok", text: `${plural(checked.length, "Gruppe hat", "Gruppen haben")} genug Stall und Auslauf.` };
}

/** Behandlungen: chemical treatments per animal in the last 12 months. */
export function treatmentArea(animals: readonly FarmAnimal[] | undefined, records: readonly MedicalRecord[] | undefined, today: string): CheckArea {
  const base = { key: "treatments" as const, label: "Behandlungen", href: "/farm/tiere" };
  const active = (animals ?? []).filter((a) => !a.archivedAt);
  const byAnimal = new Map<number, MedicalRecord[]>();
  for (const r of records ?? []) byAnimal.set(r.animalId, [...(byAnimal.get(r.animalId) ?? []), r]);
  const atLimit = active.filter((a) => chemicalTreatments(byAnimal.get(a.id) ?? [], today) >= ORGANIC_TREATMENT_LIMIT);
  if (atLimit.length > 0) {
    return { ...base, status: "warn", text: `${atLimit.map((a) => a.name).join(", ")}: ${ORGANIC_TREATMENT_LIMIT} oder mehr chemisch-synthetische Behandlungen in 12 Monaten.` };
  }
  return { ...base, status: "ok", text: active.length === 0 ? "Keine Tiere mit Behandlungen." : `Kein Tier über ${ORGANIC_TREATMENT_LIMIT - 1} chemisch-synthetischen Behandlungen in 12 Monaten.` };
}

/**
 * Saatgut (B7): seed that is not organic. Seed saved on the farm itself counts
 * as organic; archived lots do not count.
 */
export function conventionalSeeds(seeds: readonly Seed[]): { conventional: Seed[]; unknown: Seed[] } {
  const relevant = seeds.filter((s) => !s.archived && s.source !== "saved");
  return { conventional: relevant.filter((s) => s.organic === false), unknown: relevant.filter((s) => s.organic === null) };
}

export function seedArea(seeds: readonly Seed[] | undefined): CheckArea {
  const base = { key: "seeds" as const, label: "Saatgut", href: "/beete/saatgut" };
  const active = (seeds ?? []).filter((s) => !s.archived);
  if (active.length === 0) return { ...base, status: "open", text: "Noch kein Saatgut eingetragen." };
  const { conventional, unknown } = conventionalSeeds(active);
  if (conventional.length > 0) return { ...base, status: "warn", text: `Konventionell (nur mit Ausnahmegenehmigung): ${conventional.map((s) => s.name).join(", ")}.` };
  if (unknown.length > 0) return { ...base, status: "open", text: `Bio-Saatgut nicht angegeben: ${unknown.map((s) => s.name).join(", ")}.` };
  return { ...base, status: "ok", text: `${plural(active.length, "Saatgut ist", "Saatgüter sind")} Bio oder vom eigenen Hof.` };
}

/** Dünger (B7): mineral fertiliser on a bed in the last 12 months is not allowed on an organic farm. */
export function fertilizerArea(entries: readonly Fertilizing[] | undefined, today: string): CheckArea {
  const base = { key: "fertilizer" as const, label: "Dünger", href: "/beete" };
  const from = addDays(today, -365);
  const recent = (entries ?? []).filter((f) => f.date > from && f.date <= today);
  const mineral = recent.filter((f) => f.kind === "mineral");
  if (mineral.length > 0) {
    return { ...base, status: "warn", text: `Mineraldünger in 12 Monaten: ${[...new Set(mineral.map((f) => f.bedName))].join(", ")} – im Ökolandbau nicht zugelassen.` };
  }
  if (recent.length === 0) return { ...base, status: "open", text: "Keine Düngung in 12 Monaten eingetragen – im Beet unter „Düngung“." };
  return { ...base, status: "ok", text: `${plural(recent.length, "Düngung", "Düngungen")} in 12 Monaten, alle organisch.` };
}

// ── Bio-Dokumentation (PDF) ──────────────────────────────────────────────────

const pct = (n: number) => `${Math.round(n)} %`;

export const ORGANIC_FEED_COLUMNS = ["Tier / Gruppe", "Bio-Anteil", "Umstellung (zugekauft)", "Vom Hof / Region", "Raufutter", "Herkunft fehlt"] as const;

/** One row per active ration on the organic farm. */
export function organicFeedRows(rations: readonly RationEvaluation[]): string[][] {
  return rations
    .filter((r) => r.active && r.organic)
    .map((r) => {
      const share = (key: string) => {
        const c = r.organic!.checks.find((x) => x.key === key);
        return c ? `${pct(c.value)}${c.ok ? "" : " (!)"}` : "–";
      };
      return [`${r.target.name} (${r.target.count})`, share("organic"), share("conversion"), share("ownFarm"), share("roughage"), r.organic!.missing.join(", ") || "–"];
    });
}

export const ORGANIC_SPACE_COLUMNS = ["Gruppe", "Tiere", "Stall", "Stall mind.", "Auslauf", "Auslauf mind."] as const;

const m2 = (n: number | null) => (n == null ? "nicht angegeben" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²`);

export function organicSpaceRows(herds: readonly Herd[]): string[][] {
  return herds.flatMap((h) => {
    const c = spaceCheck(h.species, h.animalCount, h.stallM2, h.runM2);
    if (!c) return [];
    const mark = (ok: boolean | null) => (ok === false ? " (!)" : "");
    return [[h.name, String(h.animalCount), m2(h.stallM2) + mark(c.stallOk), m2(c.stallNeeded), m2(h.runM2) + mark(c.runOk), m2(c.runNeeded)]];
  });
}

export const GRAZING_COLUMNS = ["Weide", "Tiere", "Anzahl", "Von", "Bis"] as const;

/** Grazings that overlap the period, oldest first. */
export function grazingRows(
  pastures: readonly { name: string; grazings: readonly { label: string; animals: number; startOn: string; endOn: string | null }[] }[],
  period: { from: string; to: string },
  deDate: (iso: string) => string,
): string[][] {
  return pastures
    .flatMap((p) => p.grazings.map((g) => ({ p, g })))
    .filter(({ g }) => g.startOn <= period.to && (!g.endOn || g.endOn >= period.from))
    .sort((a, b) => a.g.startOn.localeCompare(b.g.startOn))
    .map(({ p, g }) => [p.name, g.label, String(g.animals), deDate(g.startOn), g.endOn ? deDate(g.endOn) : "läuft"]);
}

export const SEED_COLUMNS = ["Saatgut", "Sorte", "Herkunft", "Bio", "Samenfest", "Erntejahr", "Menge"] as const;

/** Seed lots on hand; "(!)" marks conventional seed. */
export function seedRows(seeds: readonly Seed[], sourceLabel: (s: Seed) => string, amount: (s: Seed) => string): string[][] {
  const yesNo = (v: boolean | null, yes: string, no: string) => (v === null ? "–" : v ? yes : no);
  return seeds
    .filter((s) => !s.archived)
    .map((s) => [
      s.name,
      s.variety ?? "–",
      sourceLabel(s),
      s.source === "saved" && s.organic === null ? "eigener Hof" : yesNo(s.organic, "Bio", "konventionell (!)"),
      yesNo(s.openPollinated, "ja", "F1"),
      s.harvestYear ? String(s.harvestYear) : "–",
      amount(s),
    ]);
}

export const FERTILIZER_COLUMNS = ["Datum", "Beet", "Dünger", "Bezeichnung", "Menge"] as const;

/** Entries in the period, oldest first; "(!)" marks mineral fertiliser. */
export function fertilizerRows(entries: readonly Fertilizing[], period: { from: string; to: string }, deDate: (iso: string) => string): string[][] {
  return entries
    .filter((f) => f.date >= period.from && f.date <= period.to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((f) => [
      deDate(f.date),
      f.bedName,
      FERTILIZER_LABELS[f.kind] + (f.kind === "mineral" ? " (!)" : ""),
      f.label ?? "–",
      f.amountKg == null ? "–" : `${f.amountKg.toLocaleString("de-DE")} kg`,
    ]);
}
