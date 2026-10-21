/**
 * Arzneimittel-Vorrat ("Meine Farm"): the medicines on the farm with batch,
 * expiry and the withdrawal periods from the package insert. A health record
 * can use one: the dose comes off the stock, name, batch and the withdrawal
 * period for the animal's species are filled in. A push 30 days before and on
 * the day a medicine expires. Fixed rules, no AI.
 *
 * Like farmAnimals.ts: every function takes the farmId from requireFarm.
 */

import { db, farmMembershipsTable, farmPushLogTable, medicalRecordsTable, medicinesTable, type FarmSpecies } from '@workspace/db';
import { grantedSql } from './farmModules';
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text, validDate } from './farmAnimals';
import { addDays, daysBetween } from './feedSeason';
import { logger } from './logger';
import { berlinDay } from './monitoring';
import { sendPushToUser } from './webPush';

/** Up to this many days before expiry a medicine shows as "läuft bald ab". */
export const EXPIRY_WARNING_DAYS = 30;

type Row = typeof medicinesTable.$inferSelect;
export type MedicineStatus = 'ok' | 'expiresSoon' | 'expired' | 'empty' | 'archived';

export interface Medicine {
  id: number;
  name: string;
  activeIngredient: string | null;
  unit: string;
  amount: number;
  batch: string | null;
  expiresOn: string | null;
  withdrawalMeatDays: number | null;
  withdrawalMilkDays: number | null;
  withdrawalEggsDays: number | null;
  vet: string | null;
  receivedOn: string | null;
  notes: string | null;
  archived: boolean;
  status: MedicineStatus;
  /** Days until expiry (negative: expired); null without a date. */
  daysLeft: number | null;
  /** Health records that used it. */
  uses: number;
}

export function medicineStatus(m: Pick<Row, 'amount' | 'expiresOn' | 'archivedAt'>, today: string): MedicineStatus {
  if (m.archivedAt) return 'archived';
  if (m.expiresOn && m.expiresOn < today) return 'expired';
  if (m.amount <= 0) return 'empty';
  if (m.expiresOn && daysBetween(today, m.expiresOn) <= EXPIRY_WARNING_DAYS) return 'expiresSoon';
  return 'ok';
}

/**
 * The withdrawal period that counts for this species: the longest of the
 * products it gives (eggs and meat for poultry, milk and meat for ruminants).
 * Null for pets and when the insert gives none.
 */
export function withdrawalFor(m: Pick<Row, 'withdrawalMeatDays' | 'withdrawalMilkDays' | 'withdrawalEggsDays'>, species: FarmSpecies): number | null {
  const products: Partial<Record<FarmSpecies, (number | null)[]>> = {
    poultry: [m.withdrawalMeatDays, m.withdrawalEggsDays],
    cattle: [m.withdrawalMeatDays, m.withdrawalMilkDays],
    goat: [m.withdrawalMeatDays, m.withdrawalMilkDays],
    sheep: [m.withdrawalMeatDays, m.withdrawalMilkDays],
    pig: [m.withdrawalMeatDays],
    rabbit: [m.withdrawalMeatDays],
    horse: [m.withdrawalMeatDays],
  };
  const days = (products[species] ?? []).filter((d): d is number => d !== null);
  return days.length ? Math.max(...days) : null;
}

function toMedicine(row: Row, uses: number, today: string): Medicine {
  const { archivedAt, createdAt: _c, farmId: _f, ...rest } = row;
  return {
    ...rest,
    archived: archivedAt !== null,
    status: medicineStatus(row, today),
    daysLeft: row.expiresOn ? daysBetween(today, row.expiresOn) : null,
    uses,
  };
}

const ORDER: Record<MedicineStatus, number> = { expired: 0, expiresSoon: 1, empty: 2, ok: 3, archived: 4 };

