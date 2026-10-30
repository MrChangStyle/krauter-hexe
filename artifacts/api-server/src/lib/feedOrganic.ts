/**
 * Bio im Futterplaner (docs/bio.md, step B3): where each feed comes from –
 * organic, conversion or conventional, from the farm (or region) or bought –
 * and the shares of a ration by dry matter against the organic rules.
 * Only organic farms are asked; everyone else sees the planner as before.
 *
 * All targets are Richtwerte after VO (EU) 2018/848, Anhang II Teil II, to be
 * checked by the advisor or the control body (docs/bio.md, "Offen").
 */

import { db, farmFeedsTable, feedOriginsTable, type FarmSpecies } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { FarmDataError } from './farmAnimals';
import { feedByKey, type FeedCategory } from './feedCatalog';
import type { FeedRef, StockInput } from './feedStock';

export const FEED_ORGANIC = ['organic', 'conversion', 'conventional'] as const;
export type FeedOrganic = (typeof FEED_ORGANIC)[number];

export interface FeedOrigin extends FeedRef {
  organic: FeedOrganic;
  ownFarm: boolean;
}

/** Herbivores: at least 70 % from the farm or region, at least 60 % roughage (Richtwerte). */
export const HERBIVORES: readonly FarmSpecies[] = ['cattle', 'sheep', 'goat', 'horse', 'donkey', 'alpaca'];
/** Pigs and poultry: at least 30 % from the farm or region (Richtwert). */
export const PIGS_AND_POULTRY: readonly FarmSpecies[] = ['pig', 'poultry', 'goose', 'duck', 'turkey', 'quail', 'rhea'];

export const ORGANIC_RULES = {
  /** Organic plus conversion feed: all of it. */
  organicMin: 100,
  /** Conversion feed bought from other farms. */
  conversionBoughtMax: 25,
  ownFarmHerbivores: 70,
  ownFarmPigsPoultry: 30,
  roughageHerbivores: 60,
} as const;

export interface OrganicCheck {
  key: 'organic' | 'conversion' | 'ownFarm' | 'roughage';
  /** Share of the dry matter, %. */
  value: number;
  /** The Richtwert, %. */
  target: number;
  /** "min" – at least; "max" – at most. */
  bound: 'min' | 'max';
  ok: boolean;
}

export interface OrganicShares {
  checks: OrganicCheck[];
  /** Feeds of the ration without a stated origin – they count as conventional. */
  missing: string[];
}

export interface OrganicItem {
  ref: FeedRef;
  name: string;
  grams: number;
  category: FeedCategory;
  /** % dry matter of the feed as fed. */
  dryMatter: number;
}

const key = (r: FeedRef) => (r.feedKey ? `k:${r.feedKey}` : `o:${r.feedId}`);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/**
 * The shares of one ration by dry matter. Fresh fodder and roughage count as
 * roughage. Feeds without an origin count as conventional and bought.
 */
export function organicShares(species: FarmSpecies, items: readonly OrganicItem[], origins: readonly FeedOrigin[]): OrganicShares {
  const byRef = new Map(origins.map((o) => [key(o), o]));
  let total = 0;
  let organic = 0;
  let conversionBought = 0;
  let own = 0;
  let roughage = 0;
  const missing: string[] = [];
  for (const i of items) {
    const dm = (i.grams * i.dryMatter) / 100;
    if (dm <= 0) continue;
    total += dm;
    const o = byRef.get(key(i.ref));
    if (!o) missing.push(i.name);
    if (o && o.organic !== 'conventional') organic += dm;
    if (o?.organic === 'conversion' && !o.ownFarm) conversionBought += dm;
    if (o?.ownFarm) own += dm;
    if (i.category === 'roughage' || i.category === 'fresh') roughage += dm;
  }
  const checks: OrganicCheck[] = [];
  const min = (k: OrganicCheck['key'], value: number, target: number) => checks.push({ key: k, value, target, bound: 'min', ok: value >= target });
  min('organic', pct(organic, total), ORGANIC_RULES.organicMin);
  const conv = pct(conversionBought, total);
  checks.push({ key: 'conversion', value: conv, target: ORGANIC_RULES.conversionBoughtMax, bound: 'max', ok: conv <= ORGANIC_RULES.conversionBoughtMax });
  if (HERBIVORES.includes(species)) min('ownFarm', pct(own, total), ORGANIC_RULES.ownFarmHerbivores);
  else if (PIGS_AND_POULTRY.includes(species)) min('ownFarm', pct(own, total), ORGANIC_RULES.ownFarmPigsPoultry);
  if (HERBIVORES.includes(species)) min('roughage', pct(roughage, total), ORGANIC_RULES.roughageHerbivores);
  return { checks, missing };
}

// ── Stored origins ───────────────────────────────────────────────────────────

/** A catalog feed or one of the farm's own feeds (shared with the Vorrat). */
export async function checkRef(farmId: number, input: StockInput): Promise<FeedRef> {
  if (input.feedKey) {
    if (!feedByKey(input.feedKey)) throw new FarmDataError(400, 'Dieses Futtermittel gibt es nicht.');
    return { feedKey: input.feedKey, feedId: null };
  }
  if (input.feedId != null) {
    const [own] = await db
      .select({ id: farmFeedsTable.id })
      .from(farmFeedsTable)
      .where(and(eq(farmFeedsTable.id, input.feedId), eq(farmFeedsTable.farmId, farmId)));
    if (!own) throw new FarmDataError(400, 'Dieses Futtermittel gibt es nicht.');
    return { feedKey: null, feedId: own.id };
  }
  throw new FarmDataError(400, 'Bitte wähle ein Futtermittel.');
}


export async function listFeedOrigins(farmId: number): Promise<FeedOrigin[]> {
  const rows = await db
    .select({ feedKey: feedOriginsTable.feedKey, feedId: feedOriginsTable.feedId, organic: feedOriginsTable.organic, ownFarm: feedOriginsTable.ownFarm })
    .from(feedOriginsTable)
    .where(eq(feedOriginsTable.farmId, farmId));
  return rows.map((r) => ({ ...r, organic: (FEED_ORGANIC as readonly string[]).includes(r.organic) ? (r.organic as FeedOrganic) : 'conventional' }));
}

/** Sets the origin of one feed; organic = null removes it. */
export async function setFeedOrigin(farmId: number, input: StockInput & { organic: unknown; ownFarm?: unknown }): Promise<FeedOrigin[]> {
  const ref = await checkRef(farmId, input);
  const where = and(eq(feedOriginsTable.farmId, farmId), ref.feedKey ? eq(feedOriginsTable.feedKey, ref.feedKey) : eq(feedOriginsTable.feedId, ref.feedId!));
  if (input.organic === null) {
    await db.delete(feedOriginsTable).where(where);
    return listFeedOrigins(farmId);
  }
  if (typeof input.organic !== 'string' || !(FEED_ORGANIC as readonly string[]).includes(input.organic)) {
    throw new FarmDataError(400, 'Bitte wähle bio, Umstellung oder konventionell.');
  }
  const values = { organic: input.organic, ownFarm: input.ownFarm === true, updatedAt: new Date() };
  const [existing] = await db.select({ id: feedOriginsTable.id }).from(feedOriginsTable).where(where);
  if (existing) await db.update(feedOriginsTable).set(values).where(eq(feedOriginsTable.id, existing.id));
  else await db.insert(feedOriginsTable).values({ farmId, ...ref, ...values });
  return listFeedOrigins(farmId);
}
