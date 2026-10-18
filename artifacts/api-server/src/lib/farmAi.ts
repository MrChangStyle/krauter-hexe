/**
 * AI features of "Meine Farm" (step 5): species suggestion for an animal
 * photo, the "Haltungs-Wiki" per species, the feed photo analysis and the
 * bridge to the plant archive ("Heil- und Futterpflanzen" for a species).
 *
 * Every model answer is untrusted: it is coerced into fixed shapes here, and
 * the app labels all of it "KI-Einschätzung – ersetzt keinen Tierarzt".
 * Safety first: a plant counts as poisonous when the archive OR the model
 * says so – never the other way round.
 */

import {
  FARM_SPECIES,
  db,
  foodLogsTable,
  husbandryGuidesTable,
  medicalRecordsTable,
  plantsTable,
  type AnimalKind,
  type AnimalsMap,
  type FarmSpecies,
  type ToxicityLevel,
} from '@workspace/db';
import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';

import { FarmDataError, getAnimal } from './farmAnimals';
import { MODELS, TEXT_MODELS, parseDataUrl, runModelChain } from './plantIdentification';
import { speciesKey } from './speciesKey';

export { speciesKey };

const SPECIES_DE: Record<FarmSpecies, string> = {
  poultry: 'Geflügel (Hühner, Enten, Gänse)',
  rabbit: 'Kaninchen',
  guineaPig: 'Meerschweinchen',
  cat: 'Katze',
  horse: 'Pferd',
  dog: 'Hund',
  goat: 'Ziege',
  sheep: 'Schaf',
  cattle: 'Rind',
  pig: 'Schwein',
  other: 'sonstiges Tier',
};

/** Farm species the plant archive keeps a toxicity status for. */
const ARCHIVE_KIND: Partial<Record<FarmSpecies, AnimalKind>> = {
  poultry: 'poultry',
  rabbit: 'rabbit',
  guineaPig: 'guineaPig',
  cat: 'cat',
  horse: 'horse',
};

export function archiveKindFor(species: FarmSpecies): AnimalKind | null {
  return ARCHIVE_KIND[species] ?? null;
}

const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function checkImage(imageData: string): void {
  if (!IMAGE_PATTERN.test(imageData) || imageData.length > MAX_IMAGE_BYTES * 1.4) {
    throw new FarmDataError(400, 'Bitte wähle ein Foto (JPEG, PNG oder WebP).');
  }
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function strList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => str(v, maxLen)).filter((v): v is string => !!v).slice(0, maxItems);
}

function confidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : 0;
}

const SMALL_CONFIG = { maxOutputTokens: 512, responseMimeType: 'application/json' } as const;
const LARGE_CONFIG = { maxOutputTokens: 4096, responseMimeType: 'application/json' } as const;

// ── Species suggestion ───────────────────────────────────────────────────────

export interface SpeciesSuggestion {
  isAnimal: boolean;
  species: FarmSpecies | null;
  breed: string | null;
  confidence: number;
}

/** Coerces the model answer; unknown species keys become null, not a guess. */
export function coerceSpeciesSuggestion(parsed: Record<string, unknown>): SpeciesSuggestion {
  const isAnimal = parsed['istTier'] !== false;
  const raw = typeof parsed['tierart'] === 'string' ? parsed['tierart'] : '';
  const species = (FARM_SPECIES as readonly string[]).includes(raw) ? (raw as FarmSpecies) : null;
  return {
    isAnimal,
    species: isAnimal ? species : null,
    breed: isAnimal ? str(parsed['rasse'], 60) : null,
    confidence: isAnimal ? confidence(parsed['sicherheit']) : 0,
  };
}

export async function suggestSpecies(imageData: string): Promise<SpeciesSuggestion> {
  checkImage(imageData);
  const image = parseDataUrl(imageData);
  const prompt = `Du bestimmst Haus- und Nutztiere auf Fotos. Antworte nur mit einem JSON-Objekt:
{
  "istTier": boolean (ist ein Tier gut erkennbar?),
  "tierart": einer dieser Schlüssel: ${FARM_SPECIES.map((s) => `"${s}" (${SPECIES_DE[s]})`).join(', ')},
  "rasse": string oder null (deutsche Rassebezeichnung, nur wenn gut erkennbar),
  "sicherheit": Zahl 0 bis 1 (wie sicher bist du bei der Tierart?)
}`;
  const parsed = (await runModelChain(
    [{ role: 'user', parts: [{ text: prompt }, { inlineData: image }] }],
    MODELS,
    SMALL_CONFIG,
  )) as Record<string, unknown>;
  return coerceSpeciesSuggestion(parsed ?? {});
}

