import { ai } from "./geminiClient";
import {
  PLANT_CATEGORIES,
  HUMAN_STATUSES,
  POULTRY_STATUSES,
  TOXICITY_LEVELS,
  type ToxicityLevel,
  ANIMAL_KINDS,
  HEAL_TARGET_KINDS,
  type AnimalsMap,
  type HealTargetKind,
  type SymptomsMap,
  type SymptomApplicationsMap,
} from "@workspace/db";

export interface PlantIdentification {
  /** False when the photo contains no plant/mushroom/herb/tree/shrub. */
  istPflanze: boolean;
  germanName: string;
  botanicalName: string;
  category: (typeof PLANT_CATEGORIES)[number];
  humanStatus: (typeof HUMAN_STATUSES)[number];
  // Three-tier toxicity level; only set when humanStatus is "poisonous".
  humanToxicityLevel?: ToxicityLevel;
  poultryStatus: (typeof POULTRY_STATUSES)[number];
  edibilityDetails: string;
  animalToxicityDetails: string;
  activeIngredients: string;
  humanBenefits: string;
  poultryBenefits: string;
  habitat: string;
  siteConditions: string;
  otherUses: string;
  fertilizerTips: string;
  // Short German description of preparation/usage for edible plants.
  // Empty string for poisonous plants.
  preparation: string;
  // Whether the plant produces edible fruits; null when not applicable/unknown.
  hasEdibleFruits: boolean | null;
  // Per-animal fact sheet (poultry/rabbit/guineaPig/cat). Always fully
  // populated; the legacy poultry* fields above mirror animals.poultry.
  animals: AnimalsMap;
  // Treatable symptoms per target (human + 4 animals) as short canonical German
  // tags. Always contains every target key (empty array = nothing treatable).
  symptoms: SymptomsMap;
  // Application instructions per target + symptom: HOW to prepare/use the herb
  // to treat each specific complaint. Always contains every target key.
  symptomApplications: SymptomApplicationsMap;
}

const SYSTEM_PROMPT = `Du bist ein botanischer Experte, der Pflanzen, Kräuter und Pilze anhand von Fotos bestimmt. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) mit exakt diesen Feldern:
{
  "istPflanze": boolean (Ist auf diesem Foto eine Pflanze, ein Pilz, ein Kraut, ein Baum oder Strauch erkennbar? true = ja; false = nein, z.B. Tier, Mensch, Gebäude, Gegenstand, leere Fläche. Wenn false, kannst du alle anderen Felder weglassen oder leere Platzhalter setzen.),
  "germanName": string (deutscher Trivialname),
  "botanicalName": string (botanischer/lateinischer Name),
  "category": one of "poisonous" | "edible" | "medicinal" | "mushroom" | "tree" | "shrub" | "moss" | "cactus" (Hauptkategorie fürs Archiv. Wuchsform hat Vorrang: Pilze, Bäume (verholzter Stamm, auch baumförmige Zimmerpflanzen wie Drachenbaum), Sträucher (verholzt, buschig/mehrstämmig, auch Klettergehölze wie Efeu), Moose und Flechten, sowie Kakteen und Sukkulenten (alle Kakteengewächse und sukkulent wasserspeichernde Pflanzen, z.B. Aloe vera, Agave, Echeverien, Hauswurze/Sempervivum, Fettpflanzen) gehören immer in ihre eigene Kategorie. Nur krautige (nicht-sukkulente) Pflanzen werden nach giftig, essbar oder Heilkraut eingeordnet. WICHTIG für "medicinal": Vergib diese Kategorie NUR, wenn die Pflanze HEUTE aktiv als Heilpflanze empfohlen wird und ihre Anwendung durch aktuelle pflanzenheilkundliche Quellen, Apotheken oder Naturheilkunde-Fachbücher gestützt wird. Pflanzen, die historisch als Heilkraut genutzt wurden, deren Anwendung aber heutzutage ausdrücklich nicht mehr empfohlen wird (z.B. wegen Toxizität, fehlender Wirksamkeitsbelege oder überholter Heilkundepraktiken — wie z.B. Gewöhnlicher Wurmfarn/Dryopteris filix-mas), erhalten NICHT die Kategorie "medicinal", sondern "poisonous" oder "edible" je nach tatsächlicher Verträglichkeit),
  "humanStatus": one of "edible" | "poisonous" (ist die Pflanze für Menschen essbar oder giftig?),
  "humanToxicityLevel": one of "intolerant" | "poisonous" | "lethal" (nur relevant wenn humanStatus = "poisonous"; "intolerant" = unverträglich, löst milde Reaktion/Magen-Darm-Beschwerden aus aber keine schwere Vergiftung; "poisonous" = giftig, systemische toxische Wirkung; "lethal" = tödlich, kann bei Verzehr zum Tod führen. Wähle den zutreffenden Grad),
  "mushroomEdibleConfident": boolean (NUR für Pilze relevant, für alle anderen Kategorien immer false. Setze true NUR, wenn ALLES zutrifft: die Pilzart ist anhand der Fotos zweifelsfrei bestimmt; die Art ist eindeutig essbar; es besteht keine realistische Verwechslungsgefahr mit einem giftigen Doppelgänger (z.B. Knollenblätterpilz, Pantherpilz, Gifthäubling, Karbol-Champignon); und es liegen zwei Ansichten vor (von oben UND von der Seite), die erkennbar denselben Pilz zeigen. Bei nur einem Foto, schlecht erkennbaren Merkmalen (Hut, Lamellen/Röhren, Stiel, Ring, Stielbasis), widersprüchlichen Fotos oder dem geringsten Zweifel: false),
  "edibilityDetails": string (deutsche Erklärung zur Essbarkeit/Giftigkeit für Menschen, inkl. Symptome bei Vergiftung falls giftig),
  "activeIngredients": string (Inhaltsstoffe, deutsch),
  "humanBenefits": string (medizinische Wirkung/Nutzen für Menschen, gegen welche Beschwerden, deutsch; falls keine bekannt, "Keine bekannte medizinische Wirkung."),
  "animals": {
    "poultry":   { "status": "safe" | "poisonous", "toxicityLevel": "intolerant" | "poisonous" | "lethal", "toxicityDetails": string, "benefits": string },
    "rabbit":    { "status": "safe" | "poisonous", "toxicityLevel": "intolerant" | "poisonous" | "lethal", "toxicityDetails": string, "benefits": string },
    "guineaPig": { "status": "safe" | "poisonous", "toxicityLevel": "intolerant" | "poisonous" | "lethal", "toxicityDetails": string, "benefits": string },
    "cat":       { "status": "safe" | "poisonous", "toxicityLevel": "intolerant" | "poisonous" | "lethal", "toxicityDetails": string, "benefits": string },
    "horse":     { "status": "safe" | "poisonous", "toxicityLevel": "intolerant" | "poisonous" | "lethal", "toxicityDetails": string, "benefits": string }
  } (Sicherheit und Wirkung je Tierart - "poultry"=Geflügel/Hühner, "rabbit"=Hase/Kaninchen, "guineaPig"=Meerschweinchen, "cat"=Katze, "horse"=Pferd. status: ist die Pflanze für dieses Tier unbedenklich ("safe") oder giftig ("poisonous")? toxicityLevel: Grad der Giftigkeit (nur wenn status="poisonous"): "intolerant"=unverträglich, "poisonous"=giftig, "lethal"=tödlich. toxicityDetails: deutsche Erklärung zur Giftigkeit bzw. Verträglichkeit für genau dieses Tier, inkl. Symptome falls giftig. benefits: medizinische Wirkung/Nutzen für dieses Tier, deutsch; falls keine bekannt, "Keine bekannte medizinische Wirkung."),
  "habitat": string (wo diese Pflanze meistens wächst: typische Lebensräume und Standorte, z.B. Wiesen, Wegränder, Waldränder, Äcker, Ufer, Gärten; deutsch),
  "siteConditions": string (welche Voraussetzungen der Standort erfüllen muss, damit die Pflanze wachsen kann: Lichtbedarf, Bodenart, Feuchtigkeit, Nährstoffbedarf, ggf. Klima; deutsch),
  "otherUses": string (weitere praktische Nutzungsmöglichkeiten jenseits von Verzehr und Heilwirkung, alles Nützliche, was man aus der Pflanze gewinnen kann: z.B. Jauche/Sud als kaliumhaltiger Pflanzendünger wie bei Beinwell oder Brennnessel, Mulch, Gründüngung, Kompost-Beschleuniger, Färbepflanze, Fasern, Bienenweide; deutsch; falls nichts Nennenswertes bekannt, "Keine besonderen weiteren Nutzungsmöglichkeiten bekannt."),
  "fertilizerTips": string (wie man diese Pflanze düngen sollte, wenn man sie selbst anbaut: geeigneter Dünger, z.B. Kompost, organischer Dünger, kalium- oder stickstoffbetont, Häufigkeit und Besonderheiten; deutsch),
  "hasEdibleFruits": boolean (hat diese Pflanze essbare Früchte, die Menschen essen können? true = ja, z.B. Apfel, Birne, Holunder, Hagebutte; false = keine essbaren Früchte oder Früchte giftig/ungenießbar),
  "preparation": string (NUR für essbare Pflanzen/Pilze mit humanStatus="edible": kurze deutsche Beschreibung wie die Pflanze zubereitet oder verzehrt werden kann, z.B. "Roh als Salat, gekocht als Gemüse oder Suppe, als Tee." – maximal 2-3 Sätze, praxisnah. Für giftige Pflanzen: leerer String ""),
  "symptoms": {
    "human":     string[],
    "poultry":   string[],
    "rabbit":    string[],
    "guineaPig": string[],
    "cat":       string[],
    "horse":     string[]
  } (konkrete Beschwerden/Symptome, gegen die diese Pflanze bei der jeweiligen Zielgruppe helfen kann - abgeleitet aus ihrer Heilwirkung. "human"=Mensch, "poultry"=Geflügel/Hühner, "rabbit"=Hase/Kaninchen, "guineaPig"=Meerschweinchen, "cat"=Katze, "horse"=Pferd. Jeweils eine Liste kurzer, kanonischer deutscher Schlagwörter im Singular/Grundform, z.B. "Husten", "Entzündung", "Verdauungsbeschwerden", "Wunden", "Durchfall". Wichtig – verwende immer diese kanonischen Begriffe: alles mit Wunde/Wundheilung → "Wunden"; alles mit Leber → "Leberbeschwerden"; alles mit Herz-Kreislauf → "Herz-Kreislauf-Erkrankungen"; alles mit Harnweg → "Harnwegsinfektion"; alles mit Atemweg → "Atemwegsbeschwerden"; alles mit Haut (Hautleiden, Hautentzündung etc.) → "Hautprobleme"; alles mit Hals (Halsschmerzen etc.) → "Halsbeschwerden"; alles mit Zähnen → "Zahnprobleme"; alles mit Verdauung → "Verdauungsbeschwerden". Nenne nur Beschwerden, die durch die tatsächliche Heilwirkung gedeckt sind - erfinde nichts. Wenn keine Heilwirkung für eine Zielgruppe bekannt ist, gib eine leere Liste [] an.)
}
Wenn du dir bei der Bestimmung nicht sicher bist, gib trotzdem deine beste Einschätzung ab und erwähne die Unsicherheit im "edibilityDetails"-Feld. \
Sei im Zweifel vorsichtig: wenn Giftigkeit nicht ausgeschlossen werden kann, setze den jeweiligen Status auf "poisonous". \
Bei Pilzen gilt höchste Vorsicht: prüfe aktiv auf giftige Doppelgänger und erwähne die Verwechslungsgefahr in "edibilityDetails". \
Wenn zwei Fotos vorliegen (Bild 1 von oben, Bild 2 von der Seite), prüfe zuerst, ob beide erkennbar denselben Pilz zeigen, und nutze beide Ansichten für die Bestimmung.`;

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export const UNKNOWN_BOTANICAL_NAME = "Unbekannt";

