/**
 * Ertrag & Bilanz ("Meine Farm"): what the animals gave (eggs, milk, meat,
 * wool – entered here) and the garden brought (harvest_logs, entered on the
 * beds), per year and month, and what it is worth at shop prices. The farm
 * can set its own prices. Against it: the feed costs the Futterplaner
 * estimates from today's rations. Fixed rules, no AI (docs/ertrag.md).
 */

import {
  db,
  EXPENSE_CATEGORIES,
  farmAnimalsTable,
  farmExpensesTable,
  farmSalesTable,
  farmPricesTable,
  farmYieldsTable,
  harvestLogsTable,
  herdsTable,
  FARM_PRODUCTS,
  type ExpenseCategory,
  type FarmProduct,
} from '@workspace/db';
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { feedStock } from './feedStock';
import { addDays } from './feedSeason';
import { cropByKey } from './gardenCatalog';
import { LAYING_AGE_DAYS } from './layingHistory';
import { logger } from './logger';
import { berlinDay } from './monitoring';

export const PRODUCT_UNITS: Record<FarmProduct, { unit: string; label: string }> = {
  eggs: { unit: 'Stück', label: 'Eier' },
  milk: { unit: 'l', label: 'Milch' },
  meat: { unit: 'kg', label: 'Fleisch' },
  wool: { unit: 'kg', label: 'Wolle' },
  honey: { unit: 'kg', label: 'Honig' },
};

/** Shop prices in € per unit (organic or farm-gate level, Germany) – a start the farm can change. */
export const DEFAULT_PRICES: Record<string, number> = {
  'product:eggs': 0.4,
  'product:milk': 1.5,
  'product:meat': 14,
  'product:wool': 2,
  // Honey from the beekeeper, about 6–7 € per 500 g jar.
  'product:honey': 13,
  // Garden harvest used as fodder: what bought fodder vegetables would cost.
  fodder: 0.3,
  'crop:tomate': 4,
  'crop:paprika': 5,
  'crop:chili': 15,
  'crop:aubergine': 4,
  'crop:kartoffel': 1.5,
  'crop:gurke': 2.5,
  'crop:zucchini': 2.5,
  'crop:kuerbis': 2,
  'crop:buschbohne': 6,
  'crop:stangenbohne': 6,
  'crop:erbse': 8,
  'crop:moehre': 1.5,
  'crop:pastinake': 4,
  'crop:petersilie': 15,
  'crop:sellerie': 2.5,
  'crop:fenchel': 4,
  'crop:dill': 20,
  'crop:koriander': 20,
  'crop:kohlrabi': 3,
  'crop:brokkoli': 4,
  'crop:blumenkohl': 3,
  'crop:weisskohl': 1.5,
  'crop:gruenkohl': 5,
  'crop:radieschen': 4,
  'crop:rettich': 3,
  'crop:rucola': 15,
  'crop:spinat': 6,
  'crop:mangold': 5,
  'crop:rote_bete': 2,
  'crop:salat': 4,
  'crop:ringelblume': 0,
  'crop:tagetes': 0,
  'crop:feldsalat': 15,
  'crop:mais': 3,
  'crop:zwiebel': 1.5,
  'crop:lauch': 3,
  'crop:knoblauch': 8,
  'crop:schnittlauch': 20,
  'crop:basilikum': 25,
  'crop:thymian': 30,
  'crop:salbei': 30,
  'crop:rosmarin': 30,
  'crop:oregano': 30,
  'crop:minze': 25,
  'crop:bohnenkraut': 30,
  'crop:kapuzinerkresse': 20,
  'crop:borretsch': 15,
  'crop:erdbeere': 8,
  'crop:rhabarber': 4,
};
/** A crop without a price of its own (not in the catalog, or written in). */
export const OTHER_CROP_PRICE = 3;

