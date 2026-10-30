import type { FarmFarming, FarmingLevel, OrganicArea } from "@workspace/api-client-react";

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

/**
 * Bio je Bereich (docs/bio.md): the areas a farm can keep conventional,
 * in display order. "natural" says whether the area already counts on a
 * naturnah farm (organic advice) or only from Bio on.
 */
export const ORGANIC_AREAS: ReadonlyArray<{ key: OrganicArea; label: string; hint: string; natural: boolean }> = [
  { key: "plants", label: "Pflanzendoc & Pflege-Guide", hint: "nur biologische Mittel und Dünger", natural: true },
  { key: "garden", label: "Garten", hint: "Bio-Saatgut, Düngung, Bio-Ernte", natural: true },
  { key: "feed", label: "Fütterung", hint: "Bio-Anteile im Futterplaner", natural: false },
  { key: "space", label: "Stall & Auslauf", hint: "Platz-Check, Weidegang", natural: false },
  { key: "treatments", label: "Behandlungen", hint: "doppelte Wartezeit, Zähler chemischer Mittel", natural: false },
  { key: "products", label: "Erzeugnisse", hint: "Eier, Milch, Fleisch, Wolle, Honig als Bio", natural: false },
];

/** The areas a farming level offers at all. */
export function organicAreasFor(level: FarmingLevel | undefined | null) {
  return certified(level) ? ORGANIC_AREAS : organicAdvice(level) ? ORGANIC_AREAS.filter((a) => a.natural) : [];
}

type FarmingLike = Pick<FarmFarming, "level" | "organicOff"> | undefined | null;

/** Certified rules (warnings, shares, Bio sign …) apply in this area. */
export function certifiedIn(f: FarmingLike, area: OrganicArea): boolean {
  return !!f && certified(f.level) && !f.organicOff.includes(area);
}

/** Organic advice (natural and up) applies in this area. */
export function organicAdviceIn(f: FarmingLike, area: OrganicArea): boolean {
  return !!f && organicAdvice(f.level) && !f.organicOff.includes(area);
}

/** Shown wherever the app offers Bio: the Richtwerte are a help, not a guarantee. */
export const ORGANIC_DISCLAIMER =
  "Die Bio-Funktionen sind eine Hilfe mit Richtwerten nach EU-Öko-Verordnung. Little Farming übernimmt keine Gewähr, dass damit die Anforderungen der Verordnung, eines Verbands oder der Kontrollstelle erfüllt sind – verbindlich ist allein deren Prüfung.";

