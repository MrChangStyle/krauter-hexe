/**
 * Etikett per KI (Futterplaner step 2, docs/futterplaner.md): the model reads
 * a feed label photo – analytical constituents, additives, intended species.
 * Nothing is saved here: the user checks the values against the label and
 * saves them as an own feed (addFarmFeed), so a misread number never reaches
 * a ration unseen.
 *
 * The model answer is untrusted: numbers outside a plausible range become
 * null (the field stays empty and must be typed), lists are cut and cleaned.
 */

import { FARM_SPECIES, type FarmSpecies } from '@workspace/db';

import { checkImage } from './farmAi';
import { FarmDataError } from './farmAnimals';
import type { FeedCategory } from './feedCatalog';
import { MODELS, parseDataUrl, runModelChain } from './plantIdentification';

const CATEGORIES: readonly FeedCategory[] = ['roughage', 'fresh', 'grain', 'compound', 'vegetable', 'mineral'];

/** As printed on the label: % as fed, copper mg/kg as fed. */
export interface LabelReadingValues {
  crudeProtein: number | null;
  crudeFat: number | null;
  crudeFibre: number | null;
  calcium: number | null;
  phosphorus: number | null;
  copper: number | null;
}

export interface LabelReading {
  name: string | null;
  category: FeedCategory;
  forSpecies: FarmSpecies[];
  /** % dry matter, from "Feuchtigkeit"/"Wasser" when printed. */
  dryMatter: number | null;
  label: LabelReadingValues;
  additives: string[];
  /** Coccidiostats that kill horses (Monensin & Co.) found in the additives. */
  ionophores: string[];
}

// Ionophore coccidiostats: allowed in poultry (and some cattle/rabbit) feed,
// deadly for horses even in small amounts.
const IONOPHORES = ['monensin', 'salinomycin', 'narasin', 'lasalocid', 'maduramicin', 'semduramicin'];

export function ionophoresIn(additives: readonly string[]): string[] {
  const text = additives.join(' ').toLowerCase();
  return IONOPHORES.filter((name) => text.includes(name)).map((name) => name[0]!.toUpperCase() + name.slice(1));
}

function num(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.').replace(/[^\d.]/g, '')) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

export function coerceLabel(parsed: Record<string, unknown>): LabelReading | null {
  if (parsed['istEtikett'] !== true) return null;
  const v = (parsed['werte'] ?? {}) as Record<string, unknown>;
  const moisture = num(parsed['feuchtigkeit'], 0, 95);
  const additives = Array.isArray(parsed['zusatzstoffe'])
    ? parsed['zusatzstoffe'].map((a) => str(a, 120)).filter((a): a is string => !!a).slice(0, 30)
    : [];
  const species = Array.isArray(parsed['tierarten'])
    ? [...new Set(parsed['tierarten'].filter((s): s is FarmSpecies => FARM_SPECIES.includes(s as FarmSpecies) && s !== 'other'))]
    : [];
  const category = CATEGORIES.includes(parsed['art'] as FeedCategory) ? (parsed['art'] as FeedCategory) : 'compound';
  const label: LabelReadingValues = {
    crudeProtein: num(v['rohprotein'], 0, 90),
    crudeFat: num(v['rohfett'], 0, 60),
    crudeFibre: num(v['rohfaser'], 0, 60),
    calcium: num(v['calcium'], 0, 40),
    phosphorus: num(v['phosphor'], 0, 20),
    copper: num(v['kupfer'], 0, 50_000),
  };
  if (Object.values(label).every((x) => x === null)) return null;
  return {
    name: str(parsed['name'], 80),
    category,
    // Drives the foreign-feed warning in a ration; the user can remove it.
    forSpecies: species.slice(0, 5),
    dryMatter: moisture === null ? null : Math.round((100 - moisture) * 10) / 10,
    label,
    additives,
    ionophores: ionophoresIn(additives),
  };
}

const PROMPT = `Das Foto zeigt das Etikett eines Futtermittels (Sack, Eimer, Packung). Lies es ab.
Antworte nur mit einem JSON-Objekt:
{
  "istEtikett": boolean (ist ein Futtermittel-Etikett mit Inhaltsstoffen lesbar?),
  "name": "Produktname, wie aufgedruckt, oder null",
  "art": einer von "compound" (Allein-/Mischfutter, Pellets), "mineral" (Mineral- oder Ergänzungsfutter), "grain" (reines Getreide), "roughage" (Heu, Stroh, Cobs), "vegetable", "fresh",
  "tierarten": Liste der Tierarten, für die das Futter laut Etikett bestimmt ist, als Schlüssel aus ${FARM_SPECIES.filter((s) => s !== 'other').map((s) => `"${s}"`).join(', ')} (Legehennen, Küken, Enten = "poultry"),
  "feuchtigkeit": Zahl in % oder null (Feuchtigkeit/Wasser, nur wenn aufgedruckt),
  "werte": {
    "rohprotein": Zahl in % oder null,
    "rohfett": Zahl in % oder null,
    "rohfaser": Zahl in % oder null,
    "calcium": Zahl in % oder null,
    "phosphor": Zahl in % oder null,
    "kupfer": Zahl in mg/kg oder null (meist unter Zusatzstoffen, z. B. "Kupfer als Kupfer(II)-sulfat 15 mg")
  },
  "zusatzstoffe": ["jeder Zusatzstoff mit Menge, wie aufgedruckt, z. B. \\"Vitamin D3 3000 I.E.\\", \\"Monensin-Natrium 100 mg\\""]
}
Werte genau so, wie sie auf dem Etikett stehen ("wie gefüttert"). Steht ein Wert in g/kg, teile ihn durch 10, um % zu erhalten. Was nicht lesbar ist: null. Nichts erfinden oder schätzen.`;

export async function readFeedLabel(imageData: string): Promise<LabelReading> {
  checkImage(imageData);
  const parsed = (await runModelChain(
    [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: parseDataUrl(imageData) }] }],
    MODELS,
    { maxOutputTokens: 2048, responseMimeType: 'application/json' },
  )) as Record<string, unknown> | null;
  const reading = coerceLabel(parsed ?? {});
  if (!reading) throw new FarmDataError(422, 'Auf dem Foto ist kein lesbares Etikett mit Inhaltsstoffen zu erkennen.');
  return reading;
}