export function defaultPrice(key: string): number {
  return DEFAULT_PRICES[key] ?? OTHER_CROP_PRICE;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Summary (pure) ────────────────────────────────────────────────────────────

export interface HarvestRow {
  cropKey: string | null;
  label: string;
  harvestedOn: string;
  amountKg: number;
  use: 'kitchen' | 'fodder';
}

export interface YieldRow {
  product: FarmProduct;
  date: string;
  amount: number;
}

export interface YieldSummary {
  year: number;
  garden: {
    kg: number;
    value: number;
    lines: { key: string; name: string; kitchenKg: number; fodderKg: number; pricePerKg: number; value: number }[];
  };
  animals: { value: number; lines: { product: FarmProduct; unit: string; amount: number; price: number; value: number }[] };
  months: { month: number; garden: number; animals: number }[];
  total: number;
}

export function summarize(year: number, harvests: HarvestRow[], yields: YieldRow[], price: (key: string) => number): YieldSummary {
  const months = Array.from({ length: 12 }, (_, k) => ({ month: k + 1, garden: 0, animals: 0 }));
  const garden = new Map<string, { key: string; name: string; kitchenKg: number; fodderKg: number; pricePerKg: number; value: number }>();
  for (const h of harvests) {
    const key = h.cropKey ?? `label:${h.label}`;
    const line = garden.get(key) ?? {
      key,
      name: (h.cropKey && cropByKey(h.cropKey)?.name) || h.label,
      kitchenKg: 0,
      fodderKg: 0,
      pricePerKg: price(h.cropKey ? `crop:${h.cropKey}` : 'crop:other'),
      value: 0,
    };
    const value = h.amountKg * (h.use === 'fodder' ? price('fodder') : line.pricePerKg);
    if (h.use === 'fodder') line.fodderKg += h.amountKg;
    else line.kitchenKg += h.amountKg;
    line.value += value;
    garden.set(key, line);
    months[Number(h.harvestedOn.slice(5, 7)) - 1]!.garden += value;
  }
  const animals = new Map<FarmProduct, { product: FarmProduct; unit: string; amount: number; price: number; value: number }>();
  for (const y of yields) {
    const line = animals.get(y.product) ?? { product: y.product, unit: PRODUCT_UNITS[y.product].unit, amount: 0, price: price(`product:${y.product}`), value: 0 };
    line.amount += y.amount;
    line.value += y.amount * line.price;
    animals.set(y.product, line);
    months[Number(y.date.slice(5, 7)) - 1]!.animals += y.amount * line.price;
  }
  const gardenLines = [...garden.values()].map((l) => ({ ...l, kitchenKg: round2(l.kitchenKg), fodderKg: round2(l.fodderKg), value: round2(l.value) })).sort((a, b) => b.value - a.value);
  const animalLines = FARM_PRODUCTS.filter((p) => animals.has(p)).map((p) => {
    const l = animals.get(p)!;
    return { ...l, amount: round2(l.amount), value: round2(l.value) };
  });
  const gardenValue = round2(gardenLines.reduce((s, l) => s + l.value, 0));
  const animalValue = round2(animalLines.reduce((s, l) => s + l.value, 0));
  return {
    year,
    garden: { kg: round2(gardenLines.reduce((s, l) => s + l.kitchenKg + l.fodderKg, 0)), value: gardenValue, lines: gardenLines },
    animals: { value: animalValue, lines: animalLines },
    months: months.map((m) => ({ month: m.month, garden: round2(m.garden), animals: round2(m.animals) })),
    total: round2(gardenValue + animalValue),
  };
}

export interface ExpenseSummary {
  total: number;
  lines: { category: ExpenseCategory; eur: number }[];
  months: number[];
}

/** Expenses per category (in the fixed order) and month. */
export function summarizeExpenses(rows: { category: string; date: string; amountEur: number }[]): ExpenseSummary {
  const byCategory = new Map<string, number>();
  const months = Array.from({ length: 12 }, () => 0);
  for (const r of rows) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amountEur);
    months[Number(r.date.slice(5, 7)) - 1]! += r.amountEur;
  }
  const lines = EXPENSE_CATEGORIES.filter((c) => byCategory.has(c)).map((category) => ({ category, eur: round2(byCategory.get(category)!) }));
  return { total: round2(lines.reduce((s, l) => s + l.eur, 0)), lines, months: months.map(round2) };
}

export interface SalesSummary {
  /** What the sales brought in. */
  revenue: number;
  /** Shop value of what was sold (only sales of the farm's own yields with an amount). */
  soldValue: number;
  lines: { key: string; label: string; amount: number | null; unit: string | null; revenue: number }[];
}

/** The unit of a sold yield: Stück/l/kg for products, kg for crops. */
export function saleUnit(product: string | null): string | null {
  if (!product) return null;
  if (product.startsWith('crop:')) return 'kg';
  return PRODUCT_UNITS[product.slice('product:'.length) as FarmProduct]?.unit ?? null;
}

