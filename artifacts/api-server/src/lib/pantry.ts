/**
 * Vorratskammer (docs/vorratskammer.md): what the farm put by – preserved,
 * frozen, dried, honey, eggs – with amount, place and best-before date.
 * Taking something out is one tap and is kept, so a mistake can be undone.
 * A store can be made from a garden harvest. Once a week, on Monday
 * morning, a push names what should be used up within the next 14 days.
 */

import {
  PANTRY_KINDS,
  db,
  farmMembershipsTable,
  farmPushLogTable,
  harvestLogsTable,
  pantryItemsTable,
  pantryUsesTable,
  type PantryKind,
} from '@workspace/db';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { grantedSql } from './farmModules';
import { addDays } from './feedSeason';
import { cropByKey } from './gardenCatalog';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';

export const PANTRY_PUSH_TIME = '07:30';
/** "Bald aufbrauchen": best before within this many days. */
export const SOON_DAYS = 30;
/** The Monday push looks this far ahead. */
export const PUSH_AHEAD_DAYS = 14;
export const PANTRY_UNITS = ['Glas', 'Beutel', 'Dose', 'Flasche', 'Stück', 'Portion', 'kg', 'g', 'l'] as const;

// ── Rules (pure) ──────────────────────────────────────────────────────────────

/** A usual keeping time per kind, as a suggestion the user can change. */
const KEEPS: Record<PantryKind, { months?: number; days?: number } | null> = {
  canned: { months: 12 },
  frozen: { months: 9 },
  dried: { months: 12 },
  pickled: { months: 12 },
  fermented: { months: 6 },
  juice: { months: 12 },
  jam: { months: 12 },
  honey: { months: 24 },
  eggs: { days: 28 },
  other: null,
};

