/**
 * Futterplaner, step 1 (docs/futterplaner.md): a farm's own feeds, the daily
 * ration of an animal or a herd, and its check against the need of the
 * species and life stage – with the warnings that cannot be dismissed (toxic
 * plants, mineral feed for another species, a running withdrawal period).
 * Fixed rules only; no AI.
 */

import {
  db,
  farmAnimalsTable,
  farmFeedsTable,
  feedRationsTable,
  herdsTable,
  medicalRecordsTable,
  plantsTable,
  type FarmSpecies,
  type RationItemJson,
} from '@workspace/db';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { archiveKindFor, statusFor } from './farmAi';
import { FEED_CATALOG, feedByKey, type FeedCategory, type FeedValues } from './feedCatalog';
import { FEED_NEEDS, LIFE_STAGES, checkRation, needFor, type LifeStage, type NutrientCheck } from './feedNeeds';
import { berlinDay } from './monitoring';
import { speciesKey } from './speciesKey';

const SPECIES_DE: Record<FarmSpecies, string> = {
  poultry: 'Geflügel',
  rabbit: 'Kaninchen',
  guineaPig: 'Meerschweinchen',
  cat: 'Katzen',
  horse: 'Pferde',
  dog: 'Hunde',
  goat: 'Ziegen',
  sheep: 'Schafe',
  cattle: 'Rinder',
  pig: 'Schweine',
  other: 'sonstige Tiere',
};

const CATEGORIES: FeedCategory[] = ['roughage', 'fresh', 'grain', 'compound', 'vegetable', 'mineral'];

// ── Own feeds ────────────────────────────────────────────────────────────────

/** Values as printed on a label ("analytische Bestandteile"), i.e. as fed. */
export interface LabelValues {
  crudeProtein: number;
  crudeFat: number;
  crudeFibre: number;
  /** % as fed. */
  calcium: number;
  phosphorus: number;
  /** mg/kg as fed. */
  copper?: number | null;
}

