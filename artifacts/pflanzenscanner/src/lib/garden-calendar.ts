import type { BedPlanting, Crop, GardenCalendarEntry, GardenEventKind } from "@workspace/api-client-react";

export const KIND_LABELS: Record<GardenEventKind, string> = {
  sow_indoor: "Vorziehen",
  direct_sow: "Direkt säen",
  plant_out: "Auspflanzen",
  harvest: "Ernte",
};

export const KIND_DONE: Record<GardenEventKind, string> = {
  sow_indoor: "vorgezogen",
  direct_sow: "gesät",
  plant_out: "ausgepflanzt",
  harvest: "abgeerntet",
};

export const KIND_COLORS: Record<GardenEventKind, string> = {
  sow_indoor: "#C9A227",
  direct_sow: "#7DBB6A",
  plant_out: "#2F6B3F",
  harvest: "#E2683C",
};

export const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Today on this device, YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2026-03-06" → "6.3." */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d}.${m}.`;
}

export function dayRange(start: string, end: string): string {
  return start === end ? shortDay(start) : `${shortDay(start)}–${shortDay(end)}`;
}

/** Does the entry fall into this month (1–12)? */
export function inMonth(entry: Pick<GardenCalendarEntry, "start" | "end">, year: number, month: number): boolean {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return entry.start <= last && entry.end >= first;
}

/** Position of a date range on a one-year bar (0–1), clipped to the year. */
export function yearSpan(start: string, end: string, year: number): { left: number; width: number } | null {
  const t0 = Date.UTC(year, 0, 1);
  const t1 = Date.UTC(year + 1, 0, 1);
  const a = Math.max(t0, Date.parse(`${start}T00:00:00Z`));
  const b = Math.min(t1, Date.parse(`${end}T00:00:00Z`) + 86_400_000);
  if (b <= a) return null;
  return { left: (a - t0) / (t1 - t0), width: (b - a) / (t1 - t0) };
}

/** Due now (window open today) or starting within the next days. */
export function upcoming(entries: GardenCalendarEntry[], today: string, days = 14) {
  const open = entries.filter((e) => e.open);
  return {
    now: open.filter((e) => e.start <= today && e.end >= today).sort((a, b) => a.end.localeCompare(b.end)),
    soon: open.filter((e) => e.start > today && e.start <= addDays(today, days)),
  };
}

// ── Fruchtfolge ──────────────────────────────────────────────────────────────

/** Years a plant family should not come back to the same spot. */
export const ROTATION_YEARS = 3;

export interface RotationIssue {
  kind: "family" | "heavy";
  season: number;
  label: string;
  family: string;
}

type Rect = Pick<BedPlanting, "x" | "y" | "w" | "h">;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Crop rotation for a crop on these cells: the same family in one of the last
 * three seasons, or a heavy feeder right after a heavy feeder. Newest first.
 */
export function rotationIssues(rect: Rect, crop: Crop, season: number, history: BedPlanting[], crops: Map<string, Crop>): RotationIssue[] {
  const issues: RotationIssue[] = [];
  for (const p of history) {
    if (p.season >= season || p.season < season - ROTATION_YEARS || !p.cropKey || !overlaps(rect, p)) continue;
    const before = crops.get(p.cropKey);
    if (!before) continue;
    if (before.family === crop.family) issues.push({ kind: "family", season: p.season, label: p.label, family: before.family });
    else if (p.season === season - 1 && before.feeder === "heavy" && crop.feeder === "heavy") {
      issues.push({ kind: "heavy", season: p.season, label: p.label, family: before.family });
    }
  }
  return issues.sort((a, b) => b.season - a.season);
}

export function rotationText(issue: RotationIssue): string {
  return issue.kind === "family"
    ? `${issue.season} stand hier ${issue.label} – auch ${issue.family}. Besser ${ROTATION_YEARS} Jahre Pause.`
    : `${issue.season} stand hier ${issue.label} – Starkzehrer nach Starkzehrer laugt den Boden aus.`;
}

/** What grew in the bed in the latest seasons before this one. */
export function seasonSummary(history: BedPlanting[], crops: Map<string, Crop>, season: number, years = ROTATION_YEARS) {
  const result: { season: number; labels: string[]; families: string[] }[] = [];
  for (let s = season - 1; s >= season - years; s -= 1) {
    const plantings = history.filter((p) => p.season === s);
    const labels = [...new Set(plantings.map((p) => p.label))];
    const families = [...new Set(plantings.flatMap((p) => (p.cropKey && crops.get(p.cropKey) ? [crops.get(p.cropKey)!.family] : [])))];
    result.push({ season: s, labels, families });
  }
  return result;
}