/** Sales per product (or written-in label), and the shop value of what left the self-supply. */
export function summarizeSales(rows: { product: string | null; label: string; amount: number | null; revenueEur: number }[], price: (key: string) => number): SalesSummary {
  const lines = new Map<string, { key: string; label: string; amount: number | null; unit: string | null; revenue: number }>();
  let soldValue = 0;
  for (const r of rows) {
    const key = r.product ?? `label:${r.label}`;
    const line = lines.get(key) ?? { key, label: r.label, amount: null, unit: saleUnit(r.product), revenue: 0 };
    line.revenue += r.revenueEur;
    if (r.amount !== null) line.amount = (line.amount ?? 0) + r.amount;
    if (r.product && r.amount !== null) soldValue += r.amount * price(r.product);
    lines.set(key, line);
  }
  const out = [...lines.values()].map((l) => ({ ...l, amount: l.amount === null ? null : round2(l.amount), revenue: round2(l.revenue) })).sort((a, b) => b.revenue - a.revenue);
  return { revenue: round2(out.reduce((s, l) => s + l.revenue, 0)), soldValue: round2(soldValue), lines: out };
}

/** Eggs per hen and day over the last 30 days (laying rate). */
export function layingRate(eggs: number, hens: number, days = 30): number | null {
  return hens > 0 ? Math.round((eggs / (hens * days)) * 100) / 100 : null;
}

// ── Database ──────────────────────────────────────────────────────────────────

export async function priceOf(farmId: number): Promise<(key: string) => number> {
  const rows = await db.select({ key: farmPricesTable.key, eur: farmPricesTable.eur }).from(farmPricesTable).where(eq(farmPricesTable.farmId, farmId));
  const own = new Map(rows.map((r) => [r.key, r.eur]));
  return (key) => own.get(key) ?? defaultPrice(key);
}

export interface YieldEntry {
  id: number;
  product: FarmProduct;
  date: string;
  amount: number;
  unit: string;
  herdId: number | null;
  herdName: string | null;
  animalId: number | null;
  animalName: string | null;
  note: string | null;
}

export interface ExpenseEntry {
  id: number;
  date: string;
  category: ExpenseCategory;
  amountEur: number;
  note: string | null;
}

export interface SaleEntry {
  id: number;
  date: string;
  product: string | null;
  label: string;
  amount: number | null;
  unit: string | null;
  revenueEur: number;
  note: string | null;
}

export interface YieldOverview {
  entries: YieldEntry[];
  summary: YieldSummary;
  previousTotal: number;
  expenses: ExpenseSummary & { entries: ExpenseEntry[] };
  sales: SalesSummary & { entries: SaleEntry[] };
  /** Shop value of what the farm kept for itself: all yields minus what was sold. */
  selfSupply: number;
  /** Self-supply + sales − expenses. */
  balance: number;
  /** This year only: eggs per hen and day over the last 30 days. */
  laying: { hens: number; eggs: number; perHenDay: number } | null;
  /** This year only: feed costs per month from today's rations (Futterplaner). */
  feedCost: { perMonth: number; complete: boolean } | null;
}

async function yearData(farmId: number, year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [harvests, yields] = await Promise.all([
    db
      .select({ cropKey: harvestLogsTable.cropKey, label: harvestLogsTable.label, harvestedOn: harvestLogsTable.harvestedOn, amountKg: harvestLogsTable.amountKg, use: harvestLogsTable.use })
      .from(harvestLogsTable)
      .where(and(eq(harvestLogsTable.farmId, farmId), gte(harvestLogsTable.harvestedOn, from), lte(harvestLogsTable.harvestedOn, to))),
    db
      .select({ product: farmYieldsTable.product, date: farmYieldsTable.date, amount: farmYieldsTable.amount })
      .from(farmYieldsTable)
      .where(and(eq(farmYieldsTable.farmId, farmId), gte(farmYieldsTable.date, from), lte(farmYieldsTable.date, to))),
  ]);
  return { harvests, yields: yields as YieldRow[] };
}

export function validYear(raw: unknown, today: string): number {
  const year = raw === undefined ? Number(today.slice(0, 4)) : Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > Number(today.slice(0, 4))) throw new FarmDataError(400, 'Dieses Jahr gibt es nicht.');
  return year;
}