// ── Haltungs-Wiki ────────────────────────────────────────────────────────────

export interface HusbandryGuide {
  species: FarmSpecies;
  summary: string;
  nutrition: string;
  housing: string;
  care: string;
  health: string;
  lifeExpectancy: string;
  createdAt: string;
}

const GUIDE_FIELDS = ['summary', 'nutrition', 'housing', 'care', 'health', 'lifeExpectancy'] as const;

export function coerceGuide(parsed: Record<string, unknown>): Omit<HusbandryGuide, 'species' | 'createdAt'> | null {
  const out: Record<string, string> = {};
  for (const f of GUIDE_FIELDS) {
    const v = str(parsed[f], 3000);
    if (!v) return null;
    out[f] = v;
  }
  return out as Omit<HusbandryGuide, 'species' | 'createdAt'>;
}

/**
 * The guide for a species: from the cache, or generated once and stored.
 * Two requests at the same time may both generate; the first insert wins and
 * both get the stored one.
 */
export async function husbandryGuide(species: FarmSpecies): Promise<HusbandryGuide> {
  if (species === 'other') throw new FarmDataError(400, 'Für „Sonstiges“ gibt es kein Haltungs-Wiki.');
  const cached = await readGuide(species);
  if (cached) return cached;

  const prompt = `Schreibe ein kurzes, sachliches Haltungs-Wiki für ${SPECIES_DE[species]} in der Hobby- und Kleinhaltung in Deutschland.
Antworte nur mit einem JSON-Objekt, jedes Feld 2–5 Sätze auf Deutsch, ohne Markdown:
{
  "summary": "Kurzporträt",
  "nutrition": "Ernährung: Grundfutter, Ergänzungen, Wasser, was nie gefüttert werden darf",
  "housing": "Haltung: Platzbedarf, Stall/Auslauf, Gesellschaft, Witterung",
  "care": "Pflege: Klauen/Hufe/Krallen/Fell, Parasiten, Routinen",
  "health": "Häufige Gesundheitsprobleme und Warnzeichen, wann zum Tierarzt",
  "lifeExpectancy": "Lebenserwartung in Jahren, kurz begründet"
}`;
  const parsed = (await runModelChain([{ role: 'user', parts: [{ text: prompt }] }], TEXT_MODELS, LARGE_CONFIG)) as Record<
    string,
    unknown
  >;
  const content = coerceGuide(parsed ?? {});
  if (!content) throw new Error('Incomplete husbandry guide from AI');
  await db.insert(husbandryGuidesTable).values({ species, content }).onConflictDoNothing();
  return (await readGuide(species))!;
}

async function readGuide(species: FarmSpecies): Promise<HusbandryGuide | null> {
  const [row] = await db.select().from(husbandryGuidesTable).where(eq(husbandryGuidesTable.species, species));
  if (!row) return null;
  return { species, ...(row.content as Omit<HusbandryGuide, 'species' | 'createdAt'>), createdAt: row.createdAt.toISOString() };
}

// ── Plant archive bridge ─────────────────────────────────────────────────────

export interface ArchivePlantStatus {
  plantId: number;
  germanName: string;
  botanicalName: string;
  status: 'safe' | 'poisonous';
  toxicityLevel: ToxicityLevel | null;
  details: string;
}

const archiveColumns = {
  id: plantsTable.id,
  germanName: plantsTable.germanName,
  botanicalName: plantsTable.botanicalName,
  animals: plantsTable.animals,
  poultryStatus: plantsTable.poultryStatus,
  animalToxicityDetails: plantsTable.animalToxicityDetails,
};

type ArchiveRow = {
  id: number;
  germanName: string;
  botanicalName: string;
  animals: AnimalsMap;
  poultryStatus: 'safe' | 'poisonous';
  animalToxicityDetails: string;
  poultryBenefits?: string;
};

