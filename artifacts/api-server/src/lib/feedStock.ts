/**
 * Vorrat und Kosten (Futterplaner step 4, docs/futterplaner.md): how long the
 * feed on hand lasts with the current rations and when to buy more, what the
 * feeding costs per animal and month, and how much the winter needs (with the
 * storable vegetables handed to the Garten-Assistent). Fixed rules, no AI.
 *
 * A stock row holds the amount counted or bought on a day; what is left today
 * is that amount minus the daily use of the rations in effect since then.
 */

import { db, farmFeedsTable, feedStocksTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';

import { FarmDataError, notFound } from './farmAnimals';
import { feedByKey, type FeedCategory } from './feedCatalog';
import { evaluatedRations, type RationEvaluation } from './feedPlanner';
import { activeSeason, addDays, daysBetween, seasonOf, type Season } from './feedSeason';
import { berlinDay } from './monitoring';

/** Days before the stock runs out when "nachkaufen" is due. */
export const REORDER_LEAD_DAYS = 7;
/** Up to this many days left the stock shows as "bald leer". */
const SOON_DAYS = 14;
const DAYS_PER_MONTH = 30.4;

/** Feeds of the list that grow in the bed and keep for the winter → garden crop key. */
export const GARDEN_WINTER_FEEDS: Record<string, string> = { moehre: 'moehre', futterruebe: 'rote_bete', kuerbis: 'kuerbis' };

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface FeedRef {
  feedKey: string | null;
  feedId: number | null;
}

const refKey = (r: FeedRef) => (r.feedKey ? `k:${r.feedKey}` : `o:${r.feedId}`);

export interface FeedInfo extends FeedRef {
  name: string;
  category: FeedCategory;
}

export interface StockRow extends FeedRef {
  id: number;
  stockKg: number;
  countedOn: string;
  packageKg: number | null;
  pricePerKg: number | null;
}

/** The parts of an evaluated ration this needs. */
export type RationForStock = Pick<RationEvaluation, 'season' | 'active' | 'items'> & { target: Pick<RationEvaluation['target'], 'kind' | 'id' | 'name' | 'species' | 'count'> };

export type StockStatus = 'ok' | 'soon' | 'empty' | 'unused' | 'unknown';

export interface StockLine extends FeedInfo {
  id: number | null;
  /** Left today (kg); null = never counted. */
  stockKg: number | null;
  countedOn: string | null;
  packageKg: number | null;
  pricePerKg: number | null;
  /** Used per day by the rations in effect (kg). */
  dailyKg: number;
  daysLeft: number | null;
  emptyOn: string | null;
  reorderOn: string | null;
  status: StockStatus;
}

export interface CostLine {
  target: { kind: 'animal' | 'herd'; id: number; name: string; count: number };
  perAnimalMonth: number;
  perMonth: number;
  /** Feeds of the ration without a price – the costs are too low by them. */
  missingPrices: string[];
}

export interface WinterLine extends FeedInfo {
  neededKg: number;
  /** Expected on hand when the winter starts. */
  stockKg: number;
  missingKg: number;
  gardenCrop: string | null;
}

export interface StockOverview {
  stocks: StockLine[];
  costs: { lines: CostLine[]; perMonth: number; complete: boolean };
  winter: { from: string; to: string; days: number; lines: WinterLine[]; gardenKg: number };
}

/** The winter to plan for: the running one from today, else the next one. */
export function winterWindow(today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (seasonOf(today) === 'winter') return { from: today, to: `${month >= 11 ? year + 1 : year}-03-31` };
  return { from: `${year}-11-01`, to: `${year + 1}-03-31` };
}

const sameTarget = (a: RationForStock, b: RationForStock) => a.target.kind === b.target.kind && a.target.id === b.target.id;

/** kg per day of each feed for the rations in effect on `day`. */
function dailyUse(rations: RationForStock[], day: string, today: string): Map<string, number> {
  const use = new Map<string, number>();
  for (const r of rations) {
    const seasons = rations.filter((x) => sameTarget(x, r)).map((x) => x.season as Season);
    const inEffect = day === today ? r.active : activeSeason(seasons, day) === r.season;
    if (!inEffect) continue;
    for (const i of r.items) {
      const k = refKey(i);
      use.set(k, (use.get(k) ?? 0) + (i.grams / 1000) * r.target.count);
    }
  }
  return use;
}

/** Pure, so it can be tested as is. */
export function stockOverview(today: string, rations: RationForStock[], feeds: Map<string, FeedInfo>, rows: StockRow[]): StockOverview {
  const now = dailyUse(rations, today, today);
  const byRef = new Map(rows.map((r) => [refKey(r), r]));
  const leftToday = (k: string) => {
    const row = byRef.get(k);
    if (!row) return null;
    return Math.max(0, row.stockKg - (now.get(k) ?? 0) * Math.max(0, daysBetween(row.countedOn, today)));
  };

  // ── Stock ──
  const keys = [...new Set([...rows.map(refKey), ...now.keys()])].filter((k) => feeds.has(k));
  const stocks: StockLine[] = keys.map((k) => {
    const info = feeds.get(k)!;
    const row = byRef.get(k);
    const daily = now.get(k) ?? 0;
    const left = leftToday(k);
    const daysLeft = left !== null && daily > 0 ? Math.floor(left / daily) : null;
    const emptyOn = daysLeft !== null ? addDays(today, daysLeft) : null;
    const status: StockStatus = !row ? 'unknown' : daily === 0 ? 'unused' : left! <= 0 ? 'empty' : daysLeft! <= SOON_DAYS ? 'soon' : 'ok';
    return {
      ...info,
      id: row?.id ?? null,
      stockKg: left === null ? null : r1(left),
      countedOn: row?.countedOn ?? null,
      packageKg: row?.packageKg ?? null,
      pricePerKg: row?.pricePerKg ?? null,
      dailyKg: Math.round(daily * 1000) / 1000,
      daysLeft,
      emptyOn,
      reorderOn: emptyOn ? addDays(emptyOn, -REORDER_LEAD_DAYS) : null,
      status,
    };
  });
  const order: Record<StockStatus, number> = { empty: 0, soon: 1, unknown: 2, ok: 3, unused: 4 };
  stocks.sort((a, b) => order[a.status] - order[b.status] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) || a.name.localeCompare(b.name, 'de'));

  // ── Costs ──
  const lines: CostLine[] = rations
    .filter((r) => r.active)
    .map((r) => {
      let perDay = 0;
      const missing: string[] = [];
      for (const i of r.items) {
        const price = byRef.get(refKey(i))?.pricePerKg;
        if (price == null) missing.push(i.name);
        else perDay += (i.grams / 1000) * price;
      }
      const perAnimalMonth = r2(perDay * DAYS_PER_MONTH);
      return {
        target: { kind: r.target.kind, id: r.target.id, name: r.target.name, count: r.target.count },
        perAnimalMonth,
        perMonth: r2(perAnimalMonth * r.target.count),
        missingPrices: missing,
      };
    });

  // ── Winter ──
  const { from, to } = winterWindow(today);
  const days = daysBetween(from, to) + 1;
  const winter = dailyUse(rations, from, today);
  const untilWinter = Math.max(0, daysBetween(today, from));
  const winterLines: WinterLine[] = [...winter.entries()]
    .filter(([k]) => feeds.has(k))
    .map(([k, perDay]) => {
      const info = feeds.get(k)!;
      const neededKg = r1(perDay * days);
      const left = leftToday(k);
      const atStart = left === null ? 0 : Math.max(0, left - (now.get(k) ?? 0) * untilWinter);
      return {
        ...info,
        neededKg,
        stockKg: r1(atStart),
        missingKg: r1(Math.max(0, neededKg - atStart)),
        gardenCrop: info.feedKey ? (GARDEN_WINTER_FEEDS[info.feedKey] ?? null) : null,
      };
    })
    .sort((a, b) => b.neededKg - a.neededKg);

  return {
    stocks,
    costs: { lines, perMonth: r2(lines.reduce((s, l) => s + l.perMonth, 0)), complete: lines.every((l) => l.missingPrices.length === 0) },
    winter: { from, to, days, lines: winterLines, gardenKg: r1(winterLines.filter((l) => l.gardenCrop).reduce((s, l) => s + l.neededKg, 0)) },
  };
}

