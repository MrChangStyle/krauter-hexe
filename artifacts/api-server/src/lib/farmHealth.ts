/**
 * Health records, weights and the veterinary office export of a farm
 * ("Meine Farm", step 4).
 *
 * Like farmAnimals.ts: every function takes the farmId from requireFarm and
 * filters by it, so an id from another farm is simply "not found".
 */

import { db, farmAnimalsTable, farmsTable, medicalRecordsTable, weightLogsTable } from '@workspace/db';
import { and, asc, desc, eq } from 'drizzle-orm';

import { FarmDataError, listAnimals, notFound, text, validDate } from './farmAnimals';

/** Throws 404 unless the animal belongs to this farm. Archived ones count. */
async function assertAnimal(farmId: number, animalId: number): Promise<void> {
  const [animal] = await db
    .select({ id: farmAnimalsTable.id })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (!animal) throw notFound();
}

// ── Health records ───────────────────────────────────────────────────────────

const medicalColumns = {
  id: medicalRecordsTable.id,
  animalId: medicalRecordsTable.animalId,
  date: medicalRecordsTable.date,
  diagnosis: medicalRecordsTable.diagnosis,
  treatment: medicalRecordsTable.treatment,
  medication: medicalRecordsTable.medication,
  withdrawalPeriodDays: medicalRecordsTable.withdrawalPeriodDays,
  vet: medicalRecordsTable.vet,
  notes: medicalRecordsTable.notes,
  createdAt: medicalRecordsTable.createdAt,
};

export interface MedicalInput {
  date: unknown;
  diagnosis: unknown;
  treatment?: unknown;
  medication?: unknown;
  withdrawalPeriodDays?: number | null;
  vet?: unknown;
  notes?: unknown;
}

function medicalValues(input: MedicalInput) {
  const days = input.withdrawalPeriodDays ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 999)) {
    throw new FarmDataError(400, 'Die Wartezeit muss zwischen 0 und 999 Tagen liegen.');
  }
  return {
    date: validDate(input.date, 'Datum'),
    diagnosis: text(input.diagnosis, 200, 'Die Diagnose', true),
    treatment: text(input.treatment, 2000, 'Die Behandlung'),
    medication: text(input.medication, 200, 'Das Medikament'),
    withdrawalPeriodDays: days,
    vet: text(input.vet, 100, 'Der Tierarzt'),
    notes: text(input.notes, 2000, 'Die Notiz'),
  };
}

export async function listMedicalRecords(farmId: number, animalId: number) {
  await assertAnimal(farmId, animalId);
  return db
    .select(medicalColumns)
    .from(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.farmId, farmId), eq(medicalRecordsTable.animalId, animalId)))
    .orderBy(desc(medicalRecordsTable.date), desc(medicalRecordsTable.id));
}

export async function createMedicalRecord(farmId: number, animalId: number, input: MedicalInput) {
  const values = medicalValues(input);
  await assertAnimal(farmId, animalId);
  const [record] = await db
    .insert(medicalRecordsTable)
    .values({ farmId, animalId, ...values })
    .returning(medicalColumns);
  return record!;
}

export async function updateMedicalRecord(farmId: number, recordId: number, input: MedicalInput) {
  const values = medicalValues(input);
  const [record] = await db
    .update(medicalRecordsTable)
    .set(values)
    .where(and(eq(medicalRecordsTable.id, recordId), eq(medicalRecordsTable.farmId, farmId)))
    .returning(medicalColumns);
  if (!record) throw notFound();
  return record;
}

export async function deleteMedicalRecord(farmId: number, recordId: number): Promise<void> {
  const deleted = await db
    .delete(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.id, recordId), eq(medicalRecordsTable.farmId, farmId)))
    .returning({ id: medicalRecordsTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── Weights ──────────────────────────────────────────────────────────────────

const weightColumns = {
  id: weightLogsTable.id,
  animalId: weightLogsTable.animalId,
  date: weightLogsTable.date,
  weightKg: weightLogsTable.weightKg,
  createdAt: weightLogsTable.createdAt,
};

export async function listWeightLogs(farmId: number, animalId: number) {
  await assertAnimal(farmId, animalId);
  return db
    .select(weightColumns)
    .from(weightLogsTable)
    .where(and(eq(weightLogsTable.farmId, farmId), eq(weightLogsTable.animalId, animalId)))
    .orderBy(asc(weightLogsTable.date), asc(weightLogsTable.id));
}

export async function createWeightLog(
  farmId: number,
  animalId: number,
  input: { date: unknown; weightKg: number },
) {
  const date = validDate(input.date, 'Datum');
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > 2000) {
    throw new FarmDataError(400, 'Das Gewicht muss über 0 und höchstens 2000 kg sein.');
  }
  await assertAnimal(farmId, animalId);
  const [log] = await db
    .insert(weightLogsTable)
    .values({ farmId, animalId, date, weightKg: Math.round(input.weightKg * 1000) / 1000 })
    .returning(weightColumns);
  return log!;
}

export async function deleteWeightLog(farmId: number, weightId: number): Promise<void> {
  const deleted = await db
    .delete(weightLogsTable)
    .where(and(eq(weightLogsTable.id, weightId), eq(weightLogsTable.farmId, farmId)))
    .returning({ id: weightLogsTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Everything the veterinary office export needs: all animals (archived ones
 * too, they may have been on the farm in the chosen period) and all health
 * records. The app picks the period and builds CSV and PDF from this.
 */
export async function farmExport(farmId: number) {
  const [farm] = await db.select({ name: farmsTable.name }).from(farmsTable).where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  const [animals, medicalRecords] = await Promise.all([
    listAnimals(farmId),
    db
      .select(medicalColumns)
      .from(medicalRecordsTable)
      .where(eq(medicalRecordsTable.farmId, farmId))
      .orderBy(asc(medicalRecordsTable.date), asc(medicalRecordsTable.id)),
  ]);
  return { farmName: farm.name, animals, medicalRecords };
}