/** Status of one archive plant for one animal kind; poultry falls back to the legacy columns. */
export function statusFor(row: ArchiveRow, kind: AnimalKind): ArchivePlantStatus | null {
  const info = row.animals?.[kind];
  if (info) {
    return {
      plantId: row.id,
      germanName: row.germanName,
      botanicalName: row.botanicalName,
      status: info.status,
      toxicityLevel: info.status === 'poisonous' ? info.toxicityLevel ?? null : null,
      details: info.toxicityDetails,
    };
  }
  if (kind !== 'poultry') return null;
  return {
    plantId: row.id,
    germanName: row.germanName,
    botanicalName: row.botanicalName,
    status: row.poultryStatus,
    toxicityLevel: null,
    details: row.animalToxicityDetails,
  };
}


// ── Helpful plants ("Heil- und Futterpflanzen") ──────────────────────────────

export type Diet = 'herbivore' | 'omnivore' | 'carnivore';

/** What a species eats – decides whether feed plants make sense at all. */
export const DIET: Record<FarmSpecies, Diet> = {
  rabbit: 'herbivore',
  guineaPig: 'herbivore',
  horse: 'herbivore',
  goat: 'herbivore',
  sheep: 'herbivore',
  cattle: 'herbivore',
  poultry: 'omnivore',
  pig: 'omnivore',
  cat: 'carnivore',
  dog: 'carnivore',
  other: 'omnivore',
};

export interface HelpfulPlant {
  plantId: number;
  germanName: string;
  botanicalName: string;
  /** medicinal: helps with complaints of this species; feed: safe to feed. */
  use: 'medicinal' | 'feed';
  benefits: string | null;
  applications: { symptom: string; howTo: string }[];
}

// Never offered as feed or remedy, whatever an animal entry says.
const NEVER_HELPFUL = new Set(['poisonous', 'mushroom', 'moss', 'cactus']);

type HelpfulRow = ArchiveRow & {
  category: string;
  symptoms: Partial<Record<string, string[]>>;
  symptomApplications: Partial<Record<string, Record<string, string>>>;
};

/**
 * The pure part of helpfulPlantsFor: only plants the archive calls safe for
 * this animal; a botanical species counts as poisonous as soon as ONE of its
 * archive entries says so (safety first). Carnivores get medicinal plants
 * only – a cat does not eat greens.
 */
export function pickHelpfulPlants(rows: HelpfulRow[], kind: AnimalKind, diet: Diet): HelpfulPlant[] {
  const bySpecies = new Map<string, HelpfulRow[]>();
  for (const row of rows) {
    const key = speciesKey(row.botanicalName) ?? row.germanName.toLowerCase();
    bySpecies.set(key, [...(bySpecies.get(key) ?? []), row]);
  }
  const out: HelpfulPlant[] = [];
  for (const group of bySpecies.values()) {
    const statuses = group.map((r) => statusFor(r, kind));
    if (statuses.some((st) => !st || st.status !== 'safe')) continue;
    if (group.some((r) => NEVER_HELPFUL.has(r.category))) continue;
    const row = group.find((r) => (r.symptoms?.[kind]?.length ?? 0) > 0) ?? group[0]!;
    const symptoms = row.symptoms?.[kind] ?? [];
    const howTos = row.symptomApplications?.[kind] ?? {};
    const applications = symptoms
      .filter((sym) => typeof howTos[sym] === 'string' && howTos[sym]!.trim())
      .map((sym) => ({ symptom: sym, howTo: howTos[sym]!.trim() }));
    const medicinal = symptoms.length > 0;
    if (!medicinal && diet === 'carnivore') continue;
    const benefits = row.animals?.[kind]?.benefits?.trim() || (kind === 'poultry' ? row.poultryBenefits?.trim() : '') || null;
    out.push({
      plantId: row.id,
      germanName: row.germanName,
      botanicalName: row.botanicalName,
      use: medicinal ? 'medicinal' : 'feed',
      benefits,
      applications,
    });
  }
  return out.sort(
    (a, b) => (a.use === b.use ? a.germanName.localeCompare(b.germanName, 'de') : a.use === 'medicinal' ? -1 : 1),
  );
}

/** Medicinal (and, for plant eaters, feed) plants of the archive for a species. */
export async function helpfulPlantsFor(species: FarmSpecies): Promise<{ diet: Diet; plants: HelpfulPlant[] }> {
  const diet = DIET[species];
  const kind = archiveKindFor(species);
  if (!kind) return { diet, plants: [] };
  const rows = (await db
    .select({
      ...archiveColumns,
      poultryBenefits: plantsTable.poultryBenefits,
      category: plantsTable.category,
      symptoms: plantsTable.symptoms,
      symptomApplications: plantsTable.symptomApplications,
    })
    .from(plantsTable)
    .where(
      kind === 'poultry'
        ? or(sql`${plantsTable.animals} -> ${kind} IS NOT NULL`, isNotNull(plantsTable.poultryStatus))
        : sql`${plantsTable.animals} -> ${kind} IS NOT NULL`,
    )) as HelpfulRow[];
  return { diet, plants: pickHelpfulPlants(rows, kind, diet) };
}

