/**
 * Garten-Wirtschaftlichkeit (docs/garten-wirtschaftlichkeit.md): does the
 * garden pay? A season's harvest at shop value (Ernte-Auswertung) against the
 * garden's costs – farm expenses marked for the garden, optionally per bed –
 * and the hours spent: surplus, € per hour, costs per kg, per bed and against
 * the season before. Without logged hours the time is estimated from a guide
 * value. Fixed rules, no AI.
 *
 * Garden costs stay ordinary farm expenses, so Ertrag & Bilanz counts them
 * once. A season is the calendar year of the cost or the hours.
 */

import {
  EXPENSE_CATEGORIES,
  db,
  farmExpensesTable,
  gardenBedsTable,
  gardenHoursTable,
  type ExpenseCategory,
} from '@workspace/db';
import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { validSeason } from './gardenPlanner';
import { loadHarvestReport, type HarvestReport } from './harvestReport';

/** Richtwert: about one hour a week per 10 m² of beds … */
export const M2_PER_WEEKLY_HOUR = 10;
/** … over a season of about 30 weeks (March to October). */
export const SEASON_WEEKS = 30;
/** Statutory minimum wage per hour, for comparison (Mindestlohngesetz). */
export const MINIMUM_WAGE: Record<number, number> = { 2024: 12.41, 2025: 12.82, 2026: 13.9, 2027: 14.6 };

export function minimumWage(season: number): number {
  const years = Object.keys(MINIMUM_WAGE).map(Number).sort((a, b) => a - b);
  const year = years.filter((y) => y <= season).pop() ?? years[0]!;
  return MINIMUM_WAGE[year]!;
}

export interface CostEntry {
  id: number;
  date: string;
  category: ExpenseCategory;
  amountEur: number;
  bedId: number | null;
  note: string | null;
}

export interface HoursEntry {
  id: number;
  date: string;
  hours: number;
  bedId: number | null;
  note: string | null;
}

export interface EconomicsBed {
  bedId: number | null;
  name: string;
  m2: number | null;
  value: number;
  costs: number;
  surplus: number;
  hours: number;
}

export interface GardenEconomics {
  season: number;
  /** Shop value and kg of the season's harvest (Ernte-Auswertung). */
  value: number;
  kg: number;
  /** All beds of the farm, m². */
  area: number;
  costs: { total: number; lines: { category: ExpenseCategory; eur: number }[]; entries: (CostEntry & { bedName: string | null })[] };
  hours: { total: number; estimated: boolean; entries: (HoursEntry & { bedName: string | null })[] };
  surplus: number;
  perHour: number | null;
  costPerKg: number | null;
  surplusPerM2: number | null;
  minimumWage: number;
  beds: EconomicsBed[];
  previous: { value: number; costs: number; surplus: number } | null;
  hints: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface Bed {
  id: number;
  name: string;
  lengthCm: number;
  widthCm: number;
}

/** Pure: the economics of a season from its harvest report, costs, hours and beds. */
export function gardenEconomics(
  report: Pick<HarvestReport, 'season' | 'value' | 'kg' | 'beds' | 'best'>,
  costs: CostEntry[],
  hours: HoursEntry[],
  beds: Bed[],
  previous: { value: number; costs: number } | null = null,
): GardenEconomics {
  const bedName = new Map(beds.map((b) => [b.id, b.name]));
  const bedM2 = new Map(beds.map((b) => [b.id, (b.lengthCm * b.widthCm) / 10_000]));
  const area = r2([...bedM2.values()].reduce((s, v) => s + v, 0));

  const byCategory = new Map<ExpenseCategory, number>();
  for (const c of costs) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amountEur);
  const costTotal = r2(costs.reduce((s, c) => s + c.amountEur, 0));

  const logged = r2(hours.reduce((s, h) => s + h.hours, 0));
  const estimated = logged === 0 && area > 0;
  const hourTotal = estimated ? r1((area / M2_PER_WEEKLY_HOUR) * SEASON_WEEKS) : logged;

  const surplus = r2(report.value - costTotal);

