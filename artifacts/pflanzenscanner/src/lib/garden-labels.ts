import type { BedOrientation, BedType, GardenBed, SoilTexture, WindProtection } from "@workspace/api-client-react";

export const BED_TYPE_LABELS: Record<BedType, string> = {
  raised: "Hochbeet",
  bed: "Freilandbeet",
  greenhouse: "Gewächshaus",
  coldframe: "Frühbeet",
  container: "Kübel/Balkon",
};

export const BED_TYPE_ORDER: BedType[] = ["raised", "bed", "greenhouse", "coldframe", "container"];

export const ORIENTATION_LABELS: Record<BedOrientation, string> = {
  N: "Nord",
  NE: "Nordost",
  E: "Ost",
  SE: "Südost",
  S: "Süd",
  SW: "Südwest",
  W: "West",
  NW: "Nordwest",
};

export const WIND_LABELS: Record<WindProtection, string> = {
  none: "kein Windschutz",
  partial: "etwas windgeschützt",
  good: "gut windgeschützt",
};

export const SOIL_LABELS: Record<SoilTexture, string> = {
  sandy: "sandig",
  loamy: "lehmig",
  clay: "tonig",
};

/** "05-15" → "15.05." */
export function dayMonth(mmdd: string): string {
  const [m, d] = mmdd.split("-");
  return `${d}.${m}.`;
}

/** "15.5." / "15.05" / "15.05." → "05-15"; null if not a real day. */
export function parseDayMonth(raw: string): string | null {
  const match = /^\s*(\d{1,2})\.(\d{1,2})\.?\s*$/.exec(raw);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (m < 1 || m > 12 || d < 1 || d > days[m - 1]!) return null;
  return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "200 × 120 cm" as "2,0 × 1,2 m" */
export function bedSize(bed: Pick<GardenBed, "lengthCm" | "widthCm" | "heightCm" | "type">): string {
  const m = (cm: number) => (cm / 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const base = `${m(bed.lengthCm)} × ${m(bed.widthCm)} m`;
  return bed.type === "raised" && bed.heightCm ? `${base}, ${bed.heightCm} cm hoch` : base;
}

/** Square metres, one decimal. */
export function bedArea(bed: Pick<GardenBed, "lengthCm" | "widthCm">): string {
  return `${((bed.lengthCm * bed.widthCm) / 10_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} m²`;
}

export const FINGER_TEST =
  "Eine Handvoll feuchte Erde zwischen den Fingern reiben und zu einer Rolle formen: Rieselt sie und hält nicht zusammen, ist sie sandig. Lässt sie sich formen, bricht aber leicht und fühlt sich etwas mehlig an, ist sie lehmig. Glänzt sie, klebt und lässt sich bleistiftdünn ausrollen, ist sie tonig.";

/**
 * Fixed rules from the finger test and the pH value – the Bodenprofil of the
 * spec: what to mix in and which organic fertiliser when.
 */
export function soilAdvice(soil: SoilTexture | null, ph: number | null): string[] {
  const tips: string[] = [];
  if (soil === "sandy") {
    tips.push("Sandboden hält Wasser und Nährstoffe schlecht: jedes Frühjahr 3–5 l reifen Kompost pro m² einarbeiten und den Boden mulchen.");
    tips.push("Mist nur gut verrottet und im Frühjahr geben – im Herbst würde er ausgewaschen.");
  } else if (soil === "loamy") {
    tips.push("Lehmboden ist ideal für die meisten Gemüse: im Herbst 2–3 l Kompost pro m², für Starkzehrer zusätzlich gut verrotteten Mist.");
  } else if (soil === "clay") {
    tips.push("Tonboden ist schwer, nass und kalt: Sand und Kompost einarbeiten, Gründüngung lockert zusätzlich.");
    tips.push("Frischen Pferde- oder Kuhmist im Herbst ausbringen und über den Winter einziehen lassen – nicht direkt vor der Pflanzung.");
  }
  if (ph !== null) {
    if (ph < 5.5) tips.push(`pH ${ph.toLocaleString("de-DE")} ist sauer: im Herbst Algen- oder Gartenkalk geben (etwa 100–150 g pro m²) und im Frühjahr neu messen.`);
    else if (ph <= 7.2) tips.push(`pH ${ph.toLocaleString("de-DE")} passt für die meisten Gemüse und Kräuter.`);
    else tips.push(`pH ${ph.toLocaleString("de-DE")} ist kalkhaltig: nicht kalken; Kompost und Laub senken den Wert langsam.`);
  }
  if (soil) tips.push("Brennnesseljauche (1:10 verdünnt) eignet sich von Mai bis Juli als Kopfdünger für Starkzehrer wie Tomate, Kohl und Kürbis.");
  return tips;
}
