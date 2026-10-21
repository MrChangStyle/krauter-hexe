import type { FarmSummary } from "@workspace/api-client-react";

/**
 * Which farm "Meine Farm" shows. Stored per device; every request names its
 * farm explicitly (/farms/:farmId/...), so this is only a display choice and
 * grants nothing.
 */
const KEY = "lf-active-farm";

export function readActiveFarmId(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  } catch {
    return null;
  }
}

export function writeActiveFarmId(id: number): void {
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    /* ignore */
  }
}

/** The remembered farm if the account still belongs to it, else the first. */
export function pickActiveFarm(farms: FarmSummary[], remembered: number | null): FarmSummary | null {
  return farms.find((f) => f.id === remembered) ?? farms[0] ?? null;
}

export const FARM_ROLE_LABELS: Record<FarmSummary["role"], string> = {
  admin: "Admin",
  caretaker: "Mitarbeiter",
  guest: "Gast",
};

export const FARM_ROLE_HINTS: Record<FarmSummary["role"], string> = {
  admin: "alles, auch das Team verwalten",
  caretaker: "Einträge anlegen und bearbeiten",
  guest: "nur ansehen",
};
