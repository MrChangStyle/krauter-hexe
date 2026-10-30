import type { FarmingLevel, SustainabilityKey } from "@workspace/api-client-react";

/** Nachhaltigkeit (docs/bio.md, B8): the measures and how the Hof-Steckbrief names them. */
export const SUSTAINABILITY: { key: SustainabilityKey; label: string; hint: string }[] = [
  { key: "nest_boxes", label: "Nistkästen für Vögel und Fledermäuse", hint: "Helfen gegen Raupen und Mücken." },
  { key: "insect_hotel", label: "Nisthilfen für Wildbienen", hint: "Bestäuber für Obst und Gemüse." },
  { key: "flower_strip", label: "Blühstreifen oder Wildblumenwiese", hint: "Heimische Blumen, spät gemäht." },
  { key: "hedge", label: "Hecken aus heimischen Sträuchern", hint: "Windschutz und Platz für Nützlinge." },
  { key: "deadwood", label: "Totholz- oder Steinhaufen", hint: "Unterschlupf für Igel, Eidechsen, Käfer." },
  { key: "pond", label: "Teich oder Feuchtstelle", hint: "Tränke für Insekten und Vögel." },
  { key: "rainwater", label: "Regenwasser sammeln", hint: "Für Beete und Tiertränken." },
  { key: "compost", label: "Eigener Kompost", hint: "Küchen- und Gartenabfälle zurück ins Beet." },
  { key: "mulch", label: "Mulchen statt offener Erde", hint: "Spart Wasser, schützt das Bodenleben." },
  { key: "peat_free", label: "Torffreie Erde", hint: "Moore bleiben, wo sie sind." },
  { key: "old_breeds", label: "Alte Rassen oder samenfeste Sorten", hint: "Erhält die Vielfalt." },
  { key: "solar", label: "Sonnenstrom", hint: "Für Stall, Zaun oder Pumpe." },
];

const LEVEL_PHRASE: Record<FarmingLevel, string | null> = {
  conventional: null,
  natural: "wirtschaftet naturnah",
  organic: "wirtschaftet nach der EU-Öko-Verordnung",
  association: "wirtschaftet nach den Regeln eines Bio-Verbands",
};

/** The Hof-Steckbrief: a few sentences for the farm's own website or the shop counter. */
export function farmProfile(farmName: string, level: FarmingLevel, keys: readonly SustainabilityKey[], controlBody?: string | null): string {
  const lines: string[] = [];
  const phrase = LEVEL_PHRASE[level];
  if (phrase) lines.push(`${farmName} ${phrase}${controlBody && (level === "organic" || level === "association") ? ` (Kontrollstelle ${controlBody})` : ""}.`);
  const done = SUSTAINABILITY.filter((s) => keys.includes(s.key)).map((s) => s.label);
  if (done.length > 0) lines.push(`${phrase ? "Für" : `Auf ${farmName} – für`} Natur und Klima: ${done.join(", ")}.`);
  return lines.join(" ");
}