function coerceText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return { mimeType: match[1], data: match[2] };
}

// Model selection matters here because this app sends IMAGES, and model
// availability for multimodal (image) requests differs sharply from text-only
// requests on this key/tier. "gemini-flash-lite-latest" is the only model that
// reliably answers image requests here (verified: 4/4 valid responses);
// "gemini-3.5-flash" and "gemini-flash-latest" pass a text smoke test but return
// 503 "high demand" for nearly every image request. So we try the reliable model
// first, fall back to the next, and retry transient overloads. Always validate a
// model against a real image request, not a text call. See replit.md for details.
const MODELS: ReadonlyArray<{ name: string; attempts: number }> = [
  { name: "gemini-flash-lite-latest", attempts: 2 },
  { name: "gemini-flash-latest", attempts: 1 },
];

// Text-only requests (the animal backfill from a plant name, no image) are far
// less model-sensitive than image requests, so we lead with the fuller model
// and fall back to the lite one.
const TEXT_MODELS: ReadonlyArray<{ name: string; attempts: number }> = [
  { name: "gemini-flash-latest", attempts: 2 },
  { name: "gemini-flash-lite-latest", attempts: 1 },
];

const GENERATION_CONFIG = {
  // 4096 tokens is sufficient for all fields except symptomApplications, which
  // is now generated asynchronously after the scan (see plants.ts). Keeping this
  // lower reduces the time-to-first-token and avoids the model padding responses.
  maxOutputTokens: 4096,
  responseMimeType: "application/json",
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Google returns 503 UNAVAILABLE ("high demand") and 429 RESOURCE_EXHAUSTED
// under load; these are worth retrying. Anything else (e.g. a model 404) is not.
function isTransientError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  const message = String((err as { message?: string } | null)?.message ?? "");
  return (
    status === 503 ||
    status === 429 ||
    /UNAVAILABLE|high demand|overloaded|RESOURCE_EXHAUSTED/i.test(message)
  );
}

// The model is asked for raw JSON, but occasionally wraps it in markdown fences
// or adds stray text. Strip fences, then fall back to the outermost {...} block.
function parseJsonLoose(raw: string): unknown {
  const text = raw.trim();
  const unfenced =
    /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim() ?? text;
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("AI model returned invalid JSON");
  }
}