// ── Database ─────────────────────────────────────────────────────────────────

async function feedInfos(farmId: number, refs: FeedRef[]): Promise<Map<string, FeedInfo>> {
  const own = await db.select().from(farmFeedsTable).where(eq(farmFeedsTable.farmId, farmId));
  const out = new Map<string, FeedInfo>();
  for (const r of refs) {
    const catalog = r.feedKey ? feedByKey(r.feedKey) : undefined;
    const mine = r.feedId != null ? own.find((f) => f.id === r.feedId) : undefined;
    if (catalog) out.set(refKey(r), { feedKey: catalog.key, feedId: null, name: catalog.name, category: catalog.category });
    else if (mine) out.set(refKey(r), { feedKey: null, feedId: mine.id, name: mine.name, category: mine.category as FeedCategory });
  }
  return out;
}

async function stockRows(farmId: number): Promise<StockRow[]> {
  return db
    .select({
      id: feedStocksTable.id,
      feedKey: feedStocksTable.feedKey,
      feedId: feedStocksTable.feedId,
      stockKg: feedStocksTable.stockKg,
      countedOn: feedStocksTable.countedOn,
      packageKg: feedStocksTable.packageKg,
      pricePerKg: feedStocksTable.pricePerKg,
    })
    .from(feedStocksTable)
    .where(eq(feedStocksTable.farmId, farmId));
}

