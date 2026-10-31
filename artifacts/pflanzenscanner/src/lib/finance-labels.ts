import type { FinanceOverview, FinancePaket } from "@workspace/api-client-react";

/**
 * Finanzen (docs/finanzen.md): how the owner's finance view names Pakete,
 * writes amounts and builds the CSV for the tax advisor.
 */

export const PAKET_LABELS: Record<FinancePaket, string> = {
  premium: "Premium",
  lite: "Lite",
  manual: "Geschenkt",
  tester: "Tester",
  test: "Testphase",
  basis: "Basis",
  owner: "Betreiber",
};

/** The order of the filter chips: paying first. */
export const PAKET_ORDER: FinancePaket[] = ["premium", "lite", "manual", "tester", "test", "basis", "owner"];

/** 1234 → "12,34 €"; -50 → "−0,50 €" */
export function euro(cents: number): string {
  const text = (Math.abs(cents) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "−" : ""}${text} €`;
}

/** "2026-10" → "Okt. 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Months as CSV (semicolon, German decimal comma) for a spreadsheet or the tax advisor. */
export function financeCsv(f: Pick<FinanceOverview, "months" | "aiCostPerRequestCent">): string {
  const n = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const lines = ["Monat;Umsatz (EUR);Zahlungen;KI-Anfragen;KI-Kosten geschätzt (EUR);Ergebnis (EUR)"];
  for (const m of [...f.months].reverse()) lines.push([m.month, n(m.revenueCents), m.payments, m.aiRequests, n(m.aiCostCents), n(m.resultCents)].join(";"));
  lines.push(`# KI-Kosten als Richtwert: ${String(f.aiCostPerRequestCent).replace(".", ",")} Cent je Anfrage`);
  return lines.join("\n") + "\n";
}