// Runs a model fallback chain with transient-error retries and returns the
// parsed (but not yet validated) JSON object. Shared by the image scan and the
// text-only animal backfill.
async function runModelChain(
  contents: unknown,
  models: ReadonlyArray<{ name: string; attempts: number }>,
): Promise<unknown> {
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < model.attempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: model.name,
          // The SDK types the contents loosely; our shapes are valid at runtime.
          contents: contents as never,
          config: GENERATION_CONFIG,
        });
        const raw = response.text;
        if (!raw) {
          throw new Error("Empty response from AI model");
        }
        return parseJsonLoose(raw);
      } catch (err) {
        lastError = err;
        // Back off and retry the same model only for transient overload; for
        // anything else (bad JSON, empty response) move on to the next model.
        if (isTransientError(err) && attempt < model.attempts - 1) {
          await sleep(800 * (attempt + 1));
        } else {
          break;
        }
      }
    }
  }
  throw lastError ?? new Error("AI request failed");
}

// Calls Gemini with the reliable-model-first fallback chain and transient-error
// retries, returning the parsed (but not yet validated) JSON object. For the
// two-photo mushroom scan both views are labelled so the model can cross-check
// that they show the same specimen (cap from above, stem/gills from the side).
function requestPlantJson(
  main: { mimeType: string; data: string },
  side?: { mimeType: string; data: string },
): Promise<unknown> {
  const parts = side
    ? [
        {
          text: `${SYSTEM_PROMPT}\n\nBestimme diesen Fund anhand BEIDER Fotos und erstelle das Datenblatt als JSON.`,
        },
        { text: "Bild 1 - Ansicht von oben:" },
        { inlineData: side && { mimeType: main.mimeType, data: main.data } },
        { text: "Bild 2 - Ansicht von der Seite:" },
        { inlineData: { mimeType: side.mimeType, data: side.data } },
      ]
    : [
        {
          text: `${SYSTEM_PROMPT}\n\nBestimme diese Pflanze und erstelle das Datenblatt als JSON.`,
        },
        { inlineData: { mimeType: main.mimeType, data: main.data } },
      ];
  const contents = [{ role: "user", parts }];
  return runModelChain(contents, MODELS);
}

// Coerces the model's (untrusted) animals object into a fully-populated map:
// every animal kind is present, statuses fall back to the cautious "poisonous",
// and missing texts get sensible German sentinels.
function coerceAnimals(value: unknown): AnimalsMap {
  const obj = (value ?? {}) as Record<string, unknown>;
  const animals: AnimalsMap = {};
  for (const kind of ANIMAL_KINDS) {
    const entry = (obj[kind] ?? {}) as Record<string, unknown>;
    const animalStatus = coerceEnum(entry.status, POULTRY_STATUSES, "poisonous");
    animals[kind] = {
      status: animalStatus,
      toxicityLevel: animalStatus === "poisonous"
        ? coerceEnum(entry.toxicityLevel, TOXICITY_LEVELS, "poisonous")
        : undefined,
      toxicityDetails: coerceText(
        entry.toxicityDetails,
        "Keine verlässliche Einschätzung möglich - im Zweifel von diesem Tier fernhalten.",
      ),
      benefits: coerceText(
        entry.benefits,
        "Keine bekannte medizinische Wirkung.",
      ),
    };
  }
  return animals;
}

// Coerces one target's (untrusted) symptom list into short, canonical German
// tags: keep only non-empty strings, trim, drop the "no known effect" sentinel,
// cap length, and dedupe case-insensitively. Order of first appearance is kept.
const SYMPTOM_MAX_LEN = 48;
const SYMPTOMS_PER_TARGET_CAP = 12;

// Sentence-case normalisation: first character uppercased, rest lowercased.
// Applied before canonicalisation so every tag stored in the DB has a
// consistent casing regardless of what the AI returned ("husten", "HUSTEN",
// "Husten" all become "Husten"). Canonical overrides (e.g. "Wunden",
// "Verdauungsbeschwerden") are applied afterwards and are already in the
// correct form, so this function is a no-op for them in practice.
// Must stay in sync with toSentenceCase() in the frontend (heal-targets.ts).
export function toSentenceCase(tag: string): string {
  if (tag.length === 0) return tag;
  return tag.charAt(0).toLocaleUpperCase("de-DE") + tag.slice(1).toLocaleLowerCase("de-DE");
}

// Canonical symptom normalization — must stay in sync with canonicalizeSymptom()
// in the frontend (heal-targets.ts).
function canonicalizeSymptomTag(tag: string): string {
  const lower = tag.toLocaleLowerCase("de-DE");
  if (lower.includes("wund")) return "Wunden";
  if (lower.includes("leber")) return "Leberbeschwerden";
  if (lower.includes("kreislauf")) return "Herz-Kreislauf-Erkrankungen";
  if (lower.includes("harnweg")) return "Harnwegsinfektion";
  if (lower.includes("atemweg")) return "Atemwegsbeschwerden";
  if (lower.includes("haut")) return "Hautprobleme";
  if (lower.includes("hals")) return "Halsbeschwerden";
  if (lower.includes("zahn")) return "Zahnprobleme";
  if (lower.includes("verdauung")) return "Verdauungsbeschwerden";
  return tag;
}

// Full normalisation pipeline for a single symptom tag: sentence-case first,
// then canonical overrides. Export so the casing-backfill route can reuse it.
export function normalizeSymptomTag(raw: string): string {
  return canonicalizeSymptomTag(toSentenceCase(raw));
}

function coerceSymptomList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    let tag = item.trim();
    if (tag.length === 0) continue;
    // A model sometimes echoes the "no known effect" sentinel as a symptom.
    if (/^keine\b/i.test(tag)) continue;
    if (tag.length > SYMPTOM_MAX_LEN) tag = tag.slice(0, SYMPTOM_MAX_LEN).trim();
    // Sentence-case first, then map to canonical form, then dedup.
    tag = normalizeSymptomTag(tag);
    const key = tag.toLocaleLowerCase("de-DE");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= SYMPTOMS_PER_TARGET_CAP) break;
  }
  return out;
}

// Coerces the model's (untrusted) symptomApplications into a fully-populated
// map keyed by every heal target, then by every symptom tag from the already-
// coerced symptoms map. Unknown keys are ignored; missing keys fall back to an
// empty string so callers never have to handle undefined.
function coerceSymptomApplications(
  value: unknown,
  symptoms: SymptomsMap,
): SymptomApplicationsMap {
  const obj = (value ?? {}) as Record<string, unknown>;
  const result: SymptomApplicationsMap = {};
  for (const target of HEAL_TARGET_KINDS) {
    const tags = symptoms[target] ?? [];
    const appObj = (obj[target] ?? {}) as Record<string, unknown>;
    const apps: Record<string, string> = {};
    for (const tag of tags) {
      const instr = appObj[tag];
      apps[tag] =
        typeof instr === "string" && instr.trim().length > 0
          ? instr.trim()
          : "";
    }
    result[target] = apps;
  }
  return result;
}

// Coerces the model's (untrusted) symptoms object into a fully-populated map:
// every heal target key is always present (empty array = nothing treatable),
// which is also the "already processed" marker for the one-time backfill.
function coerceSymptoms(value: unknown): SymptomsMap {
  const obj = (value ?? {}) as Record<string, unknown>;
  const symptoms: SymptomsMap = {};
  for (const target of HEAL_TARGET_KINDS) {
    symptoms[target] = coerceSymptomList(obj[target]);
  }
  return symptoms;
}