export async function feedStock(farmId: number): Promise<StockOverview> {
  const rations = await evaluatedRations(farmId);
  const rows = await stockRows(farmId);
  const feeds = await feedInfos(farmId, [...rows, ...rations.flatMap((r) => r.items)]);
  return stockOverview(berlinDay(), rations, feeds, rows);
}

/** Storable vegetables the animals need in the winter – for the Garten-Assistent. */
export async function winterGardenNeed(farmId: number): Promise<{ kg: number; crops: string[] } | null> {
  const overview = await feedStock(farmId);
  const lines = overview.winter.lines.filter((l) => l.gardenCrop);
  if (lines.length === 0) return null;
  return { kg: overview.winter.gardenKg, crops: [...new Set(lines.map((l) => l.gardenCrop!))] };
}

export interface StockInput {
  feedKey?: string | null;
  feedId?: number | null;
}

async function checkRef(farmId: number, input: StockInput): Promise<FeedRef> {
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

const refWhere = (farmId: number, ref: FeedRef) =>
  and(eq(feedStocksTable.farmId, farmId), ref.feedKey ? eq(feedStocksTable.feedKey, ref.feedKey) : eq(feedStocksTable.feedId, ref.feedId!));

function amount(value: unknown, max: number, message: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new FarmDataError(400, message);
  return Math.round(n * 100) / 100;
}

async function upsert(farmId: number, ref: FeedRef, values: { stockKg: number; packageKg?: number | null; pricePerKg?: number | null }) {
  const set = { ...values, countedOn: berlinDay(), updatedAt: new Date() };
  const [existing] = await db.select({ id: feedStocksTable.id }).from(feedStocksTable).where(refWhere(farmId, ref));
  if (existing) await db.update(feedStocksTable).set(set).where(eq(feedStocksTable.id, existing.id));
  else await db.insert(feedStocksTable).values({ farmId, ...ref, ...set });
  return feedStock(farmId);
}

/** "Bestand gezählt": what is on hand now; optionally sack size and price. */
export async function countStock(farmId: number, input: StockInput & { stockKg: number; packageKg?: number | null; pricePerPackage?: number | null }) {
  const ref = await checkRef(farmId, input);
  const stockKg = amount(input.stockKg, 100_000, 'Der Bestand liegt zwischen 0 und 100 000 kg.');
  const packageKg = input.packageKg == null ? undefined : amount(input.packageKg, 2_000, 'Die Packungsgröße liegt zwischen 0 und 2000 kg.') || null;
  const price = input.pricePerPackage == null ? undefined : amount(input.pricePerPackage, 100_000, 'Bitte prüfe den Preis.');
  const pricePerKg = price !== undefined && packageKg ? r2(price / packageKg) : undefined;
  return upsert(farmId, ref, { stockKg, ...(packageKg !== undefined && { packageKg }), ...(pricePerKg !== undefined && { pricePerKg }) });
}

/** "Gekauft": adds the packages to what is left today; the price per kg is updated. */
export async function buyFeed(farmId: number, input: StockInput & { packages: number; packageKg: number; pricePerPackage?: number | null }) {
  const ref = await checkRef(farmId, input);
  const packages = amount(input.packages, 1_000, 'Bitte 1 bis 1000 Packungen angeben.');
  const packageKg = amount(input.packageKg, 2_000, 'Die Packungsgröße liegt zwischen 0 und 2000 kg.');
  if (packages <= 0 || packageKg <= 0) throw new FarmDataError(400, 'Bitte Anzahl und Packungsgröße angeben.');
  const price = input.pricePerPackage == null ? null : amount(input.pricePerPackage, 100_000, 'Bitte prüfe den Preis.');
  const now = (await feedStock(farmId)).stocks.find((s) => refKey(s) === refKey(ref));
  return upsert(farmId, ref, {
    stockKg: r1((now?.stockKg ?? 0) + packages * packageKg),
    packageKg,
    ...(price !== null && { pricePerKg: r2(price / packageKg) }),
  });
}

export async function removeStock(farmId: number, stockId: number): Promise<void> {
  const deleted = await db
    .delete(feedStocksTable)
    .where(and(eq(feedStocksTable.id, stockId), eq(feedStocksTable.farmId, farmId)))
    .returning({ id: feedStocksTable.id });
  if (deleted.length === 0) throw notFound();
}