export async function yieldOverview(farmId: number, rawYear?: unknown, today = berlinDay()): Promise<YieldOverview> {
  const year = validYear(rawYear, today);
  const price = await priceOf(farmId);
  const [current, previous, expenseRows, saleRows, entries] = await Promise.all([
    yearData(farmId, year),
    yearData(farmId, year - 1),
    db
      .select({ id: farmExpensesTable.id, date: farmExpensesTable.date, category: farmExpensesTable.category, amountEur: farmExpensesTable.amountEur, note: farmExpensesTable.note })
      .from(farmExpensesTable)
      .where(and(eq(farmExpensesTable.farmId, farmId), gte(farmExpensesTable.date, `${year}-01-01`), lte(farmExpensesTable.date, `${year}-12-31`)))
      .orderBy(desc(farmExpensesTable.date), desc(farmExpensesTable.id)),
    db
      .select({
        id: farmSalesTable.id,
        date: farmSalesTable.date,
        product: farmSalesTable.product,
        label: farmSalesTable.label,
        amount: farmSalesTable.amount,
        revenueEur: farmSalesTable.revenueEur,
        note: farmSalesTable.note,
      })
      .from(farmSalesTable)
      .where(and(eq(farmSalesTable.farmId, farmId), gte(farmSalesTable.date, `${year}-01-01`), lte(farmSalesTable.date, `${year}-12-31`)))
      .orderBy(desc(farmSalesTable.date), desc(farmSalesTable.id)),
    db
      .select({
        id: farmYieldsTable.id,
        product: farmYieldsTable.product,
        date: farmYieldsTable.date,
        amount: farmYieldsTable.amount,
        herdId: farmYieldsTable.herdId,
        herdName: herdsTable.name,
        animalId: farmYieldsTable.animalId,
        animalName: farmAnimalsTable.name,
        note: farmYieldsTable.note,
      })
      .from(farmYieldsTable)
      .leftJoin(herdsTable, and(eq(herdsTable.id, farmYieldsTable.herdId), eq(herdsTable.farmId, farmYieldsTable.farmId)))
      .leftJoin(farmAnimalsTable, and(eq(farmAnimalsTable.id, farmYieldsTable.animalId), eq(farmAnimalsTable.farmId, farmYieldsTable.farmId)))
      .where(and(eq(farmYieldsTable.farmId, farmId), gte(farmYieldsTable.date, `${year}-01-01`), lte(farmYieldsTable.date, `${year}-12-31`)))
      .orderBy(desc(farmYieldsTable.date), desc(farmYieldsTable.id)),
  ]);
  const thisYear = year === Number(today.slice(0, 4));
  let laying: YieldOverview['laying'] = null;
  let feedCost: YieldOverview['feedCost'] = null;
  if (thisYear) {
    const since = addDays(today, -29);
    const [[hens], [eggs]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(farmAnimalsTable)
        .where(and(eq(farmAnimalsTable.farmId, farmId), eq(farmAnimalsTable.species, 'poultry'), isNull(farmAnimalsTable.archivedAt), or(eq(farmAnimalsTable.sex, 'female'), eq(farmAnimalsTable.sex, 'unknown')), or(isNull(farmAnimalsTable.birthDate), lte(farmAnimalsTable.birthDate, addDays(today, -LAYING_AGE_DAYS))))),
      db
        .select({ n: sql<number>`coalesce(sum(${farmYieldsTable.amount}), 0)::float` })
        .from(farmYieldsTable)
        .where(and(eq(farmYieldsTable.farmId, farmId), eq(farmYieldsTable.product, 'eggs'), gte(farmYieldsTable.date, since), lte(farmYieldsTable.date, today))),
    ]);
    const rate = layingRate(eggs!.n, hens!.n);
    if (rate !== null && eggs!.n > 0) laying = { hens: hens!.n, eggs: eggs!.n, perHenDay: rate };
    try {
      const costs = (await feedStock(farmId)).costs;
      if (costs.lines.length > 0) feedCost = { perMonth: costs.perMonth, complete: costs.complete };
    } catch (err) {
      logger.warn({ err, farmId }, 'Feed costs for the yield overview failed');
    }
  }
  const summary = summarize(year, current.harvests, current.yields, price);
  const expenses = summarizeExpenses(expenseRows);
  const sales = summarizeSales(saleRows, price);
  const selfSupply = round2(Math.max(0, summary.total - sales.soldValue));
  return {
    entries: entries.map((e) => ({ ...e, product: e.product as FarmProduct, unit: PRODUCT_UNITS[e.product as FarmProduct].unit })),
    summary,
    previousTotal: summarize(year - 1, previous.harvests, previous.yields, price).total,
    expenses: { ...expenses, entries: expenseRows.map((e) => ({ ...e, category: e.category as ExpenseCategory })) },
    sales: { ...sales, entries: saleRows.map((e) => ({ ...e, unit: saleUnit(e.product) })) },
    selfSupply,
    balance: round2(selfSupply + sales.revenue - expenses.total),
    laying,
    feedCost,
  };
}

