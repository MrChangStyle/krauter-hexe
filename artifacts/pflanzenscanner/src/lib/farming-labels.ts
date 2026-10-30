import type { FarmingLevel } from "@workspace/api-client-react";

/**
 * Bewirtschaftung (docs/bio.md): Bio is an option, not the app's only way –
 * conventional stays the default and keeps all advice, mineral fertiliser too.
 */
export const FARMING_ORDER: FarmingLevel[] = ["conventional", "natural", "organic", "association"];

export const FARMING_LABELS: Record<FarmingLevel, string> = {
  conventional: "Konventionell",
  natural: "Naturnah",
  organic: "Bio (EU-Öko-Verordnung)",
  association: "Bio-Verband",
};

export const FARMING_HINTS: Record<FarmingLevel, string> = {
  conventional: "Alle Empfehlungen, biologisch und mineralisch – wie bisher.",
  natural: "Ohne Zertifikat, aber naturnah: Pflanzendoc und Pflege-Guide nennen nur biologische Mittel und Dünger.",
  organic: "Zertifiziert oder in Umstellung nach EU-Öko-Verordnung: nur biologische Mittel; Kontrollstelle und Umstellung lassen sich eintragen.",
  association: "Wie Bio, nach den Richtlinien eines Verbands (Bioland, Demeter, Naturland …).",
};

/** Natural and up: plant advice names organic means only. */
export function organicAdvice(level: FarmingLevel | undefined | null): boolean {
  return !!level && level !== "conventional";
}

/** Organic by the EU regulation or an association: control body and conversion apply. */
export function certified(level: FarmingLevel | undefined | null): boolean {
  return level === "organic" || level === "association";
}