const SYMPTOM_APPLICATIONS_BACKFILL_PROMPT = `Du bist ein Kräuterkundler und Heilpflanzenexperte. \
Unten stehen der Name einer Pflanze, ihre bekannte Heilwirkung je Zielgruppe und die bereits abgeleiteten Symptom-Schlagwörter. \
Erkläre für jedes genannte Symptom-Schlagwort in 1-2 knappen, praxisnahen deutschen Sätzen, wie das Kraut konkret angewendet oder zubereitet werden muss, um diese Beschwerde zu behandeln \
(z.B. "Als Tee: getrocknete Blätter 10 Min. ziehen lassen und trinken.", "Frische Blätter zerreiben und als Umschlag auflegen.", "Ins Futter mischen.", "Öl äußerlich auftragen."). \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) in exakt dieser Form:
{
  "human":     { [symptomTag: string]: string },
  "poultry":   { [symptomTag: string]: string },
  "rabbit":    { [symptomTag: string]: string },
  "guineaPig": { [symptomTag: string]: string },
  "cat":       { [symptomTag: string]: string },
  "horse":     { [symptomTag: string]: string }
}
Die Schlüssel innerhalb jedes Ziels müssen exakt den angegebenen Symptom-Schlagwörtern entsprechen. \
Wenn für ein Ziel keine Symptome angegeben sind, gib {} zurück.`;

// Text-only generation (no image) used to backfill symptom application
// instructions for plants that were scanned before this feature existed.
// Grounded in the already-stored benefits text + symptom tags.
export async function generateSymptomApplicationsForPlant(input: {
  germanName: string;
  botanicalName: string;
  benefits: Partial<Record<HealTargetKind, string>>;
  symptoms: SymptomsMap;
}): Promise<SymptomApplicationsMap> {
  const lines = HEAL_TARGET_KINDS.map((target) => {
    const tags = input.symptoms[target] ?? [];
    const benefit = input.benefits[target]?.trim();
    const tagStr = tags.length > 0 ? tags.join(", ") : "keine";
    const benefitStr =
      benefit && benefit.length > 0 ? benefit.slice(0, 200) : "keine Angabe";
    return `- ${target}: Symptome=[${tagStr}], Heilwirkung="${benefitStr}"`;
  }).join("\n");

  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            `${SYMPTOM_APPLICATIONS_BACKFILL_PROMPT}\n\n` +
            `Pflanze: ${input.germanName} (${input.botanicalName}).\n` +
            `Heilwirkung und Symptome je Zielgruppe:\n${lines}\n\n` +
            `Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = await runModelChain(contents, TEXT_MODELS);
  return coerceSymptomApplications(parsed, input.symptoms);
}

const MEDICINAL_REVIEW_PROMPT = `Du bist ein Experte für moderne Phytotherapie und Pflanzenheilkunde. \
Beurteile, ob die unten genannte Pflanze HEUTE noch aktiv als Heilpflanze empfohlen wird — \
d.h. ob ihre Anwendung durch aktuelle deutschsprachige Kräuterbücher, Apotheken oder anerkannte \
Naturheilkunde-Fachverbände gestützt wird und unbedenklich ist. \
Pflanzen, die historisch als Heilkräuter galten, deren Anwendung aber heute nicht mehr empfohlen wird \
(z.B. wegen nachgewiesener Toxizität, fehlender Wirksamkeitsbelege oder überholter Heilpraktiken — \
wie etwa der Gewöhnliche Wurmfarn/Dryopteris filix-mas), gelten NICHT als aktuelle Heilpflanzen. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) in exakt dieser Form:
{
  "keepMedicinal": boolean,
  "reason": string
}
keepMedicinal: true = wird heute noch empfohlen und ist unbedenklich; false = sollte nicht mehr als Heilkraut eingestuft werden. \
reason: knappe deutsche Begründung (1-2 Sätze).`;

// Text-only review: asks the AI whether a stored "medicinal" plant is still
// considered a recommended medicinal herb by current phytotherapy standards.
// Returns keepMedicinal=true (confirmed) or false (should be reclassified).
export async function reviewMedicinalPlant(
  germanName: string,
  botanicalName: string,
): Promise<{ keepMedicinal: boolean; reason: string }> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            `${MEDICINAL_REVIEW_PROMPT}\n\n` +
            `Pflanze: ${germanName} (${botanicalName}). Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = await runModelChain(contents, TEXT_MODELS);
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const keepMedicinal =
    typeof obj.keepMedicinal === "boolean" ? obj.keepMedicinal : true;
  const reason =
    typeof obj.reason === "string" && obj.reason.trim().length > 0
      ? obj.reason.trim()
      : "";
  return { keepMedicinal, reason };
}

const PLANT_HEALTH_PROMPT = `Du bist ein erfahrener Pflanzenarzt und Biologe. \
Analysiere das Foto einer Pflanze und beurteile ihren Gesundheitszustand. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) mit exakt diesen Feldern:
{
  "pflanzen_name": string (Pflanzennamen auf Deutsch mit botanischem Namen in Klammern, z.B. "Tomate (Solanum lycopersicum)"; wenn nicht erkennbar "Unbekannte Pflanze"),
  "gesundheits_score": number (Ganzzahl 0–100: 100 = vollkommen gesund, keinerlei Schäden; 80–99 = leichte Spuren, gut erholt sich selbst; 50–79 = deutliche Probleme, braucht Behandlung; 20–49 = schwer befallen/geschädigt; 0–19 = sehr krank, absterbend),
  "symptome": string[] (Liste der erkannten Krankheits- oder Schädigungszeichen auf Deutsch, z.B. ["Blattflecken", "Chlorose", "Läusebefall", "Mehltau", "Wurzelfäule"]. Leer wenn gesunder Wert 100),
  "hausmittel": [
    {
      "name": string (Name des Hausmittels auf Deutsch, z.B. "Brennnesseljauche", "Backpulver-Spray"),
      "zutaten": string[] (Zutaten/Materialien auf Deutsch, z.B. ["1 kg frische Brennnesseln", "10 L Wasser"]),
      "anleitung": string (kurze praxisnahe Anwendungsanweisung auf Deutsch, 2–3 Sätze)
    }
  ] (Biologische Hausmittel gegen die erkannten Symptome. Leer wenn gesundheits_score = 100. Maximal 3 Hausmittel.),
  "duenge_biologisch": string (Allgemeine biologische Düngeempfehlung speziell für diese Pflanze auf Deutsch: geeignete organische Dünger wie Kompost, Hornspäne, Brennnesseljauche, Guano, Knochenmehl usw. – konkret und praxisnah, 1–2 Sätze. Immer angeben, unabhängig vom Gesundheitszustand.),
  "duenge_chemisch": string (Allgemeine chemisch-mineralische Düngeempfehlung speziell für diese Pflanze auf Deutsch: geeignete Mineraldünger wie NPK-Dünger, Blaukorn, Kalkammonsalpeter, Volldünger usw. mit Hinweis auf Nährstoffbedarf (z.B. stickstoffbetont, kaliumreich) – konkret und praxisnah, 1–2 Sätze. Immer angeben, unabhängig vom Gesundheitszustand.)
}
Sei präzise bei der Symptomerkennung. Wenn die Pflanze kerngesund aussieht, setze gesundheits_score auf 100 und hausmittel auf [].`;

export interface PlantHealthRemedy {
  name: string;
  zutaten: string[];
  anleitung: string;
}