export interface YieldInput {
  product: FarmProduct;
  date: unknown;
  amount: number;
  herdId?: number | null;
  animalId?: number | null;
  clientId?: string | null;
  note?: unknown;
}

export async function addYield(farmId: number, input: YieldInput): Promise<void> {
  if (!(FARM_PRODUCTS as readonly string[]).includes(input.product)) throw new FarmDataError(400, 'Dieses Produkt gibt es nicht.');
  const date = validDate(input.date, 'Datum');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000) throw new FarmDataError(400, 'Die Menge ist ungültig.');
  const herdId = input.herdId ?? null;
  if (herdId !== null) {
    const [herd] = await db.select({ id: herdsTable.id }).from(herdsTable).where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)));
    if (!herd) throw new FarmDataError(400, 'Diese Gruppe gibt es auf der Farm nicht.');
  }
  // A hen only for eggs (Legeleistung je Henne, docs/legeleistung.md).
  const animalId = input.product === 'eggs' ? (input.animalId ?? null) : null;
  if (animalId !== null) {
    const [hen] = await db
      .select({ id: farmAnimalsTable.id })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId), eq(farmAnimalsTable.species, 'poultry')));
    if (!hen) throw new FarmDataError(400, 'Diese Henne gibt es auf der Farm nicht.');
  }
  const clientId = input.clientId ?? null;
  if (clientId !== null && !/^[A-Za-z0-9-]{8,64}$/.test(clientId)) throw new FarmDataError(400, 'Ungültige Kennung.');
  // The same tap sent twice (offline queue, docs/stall.md) is stored once.
  await db
    .insert(farmYieldsTable)
    .values({ farmId, product: input.product, date, amount: input.amount, herdId, animalId, clientId, note: text(input.note, 500, 'Die Notiz') })
    .onConflictDoNothing({ target: [farmYieldsTable.farmId, farmYieldsTable.clientId], where: sql`${farmYieldsTable.clientId} IS NOT NULL` });
}