export async function listMedicines(farmId: number): Promise<Medicine[]> {
  const today = berlinDay();
  const rows = await db.select().from(medicinesTable).where(eq(medicinesTable.farmId, farmId)).orderBy(asc(medicinesTable.name));
  const uses = await db
    .select({ id: medicalRecordsTable.medicineId, n: sql<number>`count(*)::int` })
    .from(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.farmId, farmId), isNotNull(medicalRecordsTable.medicineId)))
    .groupBy(medicalRecordsTable.medicineId);
  const count = new Map(uses.map((u) => [u.id, u.n]));
  return rows
    .map((r) => toMedicine(r, count.get(r.id) ?? 0, today))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9));
}

export interface MedicineInput {
  name: unknown;
  activeIngredient?: unknown;
  unit: unknown;
  amount: number;
  batch?: unknown;
  expiresOn?: string | null;
  withdrawalMeatDays?: number | null;
  withdrawalMilkDays?: number | null;
  withdrawalEggsDays?: number | null;
  vet?: unknown;
  receivedOn?: string | null;
  notes?: unknown;
}

function days(value: number | null | undefined, label: string): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 999) throw new FarmDataError(400, `Die Wartezeit ${label} muss zwischen 0 und 999 Tagen liegen.`);
  return value;
}

function medicineValues(input: MedicineInput) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new FarmDataError(400, 'Bitte prüfe die Menge.');
  const expiresOn = input.expiresOn ? String(input.expiresOn) : null;
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new FarmDataError(400, 'Bitte prüfe das Ablaufdatum.');
  return {
    name: text(input.name, 100, 'Der Name', true)!,
    activeIngredient: text(input.activeIngredient, 100, 'Der Wirkstoff'),
    unit: text(input.unit, 20, 'Die Einheit', true)!,
    amount: Math.round(amount * 100) / 100,
    batch: text(input.batch, 50, 'Die Charge'),
    expiresOn,
    withdrawalMeatDays: days(input.withdrawalMeatDays, 'für Fleisch'),
    withdrawalMilkDays: days(input.withdrawalMilkDays, 'für Milch'),
    withdrawalEggsDays: days(input.withdrawalEggsDays, 'für Eier'),
    vet: text(input.vet, 100, 'Der Tierarzt'),
    receivedOn: input.receivedOn ? validDate(input.receivedOn, 'Erhalten am') : null,
    notes: text(input.notes, 1000, 'Die Notiz'),
  };
}

async function one(farmId: number, id: number): Promise<Medicine> {
  const found = (await listMedicines(farmId)).find((m) => m.id === id);
  if (!found) throw notFound();
  return found;
}

export async function createMedicine(farmId: number, input: MedicineInput): Promise<Medicine> {
  const [row] = await db.insert(medicinesTable).values({ farmId, ...medicineValues(input) }).returning({ id: medicinesTable.id });
  return one(farmId, row!.id);
}

export async function updateMedicine(farmId: number, id: number, input: MedicineInput & { archived?: boolean | null }): Promise<Medicine> {
  const values = medicineValues(input);
  const archive = input.archived == null ? {} : { archivedAt: input.archived ? new Date() : null };
  const updated = await db
    .update(medicinesTable)
    .set({ ...values, ...archive })
    .where(and(eq(medicinesTable.id, id), eq(medicinesTable.farmId, farmId)))
    .returning({ id: medicinesTable.id });
  if (updated.length === 0) throw notFound();
  return one(farmId, id);
}