export interface PlantHealthResult {
  pflanzen_name: string;
  gesundheits_score: number;
  symptome: string[];
  hausmittel: PlantHealthRemedy[];
  duenge_biologisch: string;
  duenge_chemisch: string;
}

// Analyses a plant photo for health issues and returns a health score,
// detected symptoms, and biological home remedies. Stateless — no DB writes.
export async function checkPlantHealth(imageDataUrl: string): Promise<PlantHealthResult> {
  const { mimeType, data } = parseDataUrl(imageDataUrl);
  const contents = [
    {
      role: "user",
      parts: [
        { text: `${PLANT_HEALTH_PROMPT}\n\nAnalysiere diese Pflanze und erstelle das JSON.` },
        { inlineData: { mimeType, data } },
      ],
    },
  ];
  const parsed = await runModelChain(contents, MODELS);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const pflanzen_name =
    typeof obj.pflanzen_name === "string" && obj.pflanzen_name.trim().length > 0
      ? obj.pflanzen_name.trim()
      : "Unbekannte Pflanze";

  const rawScore = Number(obj.gesundheits_score);
  const gesundheits_score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 50;

  const symptome: string[] = Array.isArray(obj.symptome)
    ? obj.symptome
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 10)
    : [];

  const hausmittel: PlantHealthRemedy[] = Array.isArray(obj.hausmittel)
    ? obj.hausmittel
        .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
        .slice(0, 3)
        .map((h) => ({
          name: typeof h.name === "string" && h.name.trim().length > 0 ? h.name.trim() : "Hausmittel",
          zutaten: Array.isArray(h.zutaten)
            ? h.zutaten.filter((z): z is string => typeof z === "string" && z.trim().length > 0).map((z) => z.trim())
            : [],
          anleitung: typeof h.anleitung === "string" && h.anleitung.trim().length > 0 ? h.anleitung.trim() : "",
        }))
    : [];

  const duenge_biologisch =
    typeof obj.duenge_biologisch === "string" && obj.duenge_biologisch.trim().length > 0
      ? obj.duenge_biologisch.trim()
      : "Keine Angabe.";

  const duenge_chemisch =
    typeof obj.duenge_chemisch === "string" && obj.duenge_chemisch.trim().length > 0
      ? obj.duenge_chemisch.trim()
      : "Keine Angabe.";

  return { pflanzen_name, gesundheits_score, symptome, hausmittel, duenge_biologisch, duenge_chemisch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Care-guide generation
// ─────────────────────────────────────────────────────────────────────────────

export interface CareGuideDailyEntry {
  day: number;
  giessen: boolean;
  bespruehen: boolean;
  beschneiden: boolean | null;
  drehen: boolean;
  duengen: boolean;
  duengerart: "biologisch" | "mineralisch" | null;
  umtopfen: boolean;
  notizen: string;
}

export interface CareGuideResult {
  targetHumidity: string;
  potSizeRecommendation: string;
  recommendedPotDiameter: string | null;
  recommendedSoilType: string;
  dailyPlan: CareGuideDailyEntry[];
}

const CARE_GUIDE_PROMPT = `Du bist ein erfahrener Pflanzenpflege-Experte. Analysiere das Foto und erstelle einen individuellen 30-Tage-Pflegeplan für die Pflanze.

Du erhältst:
- Pflanzenname und Gesundheits-Score (0–100)
- Erkannte Symptome
- Düngeempfehlungen
- Falls ein Foto vorhanden ist: Analysiere auch den sichtbaren Topf für eine Größeneinschätzung

Antworte ausschließlich mit einem JSON-Objekt (kein Markdown, keine Erklärungen) in exakt dieser Form:
{
  "targetHumidity": string,              // Optimale Luftfeuchtigkeit, z.B. "60–70 %"
  "potSizeRecommendation": string,       // z.B. "Aktueller Topf ist ausreichend" ODER "Umtopfen empfohlen: Topf wirkt zu klein für diese Art"
  "recommendedPotDiameter": string|null, // Empfohlener Mindest-Durchmesser, z.B. "18 cm" — nur wenn Umtopfen empfohlen wird, sonst null
  "recommendedSoilType": string,         // Ideale Erdmischung, z.B. "Zimmerpflanzenerde mit 20 % Perlit" oder "Orchideenerde (Rindenmulch-Mix)"
  "dailyPlan": [                         // Exakt 30 Einträge, day 1 bis day 30
    {
      "day": number,              // 1 bis 30
      "giessen": boolean,         // Gießen an diesem Tag?
      "bespruehen": boolean,      // Besprühen / Bestäuben?
      "beschneiden": boolean,     // Beschneiden / Rückschnitt empfohlen? null = nicht relevant
      "drehen": boolean,          // Pflanze drehen (für gleichmäßigen Wuchs)?
      "duengen": boolean,         // Düngen an diesem Tag?
      "duengerart": string|null,  // "biologisch", "mineralisch" oder null (wenn nicht gedüngt)
      "umtopfen": boolean,        // Umtopfen an diesem Tag? Nur true wenn potSizeRecommendation Umtopfen empfiehlt, dann an Tag 1 oder 2
      "notizen": string           // Kurze deutsche Anmerkung / Pflegehinweis für diesen Tag (1–2 Sätze)
    }
  ]
}

Regeln für den Pflegeplan:
- Erstelle exakt 30 Einträge (day 1 bis 30), keinen mehr, keinen weniger.
- Plane realistische Pflege-Rhythmen:
  - Gießen: alle 2–5 Tage je nach Pflanzenart und Gesundheitszustand
  - Besprühen: alle 3–7 Tage (bei tropischen Zimmerpflanzen öfter)
  - Düngen: alle 7–14 Tage abwechselnd biologisch/mineralisch (nur wenn sinnvoll)
  - Beschneiden: 1–2 Termine, meist in Woche 1 und 3 (bei Bedarf durch Symptome)
  - Drehen: alle 5–7 Tage (für gleichmäßigen Wuchs am Fensterbrett)
  - Umtopfen: falls empfohlen → exakt einmal, an Tag 1 oder 2; sonst immer false
- Krank (Score < 70): intensivere Pflege in den ersten 14 Tagen
- Gesund (Score >= 70): reguläre Routine

Regeln für Topf & Erde:
- Bewerte potSizeRecommendation auf Basis der Pflanzenart und (falls Foto vorhanden) des sichtbaren Topfes. Wenn die Pflanze typischerweise viel Wurzelraum benötigt oder der Topf auf dem Foto relativ klein wirkt, empfehle Umtopfen.
- recommendedPotDiameter: Nur befüllen wenn Umtopfen empfohlen wird (ca. 3–5 cm größer als typischer Topf für die Art), sonst null.
- recommendedSoilType: Immer befüllen – spezifisch für die Pflanzenart (z.B. Orchideen → Rindenmulch, Kakteen → Kakteenerde, Zimmerpflanzen → Einheitserde + Perlit).`;

export async function generateCareGuide(params: {
  plantName: string;
  healthScore: number;
  symptoms: string[];
  duengeBiologisch: string;
  duegeChemisch: string;
  imageDataUrl?: string | null;
}): Promise<CareGuideResult> {
  const { plantName, healthScore, symptoms, duengeBiologisch, duegeChemisch, imageDataUrl } = params;
  const symptomsText = symptoms.length > 0 ? symptoms.join(", ") : "keine";

  const textPart = {
    text:
      `${CARE_GUIDE_PROMPT}\n\n` +
      `Pflanze: ${plantName}\n` +
      `Gesundheits-Score: ${healthScore}/100\n` +
      `Erkannte Symptome: ${symptomsText}\n` +
      `Biologische Düngeempfehlung: ${duengeBiologisch}\n` +
      `Mineralische Düngeempfehlung: ${duegeChemisch}\n\n` +
      `Erstelle jetzt den vollständigen 30-Tage-Pflegeplan als JSON.`,
  };

  // Include the plant photo for multimodal pot-size analysis if available
  const parts: unknown[] = imageDataUrl
    ? (() => {
        const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        return match
          ? [textPart, { inlineData: { mimeType: match[1], data: match[2] } }]
          : [textPart];
      })()
    : [textPart];

  const contents = [{ role: "user", parts }];
  const parsed = await runModelChain(contents, MODELS);
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const targetHumidity =
    typeof obj.targetHumidity === "string" && obj.targetHumidity.trim().length > 0
      ? obj.targetHumidity.trim()
      : "50–70 %";

  const potSizeRecommendation =
    typeof obj.potSizeRecommendation === "string" && obj.potSizeRecommendation.trim().length > 0
      ? obj.potSizeRecommendation.trim()
      : "Aktueller Topf ist ausreichend";

  const recommendedPotDiameter =
    typeof obj.recommendedPotDiameter === "string" && obj.recommendedPotDiameter.trim().length > 0
      ? obj.recommendedPotDiameter.trim()
      : null;

  const recommendedSoilType =
    typeof obj.recommendedSoilType === "string" && obj.recommendedSoilType.trim().length > 0
      ? obj.recommendedSoilType.trim()
      : "Hochwertige Zimmerpflanzenerde";

  const needsRepotting =
    potSizeRecommendation.toLowerCase().includes("umtopfen") ||
    potSizeRecommendation.toLowerCase().includes("zu klein");

  const rawPlan = Array.isArray(obj.dailyPlan) ? obj.dailyPlan : [];
  const dailyPlan: CareGuideDailyEntry[] = rawPlan
    .slice(0, 30)
    .map((entry: unknown, index: number) => {
      const e = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
      const day = typeof e.day === "number" ? e.day : index + 1;
      // Enforce: umtopfen only allowed on day 1 or 2, and only when repotting is recommended
      const umtopfen = needsRepotting && (day === 1 || day === 2) && e.umtopfen === true;
      return {
        day,
        giessen: e.giessen === true,
        bespruehen: e.bespruehen === true,
        beschneiden: e.beschneiden === true ? true : e.beschneiden === false ? false : null,
        drehen: e.drehen === true,
        duengen: e.duengen === true,
        duengerart:
          e.duengerart === "biologisch" || e.duengerart === "mineralisch"
            ? e.duengerart
            : null,
        umtopfen,
        notizen: typeof e.notizen === "string" && e.notizen.trim().length > 0 ? e.notizen.trim() : "",
      };
    });

  // If repotting is needed but the AI didn't set umtopfen on day 1, force it
  if (needsRepotting && dailyPlan.length > 0 && !dailyPlan.some((d) => d.umtopfen)) {
    dailyPlan[0] = { ...dailyPlan[0], umtopfen: true };
  }

  // Pad to 30 entries if the model returned fewer
  while (dailyPlan.length < 30) {
    const day = dailyPlan.length + 1;
    dailyPlan.push({
      day,
      giessen: day % 3 === 0,
      bespruehen: day % 5 === 0,
      beschneiden: null,
      drehen: day % 7 === 0,
      duengen: day % 14 === 0,
      duengerart: day % 14 === 0 ? "biologisch" : null,
      umtopfen: false,
      notizen: "",
    });
  }

  return { targetHumidity, potSizeRecommendation, recommendedPotDiameter, recommendedSoilType, dailyPlan: dailyPlan.slice(0, 30) };
}

const EDIBLE_MEDICINAL_REVIEW_PROMPT = `Du bist ein Experte für moderne Phytotherapie und Pflanzenheilkunde. \
Beurteile, ob die unten genannte Pflanze HEUTE als anerkannte Heilpflanze gilt — \
d.h. ob ihre medizinische Anwendung durch aktuelle deutschsprachige Kräuterbücher, Apotheken, \
Heilpraktiker oder anerkannte Naturheilkunde-Fachverbände empfohlen wird. \
Pflanzen, die nur als Nahrungsmittel bekannt sind oder lediglich vage volksmedizinisch genutzt wurden, \
ohne dass dies heute noch aktiv empfohlen wird, gelten NICHT als Heilpflanzen. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) in exakt dieser Form:
{
  "promoteMedicinal": boolean,
  "reason": string
}
promoteMedicinal: true = wird heute noch aktiv als Heilpflanze empfohlen und sollte als "medicinal" eingestuft werden; \
false = kein aktuell anerkannter Heilkraut-Status (nur Nahrungsmittel, historisch oder fehlende Evidenz). \
reason: knappe deutsche Begründung (1-2 Sätze).`;

// Text-only review: asks the AI whether a stored "edible" plant should instead
// be categorised as "medicinal" by current phytotherapy standards.
// Returns promoteMedicinal=true (should be promoted) or false (stays edible).
export async function reviewEdibleForMedicinal(
  germanName: string,
  botanicalName: string,
): Promise<{ promoteMedicinal: boolean; reason: string }> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            `${EDIBLE_MEDICINAL_REVIEW_PROMPT}\n\n` +
            `Pflanze: ${germanName} (${botanicalName}). Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = await runModelChain(contents, TEXT_MODELS);
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const promoteMedicinal =
    typeof obj.promoteMedicinal === "boolean" ? obj.promoteMedicinal : false;
  const reason =
    typeof obj.reason === "string" && obj.reason.trim().length > 0
      ? obj.reason.trim()
      : "";
  return { promoteMedicinal, reason };
}

const ANIMALS_BACKFILL_PROMPT = `Du bist ein botanischer und tiermedizinischer Experte. \
Erstelle für die unten genannte Pflanze eine Einschätzung für jede dieser Tierarten: \
Geflügel/Hühner ("poultry"), Hase/Kaninchen ("rabbit"), Meerschweinchen ("guineaPig"), Katze ("cat"), Pferd ("horse"). \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) in exakt dieser Form:
{
  "poultry":   { "status": "safe" | "poisonous", "toxicityDetails": string, "benefits": string },
  "rabbit":    { "status": "safe" | "poisonous", "toxicityDetails": string, "benefits": string },
  "guineaPig": { "status": "safe" | "poisonous", "toxicityDetails": string, "benefits": string },
  "cat":       { "status": "safe" | "poisonous", "toxicityDetails": string, "benefits": string },
  "horse":     { "status": "safe" | "poisonous", "toxicityDetails": string, "benefits": string }
}
status: ist die Pflanze für dieses Tier unbedenklich ("safe") oder giftig ("poisonous")? \
toxicityDetails: deutsche Erklärung zur Giftigkeit bzw. Verträglichkeit für genau dieses Tier, inkl. Symptome falls giftig. \
benefits: medizinische Wirkung/Nutzen für dieses Tier, deutsch; falls keine bekannt, "Keine bekannte medizinische Wirkung.". \
Sei im Zweifel vorsichtig: wenn Giftigkeit nicht ausgeschlossen werden kann, setze status auf "poisonous".`;

// Text-only generation (no image) used to backfill per-animal fact sheets for
// plants that were scanned before the "Status Tiere" feature existed. Driven by
// the plant's German + botanical name so the result matches the archived entry.
export async function generateAnimalsForPlant(
  germanName: string,
  botanicalName: string,
): Promise<AnimalsMap> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `${ANIMALS_BACKFILL_PROMPT}\n\nPflanze: ${germanName} (${botanicalName}). Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = await runModelChain(contents, TEXT_MODELS);
  return coerceAnimals(parsed);
}