  // Per bed: what was harvested there, what was spent on it, the hours logged for it.
  const perBed = new Map<string, EconomicsBed>();
  const bedRow = (bedId: number | null): EconomicsBed => {
    const key = bedId === null ? 'none' : `b${bedId}`;
    const known = bedId !== null && bedName.has(bedId);
    const row = perBed.get(key) ?? {
      bedId,
      name: bedId === null ? 'Für den ganzen Garten' : (bedName.get(bedId) ?? 'Gelöschtes Beet'),
      m2: known ? r2(bedM2.get(bedId)!) : null,
      value: 0,
      costs: 0,
      surplus: 0,
      hours: 0,
    };
    perBed.set(key, row);
    return row;
  };
  for (const b of report.beds) bedRow(b.bedId).value += b.value;
  for (const c of costs) bedRow(c.bedId).costs += c.amountEur;
  for (const h of hours) bedRow(h.bedId).hours += h.hours;
  const bedList = [...perBed.values()]
    .map((b) => ({ ...b, value: r2(b.value), costs: r2(b.costs), surplus: r2(b.value - b.costs), hours: r2(b.hours) }))
    .sort((a, b) => Number(a.bedId === null) - Number(b.bedId === null) || b.surplus - a.surplus);

  const perHour = hourTotal > 0 ? r2(surplus / hourTotal) : null;
  const wage = minimumWage(report.season);

  const hints: string[] = [];
  if (costs.length === 0) hints.push('Noch keine Gartenausgaben für diese Saison – trag Saatgut, Pflanzen, Erde, Dünger und Wasser ein, dann rechnet die App den Überschuss.');
  else if (surplus < 0) hints.push(`Die Saison hat ${eur(-surplus)} mehr gekostet, als die Ernte im Laden wert wäre.`);
  for (const b of bedList.filter((b) => b.bedId !== null && b.costs > 0 && b.costs > b.value)) {
    hints.push(`${b.name}: ${eur(b.costs)} Kosten, aber nur ${eur(b.value)} Ernte.`);
  }
  if (report.best.length > 0) hints.push(`Am meisten bringen je m²: ${report.best.map((b) => `${b.label} (${eur(b.valuePerM2)})`).join(', ')} – davon mehr anbauen lohnt sich.`);
  if (perHour !== null && costs.length > 0) {
    hints.push(
      perHour >= wage
        ? `${eur(perHour)} je Stunde – mehr als der Mindestlohn (${eur(wage)}).`
        : `${eur(perHour)} je Stunde${estimated ? ' (Zeit geschätzt)' : ''} – zum Vergleich: Mindestlohn ${eur(wage)}. Frische, Geschmack und Freude zählen hier nicht mit.`,
    );
  }
  if (estimated) hints.push(`Die Zeit ist geschätzt (etwa 1 Stunde je Woche für ${M2_PER_WEEKLY_HOUR} m², ${SEASON_WEEKS} Wochen). Trag deine Stunden ein, dann rechnet die App mit ihnen.`);

  const lines = EXPENSE_CATEGORIES.filter((c) => byCategory.has(c)).map((category) => ({ category, eur: r2(byCategory.get(category)!) }));
  const named = <T extends { bedId: number | null }>(e: T) => ({ ...e, bedName: e.bedId === null ? null : (bedName.get(e.bedId) ?? null) });
  return {
    season: report.season,
    value: r2(report.value),
    kg: report.kg,
    area,
    costs: { total: costTotal, lines, entries: costs.map(named) },
    hours: { total: hourTotal, estimated, entries: hours.map(named) },
    surplus,
    perHour,
    costPerKg: report.kg > 0 && costTotal > 0 ? r2(costTotal / report.kg) : null,
    surplusPerM2: area > 0 ? r2(surplus / area) : null,
    minimumWage: wage,
    beds: bedList,
    previous: previous ? { value: r2(previous.value), costs: r2(previous.costs), surplus: r2(previous.value - previous.costs) } : null,
    hints,
  };
}

// ── Database ──────────────────────────────────────────────────────────────────

function gardenCosts(farmId: number, season: number) {
  return db
    .select({
      id: farmExpensesTable.id,
      date: farmExpensesTable.date,
      category: farmExpensesTable.category,
      amountEur: farmExpensesTable.amountEur,
      bedId: farmExpensesTable.bedId,
      note: farmExpensesTable.note,
    })
    .from(farmExpensesTable)
    .where(and(eq(farmExpensesTable.farmId, farmId), eq(farmExpensesTable.garden, true), gte(farmExpensesTable.date, `${season}-01-01`), lte(farmExpensesTable.date, `${season}-12-31`)))
    .orderBy(desc(farmExpensesTable.date), desc(farmExpensesTable.id))
    .then((rows) => rows.map((r) => ({ ...r, category: r.category as ExpenseCategory })));
}