/** Eggs entered today ("Am Stall"). */
export async function eggsToday(farmId: number, today = berlinDay()): Promise<{ date: string; eggs: number }> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${farmYieldsTable.amount}), 0)::float` })
    .from(farmYieldsTable)
    .where(and(eq(farmYieldsTable.farmId, farmId), eq(farmYieldsTable.product, 'eggs'), eq(farmYieldsTable.date, today)));
  return { date: today, eggs: row!.n };
}

export async function removeYield(farmId: number, id: number): Promise<void> {
  const deleted = await db
    .delete(farmYieldsTable)
    .where(and(eq(farmYieldsTable.id, id), eq(farmYieldsTable.farmId, farmId)))
    .returning({ id: farmYieldsTable.id });
  if (deleted.length === 0) throw notFound();
}

export interface ExpenseInput {
  date: unknown;
  category: ExpenseCategory;
  amountEur: number;
  note?: unknown;
}

export async function addExpense(farmId: number, input: ExpenseInput): Promise<void> {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) throw new FarmDataError(400, 'Diese Art von Ausgabe gibt es nicht.');
  const date = validDate(input.date, 'Datum');
  if (!Number.isFinite(input.amountEur) || input.amountEur <= 0 || input.amountEur > 100_000) throw new FarmDataError(400, 'Der Betrag ist ungültig.');
  await db.insert(farmExpensesTable).values({ farmId, date, category: input.category, amountEur: round2(input.amountEur), note: text(input.note, 500, 'Die Notiz') });
}

export async function removeExpense(farmId: number, id: number): Promise<void> {
  const deleted = await db
    .delete(farmExpensesTable)
    .where(and(eq(farmExpensesTable.id, id), eq(farmExpensesTable.farmId, farmId)))
    .returning({ id: farmExpensesTable.id });
  if (deleted.length === 0) throw notFound();
}

const SALE_PRODUCT = /^(product:(eggs|milk|meat|wool|honey)|crop:[a-z_]{1,40})$/;

export interface SaleInput {
  date: unknown;
  product?: string | null;
  label?: unknown;
  amount?: number | null;
  revenueEur: number;
  note?: unknown;
}

export async function addSale(farmId: number, input: SaleInput): Promise<void> {
  const date = validDate(input.date, 'Datum');
  const product = input.product ?? null;
  if (product !== null && (!SALE_PRODUCT.test(product) || (product.startsWith('crop:') && !cropByKey(product.slice(5))))) {
    throw new FarmDataError(400, 'Dieses Produkt gibt es nicht.');
  }
  const named = product === null ? null : product.startsWith('crop:') ? cropByKey(product.slice(5))!.name : PRODUCT_UNITS[product.slice(8) as FarmProduct].label;
  const label = text(input.label, 60, 'Die Bezeichnung') ?? named;
  if (!label) throw new FarmDataError(400, 'Bitte gib an, was verkauft wurde.');
  const amount = input.amount ?? null;
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 100_000)) throw new FarmDataError(400, 'Die Menge ist ungültig.');
  if (!Number.isFinite(input.revenueEur) || input.revenueEur <= 0 || input.revenueEur > 100_000) throw new FarmDataError(400, 'Der Erlös ist ungültig.');
  await db.insert(farmSalesTable).values({ farmId, date, product, label, amount, revenueEur: round2(input.revenueEur), note: text(input.note, 500, 'Die Notiz') });
}

export async function removeSale(farmId: number, id: number): Promise<void> {
  const deleted = await db
    .delete(farmSalesTable)
    .where(and(eq(farmSalesTable.id, id), eq(farmSalesTable.farmId, farmId)))
    .returning({ id: farmSalesTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── Prices ────────────────────────────────────────────────────────────────────

export interface PriceItem {
  key: string;
  label: string;
  unit: string;
  eur: number;
  own: boolean;
}

/** The products, fodder and every crop the farm has harvested, with their price. */
export async function priceList(farmId: number): Promise<PriceItem[]> {
  const [own, crops] = await Promise.all([
    db.select({ key: farmPricesTable.key, eur: farmPricesTable.eur }).from(farmPricesTable).where(eq(farmPricesTable.farmId, farmId)),
    db
      .selectDistinct({ cropKey: harvestLogsTable.cropKey })
      .from(harvestLogsTable)
      .where(eq(harvestLogsTable.farmId, farmId))
      .orderBy(asc(harvestLogsTable.cropKey)),
  ]);
  const ownMap = new Map(own.map((o) => [o.key, o.eur]));
  const item = (key: string, label: string, unit: string): PriceItem => ({ key, label, unit, eur: ownMap.get(key) ?? defaultPrice(key), own: ownMap.has(key) });
  const cropItems = crops
    .flatMap((c) => (c.cropKey ? [item(`crop:${c.cropKey}`, cropByKey(c.cropKey)?.name ?? c.cropKey, 'kg')] : []))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return [
    ...FARM_PRODUCTS.map((p) => item(`product:${p}`, PRODUCT_UNITS[p].label, PRODUCT_UNITS[p].unit)),
    item('fodder', 'Ernte als Futter', 'kg'),
    ...(crops.some((c) => c.cropKey === null) ? [item('crop:other', 'Andere Ernte', 'kg')] : []),
    ...cropItems,
  ];
}

const PRICE_KEY = /^(product:(eggs|milk|meat|wool|honey)|fodder|crop:[a-z_]{1,40})$/;

/** Set a price, or go back to the default with null. */
export async function setPrice(farmId: number, key: string, eur: number | null): Promise<PriceItem[]> {
  if (!PRICE_KEY.test(key)) throw new FarmDataError(400, 'Diesen Preis gibt es nicht.');
  if (eur === null) {
    await db.delete(farmPricesTable).where(and(eq(farmPricesTable.farmId, farmId), eq(farmPricesTable.key, key)));
  } else {
    if (!Number.isFinite(eur) || eur < 0 || eur > 1000) throw new FarmDataError(400, 'Der Preis liegt zwischen 0 und 1000 €.');
    await db.insert(farmPricesTable).values({ farmId, key, eur }).onConflictDoUpdate({ target: [farmPricesTable.farmId, farmPricesTable.key], set: { eur } });
  }
  return priceList(farmId);
}