/**
 * The archive verdict per species key for this animal kind. Poisonous wins:
 * if any archive entry of the species is poisonous, that is the answer.
 */
async function archiveVerdicts(keys: string[], kind: AnimalKind): Promise<Map<string, ArchivePlantStatus>> {
  const result = new Map<string, ArchivePlantStatus>();
  if (keys.length === 0) return result;
  const rows = (await db
    .select(archiveColumns)
    .from(plantsTable)
    .where(or(...keys.map((k) => sql`lower(${plantsTable.botanicalName}) LIKE ${`${k.replace(/[%_]/g, '')}%`}`)))) as ArchiveRow[];
  for (const row of rows) {
    const key = speciesKey(row.botanicalName);
    if (!key || !keys.includes(key)) continue;
    const status = statusFor(row, kind);
    if (!status) continue;
    const prev = result.get(key);
    if (!prev || (prev.status === 'safe' && status.status === 'poisonous')) result.set(key, status);
  }
  return result;
}

// ── Feed analysis ────────────────────────────────────────────────────────────

export interface FeedItem {
  name: string;
  botanicalName: string | null;
  /** The model's own judgement for this species. */
  aiPoisonous: boolean;
  /** What the plant archive says for this species, if it knows the plant. */
  archive: ArchivePlantStatus | null;
  /** Safety first: archive OR model says poisonous. */
  poisonous: boolean;
  note: string | null;
}

export interface FeedAnalysis {
  isFeed: boolean;
  items: FeedItem[];
  nutrients: { protein: string | null; fat: string | null; fiber: string | null; carbohydrates: string | null; minerals: string | null };
  assessment: string;
  medicalNotes: string[];
  verdict: 'good' | 'limited' | 'unsuitable';
}

const VERDICTS = ['good', 'limited', 'unsuitable'] as const;

/** Merges model answer and archive verdicts – the pure part, tested separately. */
export function buildFeedAnalysis(
  parsed: Record<string, unknown>,
  archive: Map<string, ArchivePlantStatus>,
): FeedAnalysis {
  const rawItems = Array.isArray(parsed['bestandteile']) ? (parsed['bestandteile'] as Record<string, unknown>[]) : [];
  const items: FeedItem[] = rawItems.slice(0, 15).flatMap((it) => {
    const name = str(it?.['name'], 80);
    if (!name) return [];
    const botanicalName = str(it['botanisch'], 80);
    const key = botanicalName ? speciesKey(botanicalName) : null;
    const fromArchive = key ? archive.get(key) ?? null : null;
    const aiPoisonous = it['giftig'] === true;
    return [
      {
        name,
        botanicalName,
        aiPoisonous,
        archive: fromArchive,
        poisonous: aiPoisonous || fromArchive?.status === 'poisonous',
        note: str(it['hinweis'], 300),
      },
    ];
  });
  const n = (parsed['naehrstoffe'] ?? {}) as Record<string, unknown>;
  const rawVerdict = parsed['bewertung'];
  let verdict: FeedAnalysis['verdict'] = (VERDICTS as readonly unknown[]).includes(rawVerdict)
    ? (rawVerdict as FeedAnalysis['verdict'])
    : 'limited';
  if (items.some((i) => i.poisonous)) verdict = 'unsuitable';
  return {
    isFeed: parsed['istFutter'] !== false,
    items,
    nutrients: {
      protein: str(n['protein'], 200),
      fat: str(n['fett'], 200),
      fiber: str(n['rohfaser'], 200),
      carbohydrates: str(n['kohlenhydrate'], 200),
      minerals: str(n['mineralstoffe'], 200),
    },
    assessment: str(parsed['einschaetzung'], 1500) ?? '',
    medicalNotes: strList(parsed['hinweiseKrankenakte'], 5, 400),
    verdict,
  };
}

/**
 * Analyses a feed photo for one animal, checks the plants in it against the
 * archive and stores the result as a food log of the farm.
 */
