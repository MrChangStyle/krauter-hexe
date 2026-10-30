import type { ModuleId } from "@workspace/api-client-react";

/**
 * Tierarzt-Zugang (docs/team.md): a stand-in with an end date who sees the
 * animals and their Krankenakte (always open) plus the Arzneimittel-Vorrat and
 * the Bestandsliste – nothing else of the farm.
 */
export const VET_MODULES: ModuleId[] = ["medicines", "export"];

/** How long the access lasts unless the admin picks another day (Richtwert). */
export const VET_ACCESS_DAYS = 14;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The form preset: the end date. The vet is added by Nutzer-ID (docs/konto.md), which the contacts do not know. */
export function vetInviteDefaults(today: string): { until: string } {
  return { until: addDays(today, VET_ACCESS_DAYS) };
}

/** True when the member's grants are exactly the vet's. */
export function isVetGrant(modules: readonly string[] | null | undefined): boolean {
  return !!modules && modules.length === VET_MODULES.length && VET_MODULES.every((m) => modules.includes(m));
}
