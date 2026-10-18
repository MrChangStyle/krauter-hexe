import type { FarmAnimal, FarmExport, MedicalRecord, WeightLog } from "@workspace/api-client-react";
import { SEX_LABELS, SPECIES_LABELS } from "@/lib/farm-labels";

// ── Weight warning ───────────────────────────────────────────────────────────

/** A loss of more than this share … */
export const WEIGHT_LOSS_WARNING_SHARE = 0.05;
/** … within this many days before the latest weighing raises the warning. */
export const WEIGHT_LOSS_WINDOW_DAYS = 14;

export interface WeightWarning {
  lossPercent: number;
  fromKg: number;
  fromDate: string;
  toKg: number;
  toDate: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compares the latest weighing with the heaviest one in the 14 days before
 * it. Null when the animal lost 5 % or less (or there is nothing to compare).
 */
export function weightWarning(logs: WeightLog[]): WeightWarning | null {
  if (logs.length < 2) return null;
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const latest = sorted[sorted.length - 1]!;
  const windowStart = addDays(latest.date, -WEIGHT_LOSS_WINDOW_DAYS);
  let peak: WeightLog | null = null;
  for (const log of sorted.slice(0, -1)) {
    if (log.date < windowStart) continue;
    if (!peak || log.weightKg > peak.weightKg) peak = log;
  }
  if (!peak) return null;
  const loss = (peak.weightKg - latest.weightKg) / peak.weightKg;
  if (loss <= WEIGHT_LOSS_WARNING_SHARE) return null;
  return {
    lossPercent: Math.round(loss * 1000) / 10,
    fromKg: peak.weightKg,
    fromDate: peak.date,
    toKg: latest.weightKg,
    toDate: latest.date,
  };
}

// ── Withdrawal period (Wartezeit) ────────────────────────────────────────────

/** Last day of the Wartezeit, or null without one. */
export function withdrawalEnd(record: Pick<MedicalRecord, "date" | "withdrawalPeriodDays">): string | null {
  if (!record.withdrawalPeriodDays) return null;
  return addDays(record.date, record.withdrawalPeriodDays);
}

/** The latest end of a Wartezeit still running on `today`, or null. */
export function activeWithdrawalEnd(records: MedicalRecord[], today: string): string | null {
  let end: string | null = null;
  for (const r of records) {
    const e = withdrawalEnd(r);
    if (e && e >= today && (!end || e > end)) end = e;
  }
  return end;
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** "2026-05-02" → "2.5.2026" */
export function deDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${d}.${m}.${y}`;
}

/** "1 Tier", "3 Tiere" */
export function countText(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function kg(value: number): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} kg`;
}

// ── Veterinary office export ─────────────────────────────────────────────────

export interface ExportPeriod {
  from: string;
  to: string;
}

export interface ExportData {
  farmName: string;
  period: ExportPeriod;
  /** Animals kept on the farm at some point in the period. */
  animals: FarmAnimal[];
  /** Records in the period, with the animal they belong to. */
  records: { record: MedicalRecord; animal: FarmAnimal }[];
}

/** Picks what belongs into the export for the period (both ends included). */
export function exportForPeriod(data: FarmExport, period: ExportPeriod): ExportData {
  const animals = data.animals
    .filter(
      (a) =>
        a.createdAt.slice(0, 10) <= period.to &&
        (!a.archivedAt || a.archivedAt.slice(0, 10) >= period.from),
    )
    .sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber, "de"));
  const byId = new Map(data.animals.map((a) => [a.id, a]));
  const records = data.medicalRecords
    .filter((r) => r.date >= period.from && r.date <= period.to && byId.has(r.animalId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((record) => ({ record, animal: byId.get(record.animalId)! }));
  return { farmName: data.farmName, period, animals, records };
}

export const STOCK_COLUMNS = [
  "Ring-/Ohrmarke",
  "Name",
  "Tierart",
  "Rasse",
  "Geschlecht",
  "Geburtsdatum",
  "Herde",
  "Archiviert am",
] as const;

export const MEDICAL_COLUMNS = [
  "Datum",
  "Ring-/Ohrmarke",
  "Tier",
  "Diagnose",
  "Behandlung",
  "Medikament",
  "Wartezeit (Tage)",
  "Wartezeit bis",
  "Tierarzt",
] as const;

export function stockRow(a: FarmAnimal): string[] {
  return [
    a.registrationNumber,
    a.name,
    SPECIES_LABELS[a.species],
    a.breed ?? "",
    SEX_LABELS[a.sex],
    deDate(a.birthDate),
    a.herdName ?? "",
    deDate(a.archivedAt),
  ];
}

export function medicalRow({ record: r, animal: a }: ExportData["records"][number]): string[] {
  return [
    deDate(r.date),
    a.registrationNumber,
    a.name,
    r.diagnosis,
    r.treatment ?? "",
    r.medication ?? "",
    r.withdrawalPeriodDays == null ? "" : String(r.withdrawalPeriodDays),
    deDate(withdrawalEnd(r)),
    r.vet ?? "",
  ];
}

function csvCell(value: string): string {
  // A leading = + - @ would run as a formula in Excel – neutralise it.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * One CSV for Excel (semicolons, BOM): stock list, a blank line, then the
 * health history.
 */
export function exportCsv(data: ExportData): string {
  const line = (cells: readonly string[]) => cells.map(csvCell).join(";");
  const lines = [
    line([`Bestandsliste ${data.farmName}`, `${deDate(data.period.from)} – ${deDate(data.period.to)}`]),
    line(STOCK_COLUMNS),
    ...data.animals.map((a) => line(stockRow(a))),
    "",
    line(["Medizin-Historie"]),
    line(MEDICAL_COLUMNS),
    ...data.records.map((r) => line(medicalRow(r))),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function exportFileName(data: ExportData, ext: "csv" | "pdf"): string {
  const slug = data.farmName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "Farm";
  return `LittleFarming_Bestand_${slug}_${data.period.from}_${data.period.to}.${ext}`;
}