export async function analyzeFeed(farmId: number, animalId: number, imageData: string) {
  checkImage(imageData);
  const animal = await getAnimal(farmId, animalId);
  const records = await db
    .select({
      date: medicalRecordsTable.date,
      diagnosis: medicalRecordsTable.diagnosis,
      medication: medicalRecordsTable.medication,
    })
    .from(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.farmId, farmId), eq(medicalRecordsTable.animalId, animalId)))
    .orderBy(desc(medicalRecordsTable.date))
    .limit(10);
  const history = records.length
    ? records.map((r) => `- ${r.date}: ${r.diagnosis}${r.medication ? ` (Medikament: ${r.medication})` : ''}`).join('\n')
    : '- keine Einträge';

  const prompt = `Du bist Fachberater für Tierernährung. Das Foto zeigt Futter für ein Tier.
Tier: ${SPECIES_DE[animal.species]}${animal.breed ? `, Rasse ${animal.breed}` : ''}.
Krankenakte (neueste zuerst):
${history}

Antworte nur mit einem JSON-Objekt auf Deutsch:
{
  "istFutter": boolean (zeigt das Foto Futter bzw. Pflanzen/Lebensmittel?),
  "bestandteile": [ { "name": "deutscher Name", "botanisch": "botanischer Name (Gattung Art) oder null, wenn keine Pflanze", "giftig": boolean (giftig oder unverträglich für diese Tierart?), "hinweis": "kurz, oder null" } ],
  "naehrstoffe": { "protein": "grobe Einschätzung", "fett": "...", "rohfaser": "...", "kohlenhydrate": "...", "mineralstoffe": "..." },
  "einschaetzung": "2–4 Sätze: passt das Futter zu dieser Tierart?",
  "hinweiseKrankenakte": [ "Hinweis, falls Futter und Krankenakte zusammenhängen (z. B. Wechselwirkung mit Medikament, ungeeignet bei Diagnose) – sonst leere Liste" ],
  "bewertung": "good" | "limited" | "unsuitable"
}
Im Zweifel ist eine Pflanze als giftig zu bewerten.`;

  const parsed = (await runModelChain(
    [{ role: 'user', parts: [{ text: prompt }, { inlineData: parseDataUrl(imageData) }] }],
    MODELS,
    LARGE_CONFIG,
  )) as Record<string, unknown>;

  const kind = archiveKindFor(animal.species);
  const botanical = Array.isArray(parsed?.['bestandteile'])
    ? (parsed['bestandteile'] as Record<string, unknown>[])
        .map((i) => (typeof i?.['botanisch'] === 'string' ? speciesKey(i['botanisch']) : null))
        .filter((k): k is string => !!k)
    : [];
  const archive = kind ? await archiveVerdicts([...new Set(botanical)].slice(0, 15), kind) : new Map();
  const analysis = buildFeedAnalysis(parsed ?? {}, archive);
  if (!analysis.isFeed) {
    throw new FarmDataError(422, 'Auf dem Foto ist kein Futter zu erkennen.');
  }

  const today = new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Berlin' }).format(new Date());
  const [log] = await db
    .insert(foodLogsTable)
    .values({ farmId, animalId, date: today, analysis })
    .returning({ id: foodLogsTable.id, date: foodLogsTable.date, createdAt: foodLogsTable.createdAt });
  return { id: log!.id, animalId, date: log!.date, createdAt: log!.createdAt, analysis };
}

export async function listFeedAnalyses(farmId: number, animalId: number) {
  await getAnimal(farmId, animalId);
  const rows = await db
    .select({
      id: foodLogsTable.id,
      animalId: foodLogsTable.animalId,
      date: foodLogsTable.date,
      createdAt: foodLogsTable.createdAt,
      analysis: foodLogsTable.analysis,
    })
    .from(foodLogsTable)
    .where(and(eq(foodLogsTable.farmId, farmId), eq(foodLogsTable.animalId, animalId)))
    .orderBy(desc(foodLogsTable.createdAt))
    .limit(20);
  return rows.map((r) => ({ ...r, animalId: r.animalId!, analysis: r.analysis as FeedAnalysis }));
}

export async function deleteFeedAnalysis(farmId: number, logId: number): Promise<void> {
  const deleted = await db
    .delete(foodLogsTable)
    .where(and(eq(foodLogsTable.id, logId), eq(foodLogsTable.farmId, farmId)))
    .returning({ id: foodLogsTable.id });
  if (deleted.length === 0) throw new FarmDataError(404, 'Nicht gefunden.');
}
