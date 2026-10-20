/**
 * Grow: Strom- und Kostenrechner (docs/grow.md).
 *
 * Electricity is computed day by day from the plants' plans: the lamp burns as
 * long as the longest light phase of any plant that day (18 h growth, 12 h
 * bloom, 20 h for autoflowers; none while germinating, drying, curing), fans
 * run around the clock while a plant is in the tent. Costs the account enters
 * (equipment, soil, fertilizer …) are added; with a dry harvest the cost per
 * gram follows. Personal data – never part of the farm's "Ertrag & Bilanz",
 * which other farm members see.
 */

import { db, growCostsTable, growPlantsTable, growsTable } from '@workspace/db';
import { and, desc, eq } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { addDays } from './feedSeason';
import { phases, type Flowering, type GrowEnvironment, type GrowMedium, type PhaseKey, type PlantForPlan, type SeedSex, type StrainType } from './growPlan';
import { berlinDay } from './monitoring';

/** €/kWh when the account has not entered its tariff (German household average, 2026). */
export const DEFAULT_KWH_PRICE = 0.37;

export const COST_CATEGORIES = ['equipment', 'soil', 'fertilizer', 'seeds', 'water', 'other'] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

const LIT: PhaseKey[] = ['seedling', 'veg', 'flower', 'flush'];

/** Hours of lamp light a plant wants on a day in this phase (indoors). */
export function lampHours(phase: PhaseKey, flowering: Flowering): number {
  if (!LIT.includes(phase)) return 0;
  if (flowering === 'auto') return 20;
  return phase === 'flower' || phase === 'flush' ? 12 : 18;
}

export interface Energy {
  /** First and last day with light or fans (null without plants or devices). */
  from: string | null;
  to: string | null;
  lampHours: number;
  kwhLamp: number;
  kwhFans: number;
  kwh: number;
  /** Up to and including today. */
  kwhSoFar: number;
}

export function energy(
  grow: { environment: GrowEnvironment; medium: GrowMedium; lightWatts: number | null; fanWatts: number | null },
  plants: PlantForPlan[],
  today: string,
): Energy {
  const none: Energy = { from: null, to: null, lampHours: 0, kwhLamp: 0, kwhFans: 0, kwh: 0, kwhSoFar: 0 };
  if (grow.environment !== 'indoor' || plants.length === 0 || (!grow.lightWatts && !grow.fanWatts)) return none;
  const g = { environment: grow.environment, medium: grow.medium };
  const lists = plants.map((p) => ({ flowering: p.flowering, phases: phases(p, g).phases }));
  const start = plants.map((p) => p.startedOn).sort()[0]!;
  const end = lists.map((l) => l.phases.at(-1)!.to).sort().at(-1)!;
  let from: string | null = null;
  let to: string | null = null;
  let hours = 0;
  let fanHours = 0;
  let hoursSoFar = 0;
  let fanSoFar = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    let h = 0;
    let inTent = false;
    for (const l of lists) {
      const phase = l.phases.find((ph) => ph.from <= day && day <= ph.to)?.key ?? 'done';
      h = Math.max(h, lampHours(phase, l.flowering));
      if (LIT.includes(phase)) inTent = true;
    }
    if (!inTent) continue;
    from ??= day;
    to = day;
    hours += h;
    fanHours += 24;
    if (day <= today) {
      hoursSoFar += h;
      fanSoFar += 24;
    }
  }
  const lampW = grow.lightWatts ?? 0;
  const fanW = grow.fanWatts ?? 0;
  const kwhLamp = (lampW * hours) / 1000;
  const kwhFans = (fanW * fanHours) / 1000;
  return {
    from,
    to,
    lampHours: hours,
    kwhLamp: round1(kwhLamp),
    kwhFans: round1(kwhFans),
    kwh: round1(kwhLamp + kwhFans),
    kwhSoFar: round1((lampW * hoursSoFar + fanW * fanSoFar) / 1000),
  };
}

export interface CostSummary {
  electricityEur: number;
  electricitySoFarEur: number;
  itemsEur: number;
  byCategory: { category: CostCategory; eur: number }[];
  /** Planned for the whole grow: electricity to the end plus the entered costs. */
  totalEur: number;
  dryGrams: number;
  /** Only once there is a dry harvest: total so far per gram. */
  eurPerGram: number | null;
}

