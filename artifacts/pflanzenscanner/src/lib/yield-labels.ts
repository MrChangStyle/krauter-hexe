import type { ExpenseCategory, FarmProduct } from "@workspace/api-client-react";

export const PRODUCTS: Record<FarmProduct, { label: string; unit: string; step: string }> = {
  eggs: { label: "Eier", unit: "Stück", step: "1" },
  milk: { label: "Milch", unit: "l", step: "0.1" },
  meat: { label: "Fleisch", unit: "kg", step: "0.1" },
  wool: { label: "Wolle", unit: "kg", step: "0.1" },
};

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  feed: "Futter",
  vet: "Tierarzt & Medizin",
  bedding: "Einstreu",
  seeds: "Saatgut & Pflanzen",
  animals: "Tierkauf",
  equipment: "Geräte & Material",
  other: "Sonstiges",
};

export const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** "1.234 €", "12,50 €" */
export function euro(n: number): string {
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

/** "12,5" */
export function num(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/** "+12 %" / "−5 %" against last year; null without a value last year. */
export function changeText(total: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = Math.round(((total - previous) / previous) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)} % zum Vorjahr`;
}