function gardenHours(farmId: number, season: number) {
  return db
    .select({ id: gardenHoursTable.id, date: gardenHoursTable.date, hours: gardenHoursTable.hours, bedId: gardenHoursTable.bedId, note: gardenHoursTable.note })
    .from(gardenHoursTable)
    .where(and(eq(gardenHoursTable.farmId, farmId), gte(gardenHoursTable.date, `${season}-01-01`), lte(gardenHoursTable.date, `${season}-12-31`)))
    .orderBy(desc(gardenHoursTable.date), desc(gardenHoursTable.id));
}

export async function loadGardenEconomics(farmId: number, rawSeason: number): Promise<GardenEconomics> {
  const season = validSeason(rawSeason);
  const [report, previousReport, costs, previousCosts, hours, beds] = await Promise.all([
    loadHarvestReport(farmId, season),
    season > 2000 ? loadHarvestReport(farmId, season - 1) : null,
    gardenCosts(farmId, season),
    gardenCosts(farmId, season - 1),
    gardenHours(farmId, season),
    db
      .select({ id: gardenBedsTable.id, name: gardenBedsTable.name, lengthCm: gardenBedsTable.lengthCm, widthCm: gardenBedsTable.widthCm })
      .from(gardenBedsTable)
      .where(eq(gardenBedsTable.farmId, farmId)),
  ]);
  const before = (previousReport?.value ?? 0) > 0 || previousCosts.length > 0 ? { value: previousReport?.value ?? 0, costs: previousCosts.reduce((s, c) => s + c.amountEur, 0) } : null;
  return gardenEconomics(report, costs, hours, beds, before);
}

async function checkBed(farmId: number, bedId: number | null | undefined): Promise<number | null> {
  if (bedId === undefined || bedId === null) return null;
  const [bed] = await db.select({ id: gardenBedsTable.id }).from(gardenBedsTable).where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId)));
  if (!bed) throw new FarmDataError(400, 'Dieses Beet gibt es auf der Farm nicht.');
  return bed.id;
}

export interface GardenCostInput {
  date: unknown;
  category: ExpenseCategory;
  amountEur: number;
  bedId?: number | null;
  note?: unknown;
}

/** A garden cost: a farm expense marked for the garden (and counted once in Ertrag & Bilanz). */
export async function addGardenCost(farmId: number, input: GardenCostInput): Promise<void> {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) throw new FarmDataError(400, 'Diese Art von Ausgabe gibt es nicht.');
  const date = validDate(input.date, 'Datum');
  if (!Number.isFinite(input.amountEur) || input.amountEur <= 0 || input.amountEur > 100_000) throw new FarmDataError(400, 'Der Betrag ist ungültig.');
  const bedId = await checkBed(farmId, input.bedId);
  await db.insert(farmExpensesTable).values({ farmId, date, category: input.category, amountEur: r2(input.amountEur), garden: true, bedId, note: text(input.note, 500, 'Die Notiz') });
}

export async function removeGardenCost(farmId: number, id: number): Promise<void> {
  const gone = await db
    .delete(farmExpensesTable)
    .where(and(eq(farmExpensesTable.id, id), eq(farmExpensesTable.farmId, farmId), eq(farmExpensesTable.garden, true)))
    .returning({ id: farmExpensesTable.id });
  if (gone.length === 0) throw notFound();
}

export interface GardenHoursInput {
  date: unknown;
  hours: number;
  bedId?: number | null;
  note?: unknown;
}

export async function addGardenHours(farmId: number, input: GardenHoursInput): Promise<void> {
  const date = validDate(input.date, 'Datum');
  if (!Number.isFinite(input.hours) || input.hours < 0.25 || input.hours > 24) throw new FarmDataError(400, 'Bitte zwischen einer Viertelstunde und 24 Stunden eintragen.');
  const bedId = await checkBed(farmId, input.bedId);
  await db.insert(gardenHoursTable).values({ farmId, date, hours: Math.round(input.hours * 4) / 4, bedId, note: text(input.note, 300, 'Die Notiz') });
}

export async function removeGardenHours(farmId: number, id: number): Promise<void> {
  const gone = await db
    .delete(gardenHoursTable)
    .where(and(eq(gardenHoursTable.id, id), eq(gardenHoursTable.farmId, farmId)))
    .returning({ id: gardenHoursTable.id });
  if (gone.length === 0) throw notFound();
}