export function suggestBestBefore(kind: PantryKind, madeOn: string): string | null {
  const keep = KEEPS[kind];
  if (!keep) return null;
  if (keep.days) return addDays(madeOn, keep.days);
  const d = new Date(`${madeOn}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + keep.months!);
  // 31 March + 1 month: end of April, not 1 May.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export type PantryStatus = 'ok' | 'soon' | 'expired' | 'empty';

export function pantryStatus(item: { amount: number; bestBefore: string | null }, today: string): PantryStatus {
  if (item.amount <= 0) return 'empty';
  if (item.bestBefore === null) return 'ok';
  if (item.bestBefore < today) return 'expired';
  return item.bestBefore <= addDays(today, SOON_DAYS) ? 'soon' : 'ok';
}

const ORDER: Record<PantryStatus, number> = { expired: 0, soon: 1, ok: 2, empty: 3 };

/** The Monday push: what runs out within 14 days, soonest first. */
export function pushMessage(items: { name: string; amount: number; unit: string; bestBefore: string | null }[], today: string): { title: string; body: string } | null {
  const soon = items
    .filter((i) => i.amount > 0 && i.bestBefore !== null && i.bestBefore >= today && i.bestBefore <= addDays(today, PUSH_AHEAD_DAYS))
    .sort((a, b) => a.bestBefore!.localeCompare(b.bestBefore!));
  if (soon.length === 0) return null;
  const line = (i: (typeof soon)[number]) => `${i.name} (bis ${i.bestBefore!.slice(8, 10)}.${i.bestBefore!.slice(5, 7)}.)`;
  return {
    title: soon.length === 1 ? 'Vorrat: bald aufbrauchen' : `Vorrat: ${soon.length} Dinge bald aufbrauchen`,
    body: soon.slice(0, 5).map(line).join(' · ') + (soon.length > 5 ? ` und ${soon.length - 5} weitere` : ''),
  };
}

// ── Database ──────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

async function itemOf(farmId: number, itemId: number) {
  const [row] = await db
    .select()
    .from(pantryItemsTable)
    .where(and(eq(pantryItemsTable.id, itemId), eq(pantryItemsTable.farmId, farmId)));
  if (!row) throw notFound();
  return row;
}

export async function pantryOverview(farmId: number, today = berlinDay()) {
  const [items, harvests] = await Promise.all([
    db.select().from(pantryItemsTable).where(eq(pantryItemsTable.farmId, farmId)),
    db
      .select({
        id: harvestLogsTable.id,
        label: harvestLogsTable.label,
        cropKey: harvestLogsTable.cropKey,
        harvestedOn: harvestLogsTable.harvestedOn,
        amountKg: harvestLogsTable.amountKg,
      })
      .from(harvestLogsTable)
      .where(and(eq(harvestLogsTable.farmId, farmId), gte(harvestLogsTable.harvestedOn, addDays(today, -120))))
      .orderBy(desc(harvestLogsTable.harvestedOn), desc(harvestLogsTable.id))
      .limit(30),
  ]);
  const uses = items.length
    ? await db
        .select({ id: pantryUsesTable.id, itemId: pantryUsesTable.itemId, date: pantryUsesTable.date, amount: pantryUsesTable.amount })
        .from(pantryUsesTable)
        .where(and(eq(pantryUsesTable.farmId, farmId), inArray(pantryUsesTable.itemId, items.map((i) => i.id))))
        .orderBy(desc(pantryUsesTable.date), desc(pantryUsesTable.id))
    : [];
  const list = items
    .map(({ farmId: _f, createdAt: _c, ...i }) => ({
      ...i,
      status: pantryStatus(i, today),
      uses: uses.filter((u) => u.itemId === i.id).slice(0, 5),
    }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.bestBefore ?? '9999').localeCompare(b.bestBefore ?? '9999') || a.name.localeCompare(b.name, 'de'));
  const stocked = list.filter((i) => i.status !== 'empty');
  return {
    items: list,
    stocked: stocked.length,
    soon: stocked.filter((i) => i.status === 'soon').length,
    expired: stocked.filter((i) => i.status === 'expired').length,
    locations: [...new Set(items.map((i) => i.location).filter((l): l is string => !!l))].sort((a, b) => a.localeCompare(b, 'de')),
    harvests: harvests.map((h) => ({ ...h, label: (h.cropKey && cropByKey(h.cropKey)?.name) || h.label })),
  };
}

export interface PantryInput {
  name: unknown;
  kind: PantryKind;
  amount: number;
  unit: unknown;
  location?: unknown;
  madeOn: unknown;
  bestBefore?: unknown;
  harvestId?: number | null;
  notes?: unknown;
}

function amountOf(raw: number, label = 'Die Menge'): number {
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100_000) throw new FarmDataError(400, `${label} ist ungültig.`);
  return r2(raw);
}

async function itemValues(farmId: number, input: PantryInput) {
  if (!(PANTRY_KINDS as readonly string[]).includes(input.kind)) throw new FarmDataError(400, 'Diese Art gibt es nicht.');
  const madeOn = validDate(input.madeOn, 'Datum');
  const bestBefore = input.bestBefore === undefined || input.bestBefore === null || input.bestBefore === '' ? null : (() => {
    if (typeof input.bestBefore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.bestBefore) || Number.isNaN(Date.parse(input.bestBefore))) {
      throw new FarmDataError(400, 'Das Mindesthaltbarkeitsdatum ist ungültig.');
    }
    if (input.bestBefore < madeOn) throw new FarmDataError(400, 'Das Mindesthaltbarkeitsdatum liegt vor dem Herstellungstag.');
    return input.bestBefore;
  })();
  let cropKey: string | null = null;
  const harvestId = input.harvestId ?? null;
  if (harvestId !== null) {
    const [harvest] = await db
      .select({ cropKey: harvestLogsTable.cropKey })
      .from(harvestLogsTable)
      .where(and(eq(harvestLogsTable.id, harvestId), eq(harvestLogsTable.farmId, farmId)));
    if (!harvest) throw new FarmDataError(400, 'Diese Ernte gibt es auf der Farm nicht.');
    cropKey = harvest.cropKey;
  }
  return {
    name: text(input.name, 80, 'Der Name', true),
    kind: input.kind,
    unit: text(input.unit, 20, 'Die Einheit', true),
    location: text(input.location, 60, 'Der Lagerort'),
    madeOn,
    bestBefore,
    harvestId,
    cropKey,
    notes: text(input.notes, 500, 'Die Notiz'),
  };
}

export async function createItem(farmId: number, input: PantryInput) {
  const values = await itemValues(farmId, input);
  const amount = amountOf(input.amount);
  const [row] = await db.insert(pantryItemsTable).values({ farmId, ...values, amount, initialAmount: amount }).returning({ id: pantryItemsTable.id });
  return row!.id;
}

/** Changes the item; a new amount counts as the stock now. */
export async function updateItem(farmId: number, itemId: number, input: PantryInput) {
  const item = await itemOf(farmId, itemId);
  const values = await itemValues(farmId, input);
  const amount = input.amount === 0 ? 0 : amountOf(input.amount);
  await db
    .update(pantryItemsTable)
    .set({ ...values, amount, initialAmount: Math.max(item.initialAmount, amount) })
    .where(eq(pantryItemsTable.id, itemId));
}

export async function deleteItem(farmId: number, itemId: number): Promise<void> {
  await itemOf(farmId, itemId);
  await db.delete(pantryItemsTable).where(eq(pantryItemsTable.id, itemId));
}

/** Takes `amount` out (never more than is there) and keeps it as a use. */
export async function takeOut(farmId: number, itemId: number, rawAmount: number, rawDate?: unknown) {
  const item = await itemOf(farmId, itemId);
  const amount = amountOf(rawAmount);
  if (amount > item.amount + 1e-9) throw new FarmDataError(400, `Es sind nur noch ${String(item.amount).replace('.', ',')} ${item.unit} da.`);
  const date = rawDate === undefined || rawDate === null ? berlinDay() : validDate(rawDate, 'Datum');
  await db.insert(pantryUsesTable).values({ farmId, itemId, date, amount });
  await db
    .update(pantryItemsTable)
    .set({ amount: sql`GREATEST(0, ROUND((${pantryItemsTable.amount} - ${amount})::numeric, 2))::double precision` })
    .where(eq(pantryItemsTable.id, itemId));
}

/** Undoes a use: the amount goes back. */
export async function undoUse(farmId: number, itemId: number, useId: number) {
  await itemOf(farmId, itemId);
  const [use] = await db
    .delete(pantryUsesTable)
    .where(and(eq(pantryUsesTable.id, useId), eq(pantryUsesTable.itemId, itemId), eq(pantryUsesTable.farmId, farmId)))
    .returning({ amount: pantryUsesTable.amount });
  if (!use) throw notFound();
  await db
    .update(pantryItemsTable)
    .set({ amount: sql`ROUND((${pantryItemsTable.amount} + ${use.amount})::numeric, 2)::double precision` })
    .where(eq(pantryItemsTable.id, itemId));
}

// ── Monday push ──────────────────────────────────────────────────────────────

export async function sendPantryDigests(hhmm: string, day: string): Promise<number> {
  // Mondays only (1 = Monday).
  if (hhmm < PANTRY_PUSH_TIME || new Date(`${day}T12:00:00Z`).getUTCDay() !== 1) return 0;
  let sent = 0;
  try {
    const soon = await db
      .select({ farmId: pantryItemsTable.farmId, name: pantryItemsTable.name, amount: pantryItemsTable.amount, unit: pantryItemsTable.unit, bestBefore: pantryItemsTable.bestBefore })
      .from(pantryItemsTable)
      .where(and(gte(pantryItemsTable.bestBefore, day), sql`${pantryItemsTable.bestBefore} <= ${addDays(day, PUSH_AHEAD_DAYS)}`, sql`${pantryItemsTable.amount} > 0`))
      .orderBy(asc(pantryItemsTable.farmId));
    if (soon.length === 0) return 0;
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'pantry'), lt(farmPushLogTable.day, addDays(day, -30))));
    for (const farmId of [...new Set(soon.map((s) => s.farmId))]) {
      try {
        const message = pushMessage(soon.filter((s) => s.farmId === farmId), day);
        if (!message) continue;
        const claimed = await db.insert(farmPushLogTable).values({ farmId, topic: 'pantry', day }).onConflictDoNothing().returning();
        if (claimed.length === 0) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker']), grantedSql('pantry')));
        for (const { userId } of members) {
          await sendPushToUser(userId, { topic: 'pantry', ...message, tag: `pantry-${farmId}-${day}`, url: '/vorrat' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Pantry push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Pantry pushes failed');
  }
  return sent;
}