const SYMPTOMS_BACKFILL_PROMPT = `Du bist ein botanischer und medizinischer Experte. \
Unten stehen der Name einer Pflanze und Beschreibungen ihrer bekannten Heilwirkung für Menschen und verschiedene Tiere. \
Leite daraus für jede Zielgruppe die konkreten Beschwerden/Symptome ab, gegen die die Pflanze helfen kann. \
Zielgruppen: Mensch ("human"), Geflügel/Hühner ("poultry"), Hase/Kaninchen ("rabbit"), Meerschweinchen ("guineaPig"), Katze ("cat"), Pferd ("horse"). \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) in exakt dieser Form:
{
  "human":     string[],
  "poultry":   string[],
  "rabbit":    string[],
  "guineaPig": string[],
  "cat":       string[],
  "horse":     string[]
}
Jeweils eine Liste kurzer, kanonischer deutscher Schlagwörter im Singular/Grundform, z.B. "Husten", "Entzündung", "Verdauungsbeschwerden", "Wunden", "Durchfall". \
Wichtig – verwende immer diese kanonischen Begriffe: \
alles mit Wunde/Wundheilung → "Wunden"; \
alles mit Leber → "Leberbeschwerden"; \
alles mit Herz-Kreislauf → "Herz-Kreislauf-Erkrankungen"; \
alles mit Harnweg → "Harnwegsinfektion"; \
alles mit Atemweg → "Atemwegsbeschwerden"; \
alles mit Haut (Hautleiden, Hautentzündung, Hautprobleme etc.) → "Hautprobleme"; \
alles mit Hals (Halsschmerzen, Halsbeschwerden etc.) → "Halsbeschwerden"; \
alles mit Zähnen (Zahnabnutzung, Zahnproblematik etc.) → "Zahnprobleme"; \
alles mit Verdauung (Verdauungsprobleme, Verdauungsstörung etc.) → "Verdauungsbeschwerden". \
Stütze dich ausschließlich auf die unten genannte Heilwirkung - erfinde keine Beschwerden, die dort nicht gedeckt sind. \
Wenn für eine Zielgruppe keine Heilwirkung beschrieben ist, gib eine leere Liste [] an.`;

