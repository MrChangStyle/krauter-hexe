import type { BillingInterval, BillingTier, Premium } from "@workspace/api-client-react";
import { planById, priceText } from "@/lib/site";

/**
 * Paket & Abo (docs/bezahlung.md): how the app names the account's Paket and
 * its daily AI limit. The numbers mirror AI_DAILY_LIMITS on the server
 * (lib/premium.ts) and PLANS on the homepage.
 */

export const INTERVAL_LABELS: Record<BillingInterval, string> = { monthly: "monatlich", yearly: "jährlich" };

/** "Testphase – alles kostenlos", "Lite", "Premium", "Basis" … */
export function paketLabel(p: Pick<Premium, "active" | "source" | "tier">): string {
  if (!p.active) return "Basis";
  if (p.source === "test") return "Testphase – alles kostenlos";
  if (p.source === "tester") return "Tester – dauerhaft kostenlos";
  if (p.source === "owner") return "Betreiber";
  if (p.source === "manual") return "Premium (geschenkt)";
  return p.tier === "lite" ? "Lite" : "Premium";
}

/** KI-Anfragen per day and kind; null = no limit (owner). */
export function aiPerDay(p: Pick<Premium, "active" | "source" | "tier">): number | null {
  if (p.source === "owner") return null;
  if (!p.active) return planById("basis").aiPerDay;
  if (p.source === "test" || p.source === "tester") return 15;
  return planById(p.tier === "lite" ? "lite" : "premium").aiPerDay;
}

/** "2,99 € im Monat" / "29,90 € im Jahr" */
export function priceLine(tier: BillingTier, interval: BillingInterval): string {
  const plan = planById(tier);
  return interval === "monthly" ? `${priceText(plan.monthly)} im Monat` : `${priceText(plan.yearly)} im Jahr`;
}

/** "bis 31.12.2026" from an ISO timestamp (Berlin day). */
export function untilText(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "numeric", year: "numeric" });
}
