/**
 * Futterplaner, steps 1 and 3 (docs/futterplaner.md): a farm's own feeds, the daily
 * ration of an animal or a herd, and its check against the need of the
 * species and life stage – with the warnings that cannot be dismissed (toxic
 * plants, mineral feed for another species, coccidiostats outside poultry, a
 * running withdrawal period).
 * Fixed rules only; no AI.
 */

import {
  db,
  farmAnimalsTable,
  farmFeedsTable,
  farmTasksTable,
  feedRationsTable,
  herdsTable,
  medicalRecordsTable,
  plantsTable,
  type FarmSpecies,
  type RationItemJson,
} from '@workspace/db';
import { and, asc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { archiveKindFor, statusFor } from './farmAi';
import { ionophoresIn } from './feedLabel';
import { FEED_CATALOG, feedByKey, type FeedCategory, type FeedValues } from './feedCatalog';
import { FEED_NEEDS, LIFE_STAGES, checkRation, needFor, type LifeStage, type NutrientCheck } from './feedNeeds';
import { berlinDay } from './monitoring';
import { farmLocation, forecast, type DayForecast } from './farmWeather';
import { coldBoost, type ColdBoost } from './feedWeather';
import { SEASONS, activeSeason, addDays, daysBetween, mix, newShareOn, nextSeasonStart, phases, seasonHints, transitionDays, type Phase, type Season } from './feedSeason';
import { createFarmTask } from './farmTasks';
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
  alpaca: 'Alpakas',
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
  additives?: string[] | null;
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

function cleanAdditives(raw: string[] | null | undefined): string[] | null {
  const list = (raw ?? []).map((a) => a.replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 30);
  return list.length ? list : null;
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
      additives: cleanAdditives(input.additives),
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
  /** "all" (default), "summer" or "winter". */
  season?: string | null;
  /** Spread a change of feed over some days (default true). */
  gradual?: boolean | null;
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
  const season = (input.season ?? 'all') as Season;
  if (!SEASONS.includes(season)) throw new FarmDataError(400, 'Bitte wähle ganzjährig, Sommer oder Winter.');

  const today = berlinDay();
  const siblings = await rationsOf(farmId, target);
  const before = siblings.find((r) => r.season === activeSeason(siblings.map((x) => x.season as Season), today));
  const existing = siblings.find((r) => r.season === season);
  const nowActive = activeSeason([...new Set([...siblings.map((x) => x.season as Season), season])], today) === season;
  // A new set of feeds for the ration in effect: change over step by step,
  // from what was fed until now. Only the amounts changed: keep a running change.
  let change: Pick<typeof feedRationsTable.$inferInsert, 'previousItems' | 'changeStartedOn' | 'changeDays'> = {
    previousItems: existing?.previousItems ?? null,
    changeStartedOn: existing?.changeStartedOn ?? null,
    changeDays: existing?.changeDays ?? null,
  };
  if (input.gradual === false || !nowActive) {
    change = { previousItems: null, changeStartedOn: null, changeDays: null };
  } else if (before && !sameFeeds(before.items, items)) {
    change = { previousItems: before.items, changeStartedOn: today, changeDays: transitionDays(target.species) };
  }
  const values = {
    farmId,
    animalId: target.kind === 'animal' ? target.id : null,
    herdId: target.kind === 'herd' ? target.id : null,
    season,
    stage,
    items,
    times,
    waterL,
    ...change,
    updatedAt: new Date(),
  };
  const [row] = existing
    ? await db.update(feedRationsTable).set(values).where(eq(feedRationsTable.id, existing.id)).returning()
    : await db.insert(feedRationsTable).values(values).returning();
  const evaluation = (await evaluate(farmId, [row!]))[0]!;
  if (evaluation.active) await syncReminders(farmId, evaluation, 'save');
  return evaluation;
}

function rationsOf(farmId: number, target: Pick<Target, 'kind' | 'id'>) {
  return db
    .select()
    .from(feedRationsTable)
    .where(and(eq(feedRationsTable.farmId, farmId), target.kind === 'animal' ? eq(feedRationsTable.animalId, target.id) : eq(feedRationsTable.herdId, target.id)));
}

const refOf = (i: RationItemJson) => (i.feedKey ? `k:${i.feedKey}` : `o:${i.feedId}`);

function sameFeeds(a: RationItemJson[], b: RationItemJson[]): boolean {
  const x = new Set(a.map(refOf));
  const y = new Set(b.map(refOf));
  return x.size === y.size && [...x].every((k) => y.has(k));
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
  const rations = await evaluate(farmId, rows);
  for (const ration of rations) if (ration.active) await syncReminders(farmId, ration, 'refresh');
  return rations;
}

/** All rations, evaluated – without touching the reminders (Vorrat, Kosten, Garten). */
export async function evaluatedRations(farmId: number) {
  const rows = await db.select().from(feedRationsTable).where(eq(feedRationsTable.farmId, farmId)).orderBy(asc(feedRationsTable.id));
  return evaluate(farmId, rows);
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export interface Warning {
  kind: 'toxic' | 'foreignMineral' | 'copper' | 'ionophore' | 'withdrawal';
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
  category: FeedCategory;
  values: FeedValues;
  forSpecies: string[] | null;
  botanicalName: string | null;
  additives: string[] | null;
}

type OwnFeed = Awaited<ReturnType<typeof listFarmFeeds>>[number];

function resolve(items: RationItemJson[], own: Map<number, OwnFeed>): ResolvedItem[] {
  return items.flatMap((i): ResolvedItem[] => {
    const catalog = i.feedKey ? feedByKey(i.feedKey) : undefined;
    const mine = i.feedId != null ? own.get(i.feedId) : undefined;
    if (catalog) return [{ ref: { feedKey: catalog.key, feedId: null }, name: catalog.name, grams: i.grams, category: catalog.category, values: catalog as FeedValues, forSpecies: catalog.forSpecies as string[] | null, botanicalName: catalog.botanicalName, additives: null }];
    if (mine) return [{ ref: { feedKey: null, feedId: mine.id }, name: mine.name, grams: i.grams, category: mine.category as FeedCategory, values: mine.values, forSpecies: mine.forSpecies, botanicalName: mine.botanicalName, additives: mine.additives }];
    return [];
  });
}

/** Feeds with a coccidiostat like Monensin – deadly for horses, meant for poultry only. */
function ionophoreWarnings(species: FarmSpecies, items: ResolvedItem[]): Warning[] {
  if (species === 'poultry') return [];
  return items.flatMap((r) => {
    const found = ionophoresIn(r.additives ?? []);
    if (found.length === 0) return [];
    const harm = species === 'horse' ? 'schon kleine Mengen sind für Pferde tödlich' : `nur für Geflügel bestimmt, für ${SPECIES_DE[species]} gefährlich`;
    return [{ kind: 'ionophore' as const, text: `${r.name} enthält ${found.join(', ')} (Kokzidiostatikum) – ${harm}.` }];
  });
}

/** A change of feed in progress (or about to start for the next season). */
export interface Transition {
  /** "change": the feeds of the ration were changed; "season": the next season's ration takes over. */
  reason: 'change' | 'season';
  /** Season whose ration takes over (reason "season"). */
  toSeason: Season | null;
  startedOn: string;
  endsOn: string;
  days: number;
  /** 1-based day of the change today; 0 = starts later (shown in advance). */
  day: number;
  newShare: number;
  phases: Phase[];
  /** Today's mixture per animal. */
  items: { name: string; grams: number }[];
}

function transitionOf(
  reason: Transition['reason'],
  toSeason: Season | null,
  startedOn: string,
  days: number,
  today: string,
  from: ResolvedItem[],
  to: ResolvedItem[],
): Transition | null {
  const index = daysBetween(startedOn, today);
  if (index >= days) return null;
  const share = index < 0 ? 0 : newShareOn(index, days);
  const same = (a: ResolvedItem, b: ResolvedItem) => a.ref.feedKey === b.ref.feedKey && a.ref.feedId === b.ref.feedId;
  const items = mix(
    from.map((r) => ({ key: r, grams: r.grams })),
    to.map((r) => ({ key: r, grams: r.grams })),
    share,
    same,
  ).map((m) => ({ name: m.key.name, grams: m.grams }));
  return { reason, toSeason, startedOn, endsOn: addDays(startedOn, days - 1), days, day: Math.max(0, index + 1), newShare: share, phases: phases(days), items };
}

export interface RationEvaluation {
  id: number;
  target: Omit<Target, 'animalIds'>;
  season: Season;
  /** The ration in effect today for its animal or group. */
  active: boolean;
  stage: LifeStage;
  items: { feedKey: string | null; feedId: number | null; name: string; grams: number }[];
  times: string[];
  waterL: number | null;
  need: { weightKg: number; dmIntakeKg: number; waterL: number } | null;
  values: ReturnType<typeof checkRation>['values'] | null;
  checks: NutrientCheck[];
  warnings: Warning[];
  transition: Transition | null;
  /** Fixed hints for the season (only on the ration in effect). */
  hints: string[];
  /** More feed for the cold of the next days (forecast at the farm; only on the ration in effect). */
  cold: ColdBoost | null;
  /** For the whole group per day: feed as fed (kg) and water (l). */
  group: { feedKg: number; waterL: number | null };
  updatedAt: string;
}

async function evaluate(farmId: number, rows: (typeof feedRationsTable.$inferSelect)[]): Promise<RationEvaluation[]> {
  const own = new Map((await listFarmFeeds(farmId)).map((f) => [f.id, f]));
  const all = await db.select().from(feedRationsTable).where(eq(feedRationsTable.farmId, farmId));
  const today = berlinDay();
  // The forecast at the farm, for the cold ahead (none without a location or when the service is down).
  const location = rows.length ? await farmLocation(farmId) : null;
  const days: DayForecast[] = location ? await forecast(location.latitude, location.longitude, today) : [];
  const out: RationEvaluation[] = [];
  for (const row of rows) {
    let target: Target;
    try {
      target = await targetOf(farmId, row.animalId, row.herdId);
    } catch {
      continue;
    }
    const siblings = all.filter((r) => (target.kind === 'animal' ? r.animalId === target.id : r.herdId === target.id));
    const seasons = siblings.map((r) => r.season as Season);
    const season = row.season as Season;
    const active = activeSeason(seasons, today) === season;
    const resolved = resolve(row.items, own);

    let transition: Transition | null = null;
    if (active && row.previousItems && row.changeStartedOn && row.changeDays) {
      transition = transitionOf('change', null, row.changeStartedOn, row.changeDays, today, resolve(row.previousItems, own), resolved);
    }
    if (active && !transition) {
      // Shown from the start of the change, which ends the day before the season does.
      const next = nextSeasonStart(today);
      const nextRow = siblings.find((r) => r.season === activeSeason(seasons, next.day));
      const days = transitionDays(target.species);
      if (nextRow && nextRow.id !== row.id && !sameFeeds(row.items, nextRow.items) && daysBetween(today, next.day) <= days) {
        transition = transitionOf('season', nextRow.season as Season, addDays(next.day, -days), days, today, resolved, resolve(nextRow.items, own));
      }
    }

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
      ...ionophoreWarnings(target.species, resolved),
      ...(result?.checks.filter((c) => c.nutrient === 'copper' && c.severe).map((c) => ({ kind: 'copper' as const, text: `Kupfer ${c.value} mg/kg Trockenmasse – über ${c.max} ist für Schafe giftig.` })) ?? []),
      ...(await withdrawals(farmId, target.animalIds, today)),
    ];
    const { animalIds: _ids, ...publicTarget } = target;
    out.push({
      id: row.id,
      target: publicTarget,
      season,
      active,
      stage,
      items: resolved.map((r) => ({ ...r.ref, name: r.name, grams: r.grams })),
      times: row.times,
      waterL: row.waterL,
      need: need ? { weightKg: need.weightKg, dmIntakeKg: need.dmIntakeKg, waterL: need.waterL } : null,
      values: result?.values ?? null,
      checks: result?.checks ?? [],
      warnings,
      transition,
      hints: active ? seasonHints(target.species, today, resolved.map((r) => r.category)) : [],
      cold: active ? coldBoost(target.species, resolved, days) : null,
      group: {
        feedKg: Math.round(resolved.reduce((s, r) => s + r.grams, 0) * target.count) / 1000,
        waterL: need ? Math.round(need.waterL * target.count * 10) / 10 : null,
      },
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return out;
}

// ── Reminders (Stall-Aufgaben) ───────────────────────────────────────────────

const TIME_OF: Record<(typeof FEED_TIMES)[number], string> = { morgens: '07:00', mittags: '12:00', abends: '18:00' };
const REMINDER_PREFIX = 'Futterplaner';

function gramsText(g: number): string {
  return g >= 1000 ? `${String(Math.round(g / 100) / 10).replace('.', ',')} kg` : `${Math.round(g)} g`;
}

/**
 * The note of a feeding task: what one animal gets per feeding – or, while a
 * change of feed runs, where to find today's amounts (they change every few days).
 */
export function reminderNote(items: { name: string; grams: number }[], feedings: number, changeEndsOn: string | null = null): string {
  if (changeEndsOn) return `${REMINDER_PREFIX}: Umstellung bis ${changeEndsOn.slice(8, 10)}.${changeEndsOn.slice(5, 7)}. – die Mengen für heute stehen im Futterplaner.`;
  const per = items.map((i) => `${i.name} ${gramsText(i.grams / feedings)}`).join(', ');
  const note = `${REMINDER_PREFIX} (je Tier und Fütterung): ${per}`;
  return note.length > 200 ? `${note.slice(0, 199)}…` : note;
}

/**
 * Daily "Füttern" stall tasks for the ration in effect, one per feeding time.
 * - "create" ("Erinnern"): makes the missing ones, switches the others back on;
 * - "save" (ration saved): refreshes the notes, pauses dropped feeding times;
 * - "refresh" (plan opened): only refreshes notes that changed, e.g. when the
 *   season's ration took over or a change of feed started or ended.
 * Reminders are never deleted here, and only "create" switches one on.
 */
async function syncReminders(farmId: number, ration: RationEvaluation, mode: 'create' | 'save' | 'refresh') {
  const create = mode === 'create';
  const target = ration.target.kind === 'animal' ? eq(farmTasksTable.animalId, ration.target.id) : eq(farmTasksTable.herdId, ration.target.id);
  const existing = await db
    .select({ id: farmTasksTable.id, reminderTime: farmTasksTable.reminderTime, notes: farmTasksTable.notes })
    .from(farmTasksTable)
    .where(and(eq(farmTasksTable.farmId, farmId), target, eq(farmTasksTable.actionType, 'Füttern'), like(farmTasksTable.notes, `${REMINDER_PREFIX}%`)));
  if (!create && existing.length === 0) return { created: 0, updated: 0, paused: 0 };
  const times = (ration.times.length ? ration.times : ['morgens']) as (typeof FEED_TIMES)[number][];
  // A change for the next season that has not started yet leaves the ration as it is.
  const changing = ration.transition && ration.transition.day > 0 ? ration.transition : null;
  const note = reminderNote(ration.items, times.length, changing?.endsOn ?? null);
  let created = 0;
  let updated = 0;
  for (const time of times) {
    const task = existing.find((t) => t.reminderTime === TIME_OF[time]);
    if (task) {
      if (mode === 'refresh' && task.notes === note) continue;
      await db
        .update(farmTasksTable)
        .set(create ? { notes: note, isActive: true } : { notes: note })
        .where(eq(farmTasksTable.id, task.id));
      updated++;
    } else if (create) {
      await createFarmTask(farmId, {
        actionType: 'Füttern',
        animalId: ration.target.kind === 'animal' ? ration.target.id : null,
        herdId: ration.target.kind === 'herd' ? ration.target.id : null,
        notes: note,
        intervalValue: 1,
        intervalUnit: 'Tage',
        reminderTime: TIME_OF[time],
      });
      created++;
    }
  }
  const dropped = mode === 'refresh' ? [] : existing.filter((t) => !times.some((time) => TIME_OF[time] === t.reminderTime));
  if (dropped.length) await db.update(farmTasksTable).set({ isActive: false }).where(inArray(farmTasksTable.id, dropped.map((t) => t.id)));
  return { created, updated, paused: dropped.length };
}

/** "Als Stall-Aufgabe erinnern": only for the ration in effect. */
export async function feedReminders(farmId: number, rationId: number) {
  const [row] = await db.select().from(feedRationsTable).where(and(eq(feedRationsTable.id, rationId), eq(feedRationsTable.farmId, farmId)));
  if (!row) throw notFound();
  const [ration] = await evaluate(farmId, [row]);
  if (!ration) throw notFound();
  if (!ration.active) throw new FarmDataError(409, 'Erinnerungen gibt es für die Ration, die gerade gilt.');
  return syncReminders(farmId, ration, 'create');
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