// Text-only generation (no image) used to backfill treatable-symptom tags for
// plants scanned before the "Kräuter-Hexe" feature existed. Grounded in the
// plant's already-stored benefit texts so the tags match the archived entry.
const TOXICITY_BACKFILL_PROMPT = `Du bist ein botanischer und toxikologischer Experte. \
Unten stehen der Name einer Pflanze sowie Informationen zu ihrer Giftigkeit für Menschen und Tiere. \
Ordne die Giftigkeit für jede der unten genannten Zielgruppen einer der drei Stufen zu: \
"intolerant" (unverträglich: milde Reaktion, Magen-Darm-Beschwerden, keine schwere Vergiftung), \
"poisonous" (giftig: systemische toxische Wirkung, der Betroffene wird ernsthaft krank), \
"lethal" (tödlich: kann bei Verzehr zum Tod führen). \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown) in exakt dieser Form:
{
  "humanToxicityLevel": "intolerant" | "poisonous" | "lethal" | null,
  "animals": {
    "poultry":   "intolerant" | "poisonous" | "lethal" | null,
    "rabbit":    "intolerant" | "poisonous" | "lethal" | null,
    "guineaPig": "intolerant" | "poisonous" | "lethal" | null,
    "cat":       "intolerant" | "poisonous" | "lethal" | null,
    "horse":     "intolerant" | "poisonous" | "lethal" | null
  }
}
Gib null zurück wenn die Zielgruppe nicht betroffen ist (also essbar/unbedenklich). \
Sei im Zweifel vorsichtig: im Zweifelsfall eher "poisonous" als "intolerant".`;

// Text-only generation (no image) used to backfill missing toxicity-level
// classifications for plants that were scanned before the three-tier
// "GIFTIG – unverträglich / giftig / tödlich" feature existed.
export async function generateToxicityForPlant(input: {
  germanName: string;
  botanicalName: string;
  humanStatus: string;
  edibilityDetails: string;
  animals: AnimalsMap;
}): Promise<{ humanToxicityLevel?: ToxicityLevel; animals: AnimalsMap }> {
  const animalLines = ANIMAL_KINDS.map((kind) => {
    const a = input.animals[kind];
    return `- ${kind}: status=${a?.status ?? "unbekannt"}, details=${a?.toxicityDetails?.slice(0, 120) ?? "keine Angabe"}`;
  }).join("\n");
  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            `${TOXICITY_BACKFILL_PROMPT}\n\n` +
            `Pflanze: ${input.germanName} (${input.botanicalName}).\n` +
            `Giftigkeit Mensch: status=${input.humanStatus}, details=${input.edibilityDetails.slice(0, 200)}\n` +
            `Giftigkeit Tiere:\n${animalLines}\n\n` +
            `Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = (await runModelChain(contents, TEXT_MODELS)) as Record<string, unknown>;
  const animalsResult = (parsed.animals ?? {}) as Record<string, unknown>;

  const humanToxicityLevel =
    input.humanStatus === "poisonous"
      ? coerceEnum(parsed.humanToxicityLevel, TOXICITY_LEVELS, "poisonous")
      : undefined;

  const animals: AnimalsMap = { ...input.animals };
  for (const kind of ANIMAL_KINDS) {
    const existing = animals[kind];
    if (existing?.status === "poisonous" && !existing.toxicityLevel) {
      animals[kind] = {
        ...existing,
        toxicityLevel: coerceEnum(animalsResult[kind], TOXICITY_LEVELS, "poisonous"),
      };
    }
  }

  return { humanToxicityLevel, animals };
}

const FRUITS_BACKFILL_PROMPT = `Du bist ein botanischer Experte. \
Unten steht der Name einer Pflanze. \
Beantworte ausschließlich diese Frage: Hat diese Pflanze Früchte, die für Menschen essbar und genießbar sind? \
Gemeint sind echte essbare Früchte (z.B. Äpfel, Birnen, Kirschen, Holunderbeeren, Hagebutten, Ebereschenbeeren wenn verarbeitet, Schlehen). \
Nicht gemeint: Früchte die giftig sind, oder Pflanzenteile die keine Früchte sind. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown):
{ "hasEdibleFruits": true | false }`;

const PREPARATION_BACKFILL_PROMPT = `Du bist ein Kochexperte und Botaniker. \
Unten steht der Name einer essbaren Pflanze oder eines essbaren Pilzes. \
Beschreibe in 1-3 kurzen deutschen Sätzen, wie man sie essen oder zubereiten kann \
(z.B. roh, gekocht, als Tee, Salat, Suppe, gebraten, eingelegt, getrocknet). \
Nenne nur die gängigsten und praktischsten Zubereitungsarten. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown):
{ "preparation": string }`;

// Text-only generation (no image) used to backfill preparation descriptions
// for edible plants scanned before this field existed.
export async function generatePreparationForPlant(input: {
  germanName: string;
  botanicalName: string;
}): Promise<{ preparation: string }> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            `${PREPARATION_BACKFILL_PROMPT}\n\n` +
            `Pflanze: ${input.germanName} (${input.botanicalName}).\n` +
            `Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = (await runModelChain(contents, TEXT_MODELS)) as Record<string, unknown>;
  return { preparation: coerceText(parsed.preparation, "") };
}

