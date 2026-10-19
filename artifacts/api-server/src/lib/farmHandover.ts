/**
 * Vertretung ("Meine Farm"): the handover page for whoever looks after the
 * animals – the admins' note (keys, vet, quirks), who to call, running
 * withdrawal periods and the treatments of the last two weeks. Today's stall
 * tasks and the weather come from their own endpoints.
 */

import { db, farmAnimalsTable, farmMembershipsTable, farmsTable, medicalRecordsTable, usersTable } from '@workspace/db';
import { and, desc, eq, gte } from 'drizzle-orm';

import { notFound, text } from './farmAnimals';
import { addDays } from './feedSeason';
import { berlinDay } from './monitoring';

const RECENT_DAYS = 14;

export interface Handover {
  note: string | null;
  /** The viewer's own last day, when they are a Vertretung. */
  accessUntil: string | null;
  contacts: { displayName: string }[];
  withdrawals: { animalName: string; medication: string | null; until: string }[];
  recentHealth: { animalName: string; date: string; diagnosis: string; treatment: string | null; medication: string | null }[];
}

export async function handover(farmId: number, viewerId: string): Promise<Handover> {
  const today = berlinDay();
  const [farm] = await db.select({ note: farmsTable.handoverNote }).from(farmsTable).where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  const [me] = await db
    .select({ accessUntil: farmMembershipsTable.accessUntil })
    .from(farmMembershipsTable)
    .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, viewerId)));
  const admins = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username })
    .from(farmMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, farmMembershipsTable.userId))
    .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.role, 'admin')));
  const records = await db
    .select({
      animalName: farmAnimalsTable.name,
      date: medicalRecordsTable.date,
      diagnosis: medicalRecordsTable.diagnosis,
      treatment: medicalRecordsTable.treatment,
      medication: medicalRecordsTable.medication,
      withdrawalPeriodDays: medicalRecordsTable.withdrawalPeriodDays,
    })
    .from(medicalRecordsTable)
    .innerJoin(farmAnimalsTable, and(eq(farmAnimalsTable.id, medicalRecordsTable.animalId), eq(farmAnimalsTable.farmId, medicalRecordsTable.farmId)))
    .where(and(eq(medicalRecordsTable.farmId, farmId), gte(medicalRecordsTable.date, addDays(today, -400))))
    .orderBy(desc(medicalRecordsTable.date), desc(medicalRecordsTable.id));
  const withdrawals = records
    .filter((r) => r.withdrawalPeriodDays)
    .map((r) => ({ animalName: r.animalName, medication: r.medication, until: addDays(r.date, r.withdrawalPeriodDays!) }))
    .filter((w) => w.until >= today)
    .sort((a, b) => b.until.localeCompare(a.until));
  return {
    note: farm.note,
    accessUntil: me?.accessUntil ?? null,
    contacts: admins.map((a) => ({ displayName: [a.firstName, a.lastName].filter(Boolean).join(' ') || a.username || 'Admin' })),
    withdrawals,
    recentHealth: records
      .filter((r) => r.date >= addDays(today, -RECENT_DAYS))
      .map(({ withdrawalPeriodDays: _w, ...r }) => r),
  };
}

export async function setHandoverNote(farmId: number, raw: unknown): Promise<void> {
  await db.update(farmsTable).set({ handoverNote: text(raw, 2000, 'Die Übergabe-Notiz') }).where(eq(farmsTable.id, farmId));
}
