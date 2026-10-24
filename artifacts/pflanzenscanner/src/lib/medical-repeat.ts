// Erinnerung aus der Gesundheitsakte (docs/gesundheit-erinnerung.md): a new
// deworming or vaccination can become the animal's stall task, due one
// interval after the treatment.

import type { MedicalRepeat, TaskIntervalUnit } from "@workspace/api-client-react";

export type RepeatKind = MedicalRepeat["kind"];

export const REPEAT_LABELS: Record<RepeatKind, { label: string; task: string }> = {
  deworm: { label: "Entwurmung", task: "Entwurmen" },
  vaccinate: { label: "Impfung", task: "Impfen" },
};

/** A first guess, so the usual intervals are already filled in; the vet decides. */
export const REPEAT_DEFAULTS: Record<RepeatKind, { every: number; unit: TaskIntervalUnit }> = {
  deworm: { every: 3, unit: "Monate" },
  vaccinate: { every: 12, unit: "Monate" },
};

/** What the entry is about, from what was typed: "Entwurmung" → deworm, "Impfung RHD" → vaccinate. */
export function guessRepeatKind(...texts: (string | null | undefined)[]): RepeatKind | null {
  const all = texts.filter(Boolean).join(" ").toLowerCase();
  if (/wurm|würm|kokzid|parasit/.test(all)) return "deworm";
  if (/impf|vakzin/.test(all)) return "vaccinate";
  return null;
}

const DAYS: Record<TaskIntervalUnit, number> = { Tage: 1, Wochen: 7, Monate: 30 };

/** The day the reminder is due – the server counts the same way (a month = 30 days). */
export function repeatDue(date: string, every: number, unit: TaskIntervalUnit): string {
  const due = new Date(`${date}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + every * DAYS[unit]);
  return due.toISOString().slice(0, 10);
}