export async function generateFruitsForPlant(input: {
  germanName: string;
  botanicalName: string;
}): Promise<{ hasEdibleFruits: boolean }> {
  const contents = [
    {
      role: "user",
      parts: [
        {
          text:
            `${FRUITS_BACKFILL_PROMPT}\n\n` +
            `Pflanze: ${input.germanName} (${input.botanicalName}).\n` +
            `Erstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = (await runModelChain(contents, TEXT_MODELS)) as Record<string, unknown>;
  return { hasEdibleFruits: parsed.hasEdibleFruits === true };
}

export async function generateSymptomsForPlant(input: {
  germanName: string;
  botanicalName: string;
  benefits: Partial<Record<HealTargetKind, string>>;
}): Promise<SymptomsMap> {
  const benefitLines = HEAL_TARGET_KINDS.map((target) => {
    const text = input.benefits[target]?.trim();
    return `- ${target}: ${text && text.length > 0 ? text : "keine Angabe"}`;
  }).join("\n");
  const contents = [
    {
      role: "user",
      parts: [
        {
          text: `${SYMPTOMS_BACKFILL_PROMPT}\n\nPflanze: ${input.germanName} (${input.botanicalName}).\nBekannte Heilwirkung je Zielgruppe:\n${benefitLines}\n\nErstelle das JSON.`,
        },
      ],
    },
  ];
  const parsed = await runModelChain(contents, TEXT_MODELS);
  return coerceSymptoms(parsed);
}

export async function identifyPlant(
  imageDataUrl: string,
  sideImageDataUrl?: string,
): Promise<PlantIdentification> {
  const main = parseDataUrl(imageDataUrl);
  const side = sideImageDataUrl ? parseDataUrl(sideImageDataUrl) : undefined;

  const parsed = await requestPlantJson(main, side);

  const fields = parsed as Record<string, unknown>;

  let humanStatus = coerceEnum(fields.humanStatus, HUMAN_STATUSES, "poisonous");
  const modelCategory = coerceEnum(fields.category, PLANT_CATEGORIES, "edible");

  // coerceAnimals always returns every kind, so animals.poultry is guaranteed.
  const animals = coerceAnimals(fields.animals);
  const poultry = animals.poultry!;

  // Form-based buckets (mushroom, tree, shrub, moss, cactus) always keep their
  // own category - giftig/essbar is carried by the safety badges (and the
  // Pilze split view). Only herbaceous plants are re-bucketed to "poisonous"
  // when toxic for humans. Enforced deterministically, not trusted to the model.
  const category =
    modelCategory === "mushroom" ||
    modelCategory === "tree" ||
    modelCategory === "shrub" ||
    modelCategory === "moss" ||
    modelCategory === "cactus"
      ? modelCategory
      : humanStatus === "poisonous"
        ? "poisonous"
        : modelCategory;

  let edibilityDetails = coerceText(
    fields.edibilityDetails,
    "Keine verlässliche Einschätzung möglich - im Zweifel nicht verzehren.",
  );

  // Mushroom safety gate - deterministic, never trusted to the model alone: a
  // mushroom is only ever listed as edible when BOTH views (top + side) were
  // provided AND the model explicitly confirmed a confident, lookalike-safe
  // identification. A missing/absent flag counts as "not confident" (same
  // sentinel rule as everywhere else). Everything else is stored as poisonous,
  // with the reason prepended so the detail page explains the downgrade.
  if (category === "mushroom" && humanStatus === "edible") {
    const confident = fields.mushroomEdibleConfident === true;
    if (!side) {
      humanStatus = "poisonous";
      edibilityDetails =
        "⚠️ Nicht als essbar bestätigt: Für die Essbar-Einstufung eines Pilzes sind zwei Fotos nötig (von oben und von der Seite). Bitte nutze den Pilz-Scan mit 2 Fotos. Zur Sicherheit wird dieser Pilz bis dahin wie ein giftiger Pilz behandelt.\n\n" +
        edibilityDetails;
    } else if (!confident) {
      humanStatus = "poisonous";
      edibilityDetails =
        "⚠️ Nicht als essbar bestätigt: Die Bestimmung war nicht eindeutig genug (mögliche Verwechslungsgefahr mit giftigen Arten). Zur Sicherheit wird dieser Pilz wie ein giftiger Pilz behandelt.\n\n" +
        edibilityDetails;
    }
  }

  return {
    istPflanze: fields.istPflanze !== false,
    germanName: coerceText(fields.germanName, "Unbekannte Pflanze"),
    botanicalName: coerceText(fields.botanicalName, UNKNOWN_BOTANICAL_NAME),
    category,
    humanStatus,
    humanToxicityLevel: humanStatus === "poisonous"
      ? coerceEnum(fields.humanToxicityLevel, TOXICITY_LEVELS, "poisonous")
      : undefined,
    // Legacy poultry columns mirror animals.poultry for backward compatibility.
    poultryStatus: poultry.status,
    edibilityDetails,
    animalToxicityDetails: poultry.toxicityDetails,
    activeIngredients: coerceText(fields.activeIngredients, "Nicht bekannt."),
    humanBenefits: coerceText(
      fields.humanBenefits,
      "Keine bekannte medizinische Wirkung.",
    ),
    poultryBenefits: poultry.benefits,
    animals,
    symptoms: coerceSymptoms(fields.symptoms),
    // symptomApplications is intentionally left empty here: generating
    // per-symptom instructions adds ~1,500-3,000 output tokens to every scan,
    // roughly doubling response time. Instead, plants.ts fires
    // generateSymptomApplicationsForPlant() as a background task after the
    // plant row is saved, so the scan returns to the client immediately and
    // the instructions appear a few seconds later (handled by the existing
    // backfill path, which already covers plants where this map is empty).
    symptomApplications: {},
    habitat: coerceText(fields.habitat, "Keine Angaben zum Standort."),
    siteConditions: coerceText(
      fields.siteConditions,
      "Keine Angaben zu den Standortbedingungen.",
    ),
    otherUses: coerceText(
      fields.otherUses,
      "Keine besonderen weiteren Nutzungsmöglichkeiten bekannt.",
    ),
    fertilizerTips: coerceText(
      fields.fertilizerTips,
      "Keine Angaben zur Düngung.",
    ),
    hasEdibleFruits: fields.hasEdibleFruits === true ? true
      : fields.hasEdibleFruits === false ? false
      : null,
    preparation: humanStatus === "edible"
      ? coerceText(fields.preparation, "")
      : "",
  };
}