export function summarizeCosts(e: Energy, kwhPrice: number, items: { category: string; amount: number }[], dryGrams: number): CostSummary {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.category, (by.get(i.category) ?? 0) + i.amount);
  const byCategory = COST_CATEGORIES.filter((c) => by.has(c)).map((category) => ({ category, eur: round2(by.get(category)!) }));
  const itemsEur = round2(items.reduce((s, i) => s + i.amount, 0));
  const electricityEur = round2(e.kwh * kwhPrice);
  const electricitySoFarEur = round2(e.kwhSoFar * kwhPrice);
  return {
    electricityEur,
    electricitySoFarEur,
    itemsEur,
    byCategory,
    totalEur: round2(electricityEur + itemsEur),
    dryGrams: round1(dryGrams),
    eurPerGram: dryGrams > 0 ? round2((electricitySoFarEur + itemsEur) / dryGrams) : null,
  };
}

// ── Per grow ─────────────────────────────────────────────────────────────────

export interface GrowCost {
  id: number;
  date: string;
  category: CostCategory;
  item: string;
  amount: number;
}

export interface GrowCosts {
  kwhPrice: number;
  /** The account entered its own tariff. */
  ownPrice: boolean;
  lightWatts: number | null;
  fanWatts: number | null;
  energy: Energy;
  summary: CostSummary;
  items: GrowCost[];
}

async function ownGrow(userId: string, growId: number) {
  const [g] = await db.select().from(growsTable).where(and(eq(growsTable.id, growId), eq(growsTable.userId, userId)));
  if (!g) throw notFound();
  return g;
}

export async function growCosts(userId: string, growId: number, kwhPrice: number | null, today = berlinDay()): Promise<GrowCosts> {
  const grow = await ownGrow(userId, growId);
  const plants = await db.select().from(growPlantsTable).where(eq(growPlantsTable.growId, growId));
  const items = await db
    .select({ id: growCostsTable.id, date: growCostsTable.date, category: growCostsTable.category, item: growCostsTable.item, amount: growCostsTable.amount })
    .from(growCostsTable)
    .where(eq(growCostsTable.growId, growId))
    .orderBy(desc(growCostsTable.date), desc(growCostsTable.id));
  const plan: PlantForPlan[] = plants.map((p) => ({
    strainType: p.strainType as StrainType,
    flowering: p.flowering as Flowering,
    seedSex: p.seedSex as SeedSex,
    flowerWeeks: p.flowerWeeks,
    startedOn: p.startedOn,
    flipOn: p.flipOn,
    harvestedOn: p.harvestedOn,
  }));
  const e = energy(
    { environment: grow.environment as GrowEnvironment, medium: grow.medium as GrowMedium, lightWatts: grow.lightWatts, fanWatts: grow.fanWatts },
    plan,
    today,
  );
  const price = kwhPrice ?? DEFAULT_KWH_PRICE;
  const dryGrams = plants.reduce((s, p) => s + (p.dryGrams ?? 0), 0);
  return {
    kwhPrice: price,
    ownPrice: kwhPrice !== null,
    lightWatts: grow.lightWatts,
    fanWatts: grow.fanWatts,
    energy: e,
    summary: summarizeCosts(e, price, items, dryGrams),
    items: items.map((i) => ({ ...i, category: i.category as CostCategory })),
  };
}

export interface CostInput {
  date: unknown;
  category: string;
  item: unknown;
  amount: number;
}

export async function addCost(userId: string, growId: number, input: CostInput): Promise<void> {
  await ownGrow(userId, growId);
  if (!(COST_CATEGORIES as readonly string[]).includes(input.category)) throw new FarmDataError(400, 'Bitte wähle eine Kategorie.');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 100_000) throw new FarmDataError(400, 'Der Betrag liegt zwischen 0,01 und 100.000 €.');
  await db.insert(growCostsTable).values({
    growId,
    date: validDate(input.date, 'Datum'),
    category: input.category,
    item: text(input.item, 80, 'Die Bezeichnung', true),
    amount: round2(input.amount),
  });
}

export async function deleteCost(userId: string, costId: number): Promise<void> {
  const [row] = await db
    .select({ id: growCostsTable.id })
    .from(growCostsTable)
    .innerJoin(growsTable, eq(growsTable.id, growCostsTable.growId))
    .where(and(eq(growCostsTable.id, costId), eq(growsTable.userId, userId)));
  if (!row) throw notFound();
  await db.delete(growCostsTable).where(eq(growCostsTable.id, costId));
}