export interface FarmFeedInput {
  name: unknown;
  category: string;
  dryMatter: number;
  label: LabelValues;
  forSpecies?: string[] | null;
  botanicalName?: unknown;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Label values (as fed) → values per kg dry matter, like the feed list. */
export function fromLabel(dryMatter: number, label: LabelValues): FeedValues {
  const per = (v: number) => v / (dryMatter / 100);
  return {
    dryMatter,
    crudeProtein: r2(per(label.crudeProtein)),
    crudeFat: r2(per(label.crudeFat)),
    crudeFibre: r2(per(label.crudeFibre)),
    calcium: r2(per(label.calcium) * 10),
    phosphorus: r2(per(label.phosphorus) * 10),
    copper: label.copper == null ? null : r2(per(label.copper)),
  };
}

export async function listFarmFeeds(farmId: number) {
  return db.select().from(farmFeedsTable).where(eq(farmFeedsTable.farmId, farmId)).orderBy(asc(farmFeedsTable.name));
}

export async function addFarmFeed(farmId: number, input: FarmFeedInput) {
  const name = text(input.name, 80, 'Der Name', true);
  if (!CATEGORIES.includes(input.category as FeedCategory)) throw new FarmDataError(400, 'Bitte wähle eine Futterart.');
  const dm = Number(input.dryMatter);
  if (!Number.isFinite(dm) || dm < 5 || dm > 100) throw new FarmDataError(400, 'Die Trockenmasse liegt zwischen 5 und 100 %.');
  const l = input.label;
  const pct = [l.crudeProtein, l.crudeFat, l.crudeFibre, l.calcium, l.phosphorus];
  if (pct.some((v) => !Number.isFinite(v) || v < 0 || v > 100) || pct.slice(0, 3).reduce((s, v) => s + v, 0) > dm) {
    throw new FarmDataError(400, 'Bitte prüfe die Werte vom Etikett (in %).');
  }
  if (l.copper != null && (!Number.isFinite(l.copper) || l.copper < 0 || l.copper > 50_000)) throw new FarmDataError(400, 'Kupfer in mg/kg prüfen.');
  const forSpecies = input.forSpecies?.length ? input.forSpecies.filter((s): s is FarmSpecies => s in SPECIES_DE) : null;
  const [row] = await db
    .insert(farmFeedsTable)
    .values({
      farmId,
      name,
      category: input.category,
      values: fromLabel(dm, l),
      forSpecies: forSpecies?.length ? forSpecies : null,
      botanicalName: text(input.botanicalName, 80, 'Der botanische Name'),
    })
    .returning();
  return row!;
}

export async function removeFarmFeed(farmId: number, feedId: number): Promise<void> {
  const used = await db
    .select({ id: feedRationsTable.id })
    .from(feedRationsTable)
    .where(and(eq(feedRationsTable.farmId, farmId), sql`${feedRationsTable.items} @> ${JSON.stringify([{ feedId }])}::jsonb`));
  if (used.length > 0) throw new FarmDataError(409, 'Das Futtermittel steht noch in einer Ration.');
  const deleted = await db
    .delete(farmFeedsTable)
    .where(and(eq(farmFeedsTable.id, feedId), eq(farmFeedsTable.farmId, farmId)))
    .returning({ id: farmFeedsTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── Rations ──────────────────────────────────────────────────────────────────

export const FEED_TIMES = ['morgens', 'mittags', 'abends'] as const;

export interface RationInput {
  animalId?: number | null;
  herdId?: number | null;
  stage: string;
  items: RationItemJson[];
  times: string[];
  waterL?: number | null;
}

interface Target {
  kind: 'animal' | 'herd';
  id: number;
  name: string;
  species: FarmSpecies;
  /** Animals fed with this ration (a herd's active animals, at least 1). */
  count: number;
  animalIds: number[];
}

async function targetOf(farmId: number, animalId: number | null, herdId: number | null): Promise<Target> {
  if (animalId != null) {
    const [a] = await db
      .select({ id: farmAnimalsTable.id, name: farmAnimalsTable.name, species: farmAnimalsTable.species })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
    if (!a) throw notFound();
    return { kind: 'animal', id: a.id, name: a.name, species: a.species, count: 1, animalIds: [a.id] };
  }
  if (herdId != null) {
    const [h] = await db
      .select({ id: herdsTable.id, name: herdsTable.name, species: herdsTable.species })
      .from(herdsTable)
      .where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)));
    if (!h) throw notFound();
    const members = await db
      .select({ id: farmAnimalsTable.id })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.farmId, farmId), eq(farmAnimalsTable.herdId, herdId), isNull(farmAnimalsTable.archivedAt)));
    return { kind: 'herd', id: h.id, name: h.name, species: h.species, count: Math.max(1, members.length), animalIds: members.map((m) => m.id) };
  }
  throw new FarmDataError(400, 'Bitte wähle ein Tier oder eine Gruppe.');
}

export function stagesFor(species: FarmSpecies): LifeStage[] {
  const known = FEED_NEEDS[species];
  return known ? LIFE_STAGES.filter((s) => s in known) : ['maintenance'];
}

export async function saveRation(farmId: number, input: RationInput) {
  const animalId = input.animalId ?? null;
  const herdId = animalId == null ? (input.herdId ?? null) : null;
  const target = await targetOf(farmId, animalId, herdId);
  const stage = input.stage as LifeStage;
  if (!stagesFor(target.species).includes(stage)) throw new FarmDataError(400, 'Diese Lebensphase gibt es für die Tierart nicht.');
  if (input.items.length === 0 || input.items.length > 20) throw new FarmDataError(400, 'Eine Ration hat 1 bis 20 Futtermittel.');
  const own = new Set((await listFarmFeeds(farmId)).map((f) => f.id));
  const items: RationItemJson[] = input.items.map((i) => {
    const grams = Math.round(Number(i.grams) * 10) / 10;
    if (!Number.isFinite(grams) || grams <= 0 || grams > 100_000) throw new FarmDataError(400, 'Die Menge je Tier und Tag liegt zwischen 0,1 g und 100 kg.');
    if (i.feedKey && feedByKey(i.feedKey)) return { feedKey: i.feedKey, grams };
    if (i.feedId != null && own.has(i.feedId)) return { feedId: i.feedId, grams };
    throw new FarmDataError(400, 'Dieses Futtermittel gibt es nicht.');
  });
  const times = FEED_TIMES.filter((t) => input.times.includes(t));
  const waterL = input.waterL == null ? null : Number(input.waterL);
  if (waterL !== null && (!Number.isFinite(waterL) || waterL < 0 || waterL > 500)) throw new FarmDataError(400, 'Wasser in Litern prüfen.');
  const values = { farmId, animalId: target.kind === 'animal' ? target.id : null, herdId: target.kind === 'herd' ? target.id : null, stage, items, times, waterL, updatedAt: new Date() };
  const [existing] = await db
    .select({ id: feedRationsTable.id })
    .from(feedRationsTable)
    .where(and(eq(feedRationsTable.farmId, farmId), target.kind === 'animal' ? eq(feedRationsTable.animalId, target.id) : eq(feedRationsTable.herdId, target.id)));
  const [row] = existing
    ? await db.update(feedRationsTable).set(values).where(eq(feedRationsTable.id, existing.id)).returning()
    : await db.insert(feedRationsTable).values(values).returning();
  return (await evaluate(farmId, [row!]))[0]!;
}