/** Deleted only while no health record used it – otherwise it is archived ("aufgebraucht/entsorgt"). */
export async function deleteMedicine(farmId: number, id: number): Promise<void> {
  const [used] = await db
    .select({ id: medicalRecordsTable.id })
    .from(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.farmId, farmId), eq(medicalRecordsTable.medicineId, id)))
    .limit(1);
  if (used) throw new FarmDataError(409, 'Das Mittel steht in der Krankenakte – bitte als aufgebraucht oder entsorgt markieren.');
  const deleted = await db
    .delete(medicinesTable)
    .where(and(eq(medicinesTable.id, id), eq(medicinesTable.farmId, farmId)))
    .returning({ id: medicinesTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── Use in a health record ───────────────────────────────────────────────────

/** A medicine of this farm that can still be used. */
export async function usableMedicine(farmId: number, id: number) {
  const [row] = await db
    .select()
    .from(medicinesTable)
    .where(and(eq(medicinesTable.id, id), eq(medicinesTable.farmId, farmId)));
  if (!row) throw new FarmDataError(400, 'Dieses Mittel gibt es im Vorrat nicht.');
  return row;
}

/** Changes the stock by `delta` (negative: taken out), never below zero. */
export async function adjustStock(farmId: number, id: number, delta: number): Promise<void> {
  if (delta === 0) return;
  await db
    .update(medicinesTable)
    .set({ amount: sql`GREATEST(0, ROUND((${medicinesTable.amount} + ${delta})::numeric, 2))::double precision` })
    .where(and(eq(medicinesTable.id, id), eq(medicinesTable.farmId, farmId)));
}

// ── Push before expiry ───────────────────────────────────────────────────────

export const MEDICINE_DIGEST_TIME = '07:30';

export function expiryMessage(medicines: Pick<Row, 'name' | 'expiresOn' | 'amount'>[], today: string): { title: string; body: string } | null {
  const soon = medicines.filter((m) => m.expiresOn === addDays(today, EXPIRY_WARNING_DAYS) && m.amount > 0).map((m) => m.name);
  const now = medicines.filter((m) => m.expiresOn === today).map((m) => m.name);
  const parts: string[] = [];
  if (now.length) parts.push(`Heute läuft ab: ${now.join(', ')} – nicht mehr verwenden, über Apotheke oder Tierarzt entsorgen.`);
  if (soon.length) parts.push(`In 30 Tagen läuft ab: ${soon.join(', ')}.`);
  return parts.length ? { title: 'Arzneimittel-Vorrat', body: parts.join(' ') } : null;
}

/** Once per farm and day to admins and caretakers. Never throws. */
export async function sendMedicineDigests(hhmm: string, day: string): Promise<number> {
  if (hhmm < MEDICINE_DIGEST_TIME) return 0;
  let sent = 0;
  try {
    const due = await db
      .select({ farmId: medicinesTable.farmId, name: medicinesTable.name, expiresOn: medicinesTable.expiresOn, amount: medicinesTable.amount })
      .from(medicinesTable)
      .where(
        and(
          isNull(medicinesTable.archivedAt),
          or(eq(medicinesTable.expiresOn, day), eq(medicinesTable.expiresOn, addDays(day, EXPIRY_WARNING_DAYS))),
          sql`NOT EXISTS (SELECT 1 FROM ${farmPushLogTable} WHERE ${farmPushLogTable.farmId} = ${medicinesTable.farmId} AND ${farmPushLogTable.topic} = 'medicines' AND ${farmPushLogTable.day} = ${day})`,
        ),
      );
    if (due.length === 0) return 0;
    await db.delete(farmPushLogTable).where(and(eq(farmPushLogTable.topic, 'medicines'), lt(farmPushLogTable.day, addDays(day, -14))));
    for (const farmId of [...new Set(due.map((d) => d.farmId))]) {
      const claimed = await db.insert(farmPushLogTable).values({ farmId, topic: 'medicines', day }).onConflictDoNothing().returning();
      if (claimed.length === 0) continue;
      try {
        const message = expiryMessage(due.filter((d) => d.farmId === farmId), day);
        if (!message) continue;
        const members = await db
          .select({ userId: farmMembershipsTable.userId })
          .from(farmMembershipsTable)
          .where(and(eq(farmMembershipsTable.farmId, farmId), inArray(farmMembershipsTable.role, ['admin', 'caretaker']), grantedSql('medicines')));
        for (const { userId } of members) {
          await sendPushToUser(userId, { ...message, tag: `medicines-${farmId}-${day}`, url: '/farm/arzneimittel' });
        }
        sent += 1;
      } catch (err) {
        logger.warn({ err, farmId }, 'Medicine push failed');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Medicine pushes failed');
  }
  return sent;
}