export async function removeRation(farmId: number, rationId: number): Promise<void> {
  const deleted = await db
    .delete(feedRationsTable)
    .where(and(eq(feedRationsTable.id, rationId), eq(feedRationsTable.farmId, farmId)))
    .returning({ id: feedRationsTable.id });
  if (deleted.length === 0) throw notFound();
}

export async function listRations(farmId: number) {
  const rows = await db.select().from(feedRationsTable).where(eq(feedRationsTable.farmId, farmId)).orderBy(asc(feedRationsTable.id));
  return evaluate(farmId, rows);
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface Warning {
  kind: 'toxic' | 'foreignMineral' | 'copper' | 'withdrawal';
  text: string;
}

/** A plant feed the plant archive marks poisonous for this species. */
async function toxicFeeds(species: FarmSpecies, feeds: { name: string; botanicalName: string | null }[]): Promise<Warning[]> {
  const kind = archiveKindFor(species);
  const plants = feeds.filter((f) => f.botanicalName && speciesKey(f.botanicalName));
  if (!kind || plants.length === 0) return [];
  const keys = new Set(plants.map((p) => speciesKey(p.botanicalName!)));
  const genera = [...new Set([...keys].map((k) => k!.split(' ')[0]!))];
  const rows = await db
    .select({
      id: plantsTable.id,
      germanName: plantsTable.germanName,
      botanicalName: plantsTable.botanicalName,
      animals: plantsTable.animals,
      poultryStatus: plantsTable.poultryStatus,
      animalToxicityDetails: plantsTable.animalToxicityDetails,
    })
    .from(plantsTable)
    .where(or(...genera.map((g) => sql`lower(${plantsTable.botanicalName}) LIKE ${`${g.toLowerCase()} %`}`)));
  const out: Warning[] = [];
  for (const feed of plants) {
    const key = speciesKey(feed.botanicalName!);
    const row = rows.find((r) => speciesKey(r.botanicalName) === key);
    const status = row ? statusFor(row, kind) : null;
    if (status?.status === 'poisonous') {
      out.push({ kind: 'toxic', text: `${feed.name} ist laut Pflanzenarchiv giftig für ${SPECIES_DE[species]}${status.details ? `: ${status.details}` : '.'}` });
    }
  }
  return out;
}

async function withdrawals(farmId: number, animalIds: number[], today: string): Promise<Warning[]> {
  if (animalIds.length === 0) return [];
  const rows = await db
    .select({
      animalId: medicalRecordsTable.animalId,
      date: medicalRecordsTable.date,
      medication: medicalRecordsTable.medication,
      days: medicalRecordsTable.withdrawalPeriodDays,
      name: farmAnimalsTable.name,
    })
    .from(medicalRecordsTable)
    .innerJoin(farmAnimalsTable, eq(farmAnimalsTable.id, medicalRecordsTable.animalId))
    .where(and(eq(medicalRecordsTable.farmId, farmId), inArray(medicalRecordsTable.animalId, animalIds), isNotNull(medicalRecordsTable.withdrawalPeriodDays)));
  const out: Warning[] = [];
  for (const r of rows) {
    const end = new Date(`${r.date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + (r.days ?? 0));
    const until = end.toISOString().slice(0, 10);
    if (until >= today) {
      const [y, m, d] = until.split('-');
      out.push({
        kind: 'withdrawal',
        text: `${r.name}: Wartezeit${r.medication ? ` nach ${r.medication}` : ''} bis ${d}.${m}.${y} – Eier, Milch und Fleisch nicht verwenden; Medizinalfutter nur für dieses Tier.`,
      });
    }
  }
  return out;
}

interface ResolvedItem {
  ref: { feedKey: string | null; feedId: number | null };
  name: string;
  grams: number;
  values: FeedValues;
  forSpecies: string[] | null;
  botanicalName: string | null;
}

export interface RationEvaluation {
  id: number;
  target: Omit<Target, 'animalIds'>;
  stage: LifeStage;
  items: { feedKey: string | null; feedId: number | null; name: string; grams: number }[];
  times: string[];
  waterL: number | null;
  need: { weightKg: number; dmIntakeKg: number; waterL: number } | null;
  values: ReturnType<typeof checkRation>['values'] | null;
  checks: NutrientCheck[];
  warnings: Warning[];
  /** For the whole group per day: feed as fed (kg) and water (l). */
  group: { feedKg: number; waterL: number | null };
  updatedAt: string;
}

async function evaluate(farmId: number, rows: (typeof feedRationsTable.$inferSelect)[]): Promise<RationEvaluation[]> {
  const own = new Map((await listFarmFeeds(farmId)).map((f) => [f.id, f]));
  const today = berlinDay();
  const out: RationEvaluation[] = [];
  for (const row of rows) {
    let target: Target;
    try {
      target = await targetOf(farmId, row.animalId, row.herdId);
    } catch {
      continue;
    }
    const resolved = row.items.flatMap((i): ResolvedItem[] => {
      const catalog = i.feedKey ? feedByKey(i.feedKey) : undefined;
      const mine = i.feedId != null ? own.get(i.feedId) : undefined;
      if (catalog) return [{ ref: { feedKey: catalog.key, feedId: null }, name: catalog.name, grams: i.grams, values: catalog as FeedValues, forSpecies: catalog.forSpecies as string[] | null, botanicalName: catalog.botanicalName }];
      if (mine) return [{ ref: { feedKey: null, feedId: mine.id }, name: mine.name, grams: i.grams, values: mine.values, forSpecies: mine.forSpecies, botanicalName: mine.botanicalName }];
      return [];
    });
    const stage = row.stage as LifeStage;
    const need = needFor(target.species, stage);
    const result = need ? checkRation(target.species, need, resolved.map((r) => ({ ...r.values, grams: r.grams }))) : null;
    const warnings: Warning[] = [
      ...(await toxicFeeds(target.species, resolved)),
      ...resolved
        .filter((r) => r.forSpecies && !r.forSpecies.includes(target.species))
        .map((r) => ({
          kind: 'foreignMineral' as const,
          text: `${r.name} ist für ${r.forSpecies!.map((s) => SPECIES_DE[s as FarmSpecies] ?? s).join(', ')} gemacht, nicht für ${SPECIES_DE[target.species]}${target.species === 'sheep' ? ' – zu viel Kupfer ist für Schafe giftig.' : '.'}`,
        })),
      ...(result?.checks.filter((c) => c.nutrient === 'copper' && c.severe).map((c) => ({ kind: 'copper' as const, text: `Kupfer ${c.value} mg/kg Trockenmasse – über ${c.max} ist für Schafe giftig.` })) ?? []),
      ...(await withdrawals(farmId, target.animalIds, today)),
    ];
    const { animalIds: _ids, ...publicTarget } = target;
    out.push({
      id: row.id,
      target: publicTarget,
      stage,
      items: resolved.map((r) => ({ ...r.ref, name: r.name, grams: r.grams })),
      times: row.times,
      waterL: row.waterL,
      need: need ? { weightKg: need.weightKg, dmIntakeKg: need.dmIntakeKg, waterL: need.waterL } : null,
      values: result?.values ?? null,
      checks: result?.checks ?? [],
      warnings,
      group: {
        feedKg: Math.round(resolved.reduce((s, r) => s + r.grams, 0) * target.count) / 1000,
        waterL: need ? Math.round(need.waterL * target.count * 10) / 10 : null,
      },
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return out;
}

/** The feed list and the needs, for the app's pickers and labels. */
export function feedReference() {
  return {
    feeds: FEED_CATALOG,
    species: (Object.keys(SPECIES_DE) as FarmSpecies[]).map((species) => ({
      species,
      stages: stagesFor(species),
      hasNeeds: !!FEED_NEEDS[species],
    })),
  };
}
