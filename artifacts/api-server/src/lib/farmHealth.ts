/**
 * Health records, weights and the veterinary office export of a farm
 * ("Meine Farm", step 4).
 *
 * Like farmAnimals.ts: every function takes the farmId from requireFarm and
 * filters by it, so an id from another farm is simply "not found".
 */

import { certifiedAt } from './farming';
import { beeColoniesTable, beeTreatmentsTable, db, farmAnimalsTable, farmsTable, medicalRecordsTable, medicinesTable, weightLogsTable, type FarmSpecies } from '@workspace/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { FarmDataError, listAnimals, notFound, text, validDate } from './farmAnimals';
import { addDays } from './feedSeason';
import { adjustStock, usableMedicine, withdrawalFor } from './medicines';
import { checkRepeat, scheduleRepeat, type MedicalRepeat } from './medicalRepeat';

/** Throws 404 unless the animal belongs to this farm. Archived ones count. */
async function assertAnimal(farmId: number, animalId: number): Promise<{ species: FarmSpecies }> {
  const [animal] = await db
    .select({ species: farmAnimalsTable.species })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (!animal) throw notFound();
  return animal;
}

// ── Health records ───────────────────────────────────────────────────────────

/** A treatment over several days lasts at most this long (Richtwert). */
export const MAX_TREATMENT_DAYS = 90;

/**
 * Last day of the Wartezeit: counted from the last day of the treatment (or
 * its only day). Null without a withdrawal period.
 */
export function withdrawalUntil(r: {
  date: string;
  treatmentUntil: string | null;
  withdrawalPeriodDays: number | null;
  organic?: boolean;
  remedyKind?: string | null;
}): string | null {
  const days = withdrawalDays(r);
  return days ? addDays(r.treatmentUntil ?? r.date, days) : null;
}

export const REMEDY_KINDS = ['chemical', 'natural', 'vaccine', 'antiparasitic'] as const;

/**
 * Days of Wartezeit that apply. On an organic farm (Bio, docs/bio.md) the legal
 * one doubles, at least 2 days (48 hours) – also for a chemical remedy without
 * one (Richtwert, VO (EU) 2018/848).
 */
export function withdrawalDays(r: { withdrawalPeriodDays: number | null; organic?: boolean; remedyKind?: string | null }): number | null {
  const legal = r.withdrawalPeriodDays;
  if (!r.organic) return legal || null;
  if (legal !== null) return Math.max(legal * 2, ORGANIC_MIN_WITHDRAWAL_DAYS);
  return r.remedyKind === 'chemical' ? ORGANIC_MIN_WITHDRAWAL_DAYS : null;
}

/** Bio: at least 48 hours of Wartezeit (Richtwert). */
export const ORGANIC_MIN_WITHDRAWAL_DAYS = 2;

const medicalColumns = {
  id: medicalRecordsTable.id,
  animalId: medicalRecordsTable.animalId,
  date: medicalRecordsTable.date,
  diagnosis: medicalRecordsTable.diagnosis,
  treatment: medicalRecordsTable.treatment,
  medication: medicalRecordsTable.medication,
  withdrawalPeriodDays: medicalRecordsTable.withdrawalPeriodDays,
  treatmentUntil: medicalRecordsTable.treatmentUntil,
  vet: medicalRecordsTable.vet,
  notes: medicalRecordsTable.notes,
  medicineId: medicalRecordsTable.medicineId,
  dose: medicalRecordsTable.dose,
  batch: medicalRecordsTable.batch,
  remedyKind: medicalRecordsTable.remedyKind,
  organic: medicalRecordsTable.organic,
  // Unit of the dose, from the medicine (records without one: null).
  doseUnit: medicinesTable.unit,
  createdAt: medicalRecordsTable.createdAt,
};

/** Records with the unit of their medicine. */
function selectRecords() {
  return db
    .select(medicalColumns)
    .from(medicalRecordsTable)
    .leftJoin(medicinesTable, and(eq(medicinesTable.id, medicalRecordsTable.medicineId), eq(medicinesTable.farmId, medicalRecordsTable.farmId)));
}

async function recordById(farmId: number, recordId: number) {
  const [record] = await selectRecords().where(and(eq(medicalRecordsTable.id, recordId), eq(medicalRecordsTable.farmId, farmId)));
  if (!record) throw notFound();
  return record;
}

export interface MedicalInput {
  date: unknown;
  diagnosis: unknown;
  treatment?: unknown;
  medication?: unknown;
  withdrawalPeriodDays?: number | null;
  /** Last day of a treatment over several days (empty: just the date). */
  treatmentUntil?: unknown;
  vet?: unknown;
  notes?: unknown;
  /** From the Arzneimittel-Vorrat, with the amount given (its unit). */
  medicineId?: number | null;
  dose?: number | null;
  /** New records only: remind to repeat (docs/gesundheit-erinnerung.md). */
  repeat?: MedicalRepeat | null;
  /** Bio: chemical, natural, vaccine, antiparasitic or null. */
  remedyKind?: unknown;
}

function medicalValues(input: MedicalInput) {
  const days = input.withdrawalPeriodDays ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 999)) {
    throw new FarmDataError(400, 'Die Wartezeit muss zwischen 0 und 999 Tagen liegen.');
  }
  const date = validDate(input.date, 'Datum');
  const until = input.treatmentUntil == null || input.treatmentUntil === '' ? null : input.treatmentUntil;
  // May lie ahead: a treatment that is still running.
  if (until !== null && (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until) || until < date || until > addDays(date, MAX_TREATMENT_DAYS))) {
    throw new FarmDataError(400, `Die Behandlung endet frühestens am Tag des Eintrags und höchstens ${MAX_TREATMENT_DAYS} Tage danach.`);
  }
  return {
    date,
    treatmentUntil: until === date ? null : until,
    diagnosis: text(input.diagnosis, 200, 'Die Diagnose', true),
    treatment: text(input.treatment, 2000, 'Die Behandlung'),
    medication: text(input.medication, 200, 'Das Medikament'),
    withdrawalPeriodDays: days,
    vet: text(input.vet, 100, 'Der Tierarzt'),
    notes: text(input.notes, 2000, 'Die Notiz'),
    remedyKind: remedyKind(input.remedyKind),
  };
}

function remedyKind(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !(REMEDY_KINDS as readonly string[]).includes(raw)) throw new FarmDataError(400, 'Diese Art der Behandlung gibt es nicht.');
  return raw;
}

export async function listMedicalRecords(farmId: number, animalId: number) {
  await assertAnimal(farmId, animalId);
  return selectRecords()
    .where(and(eq(medicalRecordsTable.farmId, farmId), eq(medicalRecordsTable.animalId, animalId)))
    .orderBy(desc(medicalRecordsTable.date), desc(medicalRecordsTable.id));
}

/**
 * A medicine from the stock: the dose is required; the name, its batch and the
 * withdrawal period for the species fill in what the user left empty. A new
 * use must not be used up, thrown away or past its expiry on the day given.
 */
async function withMedicine(
  farmId: number,
  species: FarmSpecies,
  input: MedicalInput,
  values: ReturnType<typeof medicalValues>,
  previous: { medicineId: number | null; batch: string | null } | null,
) {
  if (input.medicineId == null) return { ...values, medicineId: null, dose: null, batch: null };
  const medicine = await usableMedicine(farmId, input.medicineId);
  const dose = Number(input.dose);
  if (!Number.isFinite(dose) || dose <= 0 || dose > 100_000) throw new FarmDataError(400, `Bitte gib die Menge in ${medicine.unit} an.`);
  const same = previous?.medicineId === medicine.id;
  if (!same) {
    if (medicine.archivedAt) throw new FarmDataError(400, `${medicine.name} ist als aufgebraucht oder entsorgt markiert.`);
    if (medicine.expiresOn && medicine.expiresOn < values.date) throw new FarmDataError(400, `${medicine.name} war am ${values.date.split('-').reverse().join('.')} schon abgelaufen.`);
  }
  return {
    ...values,
    medication: values.medication ?? medicine.name,
    withdrawalPeriodDays: values.withdrawalPeriodDays ?? withdrawalFor(medicine, species),
    medicineId: medicine.id,
    dose: Math.round(dose * 100) / 100,
    batch: same ? previous!.batch : medicine.batch,
  };
}

export async function createMedicalRecord(farmId: number, animalId: number, input: MedicalInput) {
  const { species } = await assertAnimal(farmId, animalId);
  if (input.repeat) checkRepeat(input.repeat);
  const values = await withMedicine(farmId, species, input, medicalValues(input), null);
  // Bio: the farm's level when the treatment is entered decides the Wartezeit for good.
  const organic = (await certifiedAt(farmId, 'treatments'));
  const [record] = await db
    .insert(medicalRecordsTable)
    .values({ farmId, animalId, ...values, organic })
    .returning({ id: medicalRecordsTable.id });
  if (values.medicineId !== null) await adjustStock(farmId, values.medicineId, -values.dose!);
  if (input.repeat) await scheduleRepeat(farmId, animalId, input.repeat, values.date, values.medication);
  return recordById(farmId, record!.id);
}

export async function updateMedicalRecord(farmId: number, recordId: number, input: MedicalInput) {
  const [old] = await db
    .select({ animalId: medicalRecordsTable.animalId, medicineId: medicalRecordsTable.medicineId, dose: medicalRecordsTable.dose, batch: medicalRecordsTable.batch })
    .from(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.id, recordId), eq(medicalRecordsTable.farmId, farmId)));
  if (!old) throw notFound();
  const { species } = await assertAnimal(farmId, old.animalId);
  const values = await withMedicine(farmId, species, input, medicalValues(input), old);
  const updated = await db
    .update(medicalRecordsTable)
    .set(values)
    .where(and(eq(medicalRecordsTable.id, recordId), eq(medicalRecordsTable.farmId, farmId)))
    .returning({ id: medicalRecordsTable.id });
  if (updated.length === 0) throw notFound();
  // Put the old dose back, take the new one out.
  if (old.medicineId !== null && old.dose) await adjustStock(farmId, old.medicineId, old.dose);
  if (values.medicineId !== null) await adjustStock(farmId, values.medicineId, -values.dose!);
  return recordById(farmId, recordId);
}

export async function deleteMedicalRecord(farmId: number, recordId: number): Promise<void> {
  const deleted = await db
    .delete(medicalRecordsTable)
    .where(and(eq(medicalRecordsTable.id, recordId), eq(medicalRecordsTable.farmId, farmId)))
    .returning({ medicineId: medicalRecordsTable.medicineId, dose: medicalRecordsTable.dose });
  if (deleted.length === 0) throw notFound();
  // A record entered by mistake gives its dose back to the stock.
  const [d] = deleted;
  if (d!.medicineId !== null && d!.dose) await adjustStock(farmId, d!.medicineId, d!.dose);
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
export async function farmExport(farmId: number, withBees = false) {
  const [farm] = await db.select({ name: farmsTable.name, holdingNumber: farmsTable.holdingNumber }).from(farmsTable).where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  const [animals, medicalRecords, bees] = await Promise.all([
    listAnimals(farmId),
    selectRecords()
      .where(eq(medicalRecordsTable.farmId, farmId))
      .orderBy(asc(medicalRecordsTable.date), asc(medicalRecordsTable.id)),
    withBees ? beeExport(farmId) : { beeColonies: [], beeTreatments: [] },
  ]);
  return { farmName: farm.name, holdingNumber: farm.holdingNumber, animals, medicalRecords, ...bees };
}

/**
 * Bienen for the export: the colonies and the Bestandsbuch of their varroa
 * treatments (date, colony and stand, product, amount, batch, where it came
 * from). Only for members who may see the Bienen module.
 */
async function beeExport(farmId: number) {
  const [beeColonies, beeTreatments] = await Promise.all([
    db
      .select({
        id: beeColoniesTable.id,
        name: beeColoniesTable.name,
        apiary: beeColoniesTable.apiary,
        status: beeColoniesTable.status,
        startedOn: beeColoniesTable.startedOn,
        endedOn: beeColoniesTable.endedOn,
        createdAt: beeColoniesTable.createdAt,
      })
      .from(beeColoniesTable)
      .where(eq(beeColoniesTable.farmId, farmId))
      .orderBy(asc(beeColoniesTable.name)),
    db
      .select({
        id: beeTreatmentsTable.id,
        date: beeTreatmentsTable.date,
        colonyName: beeColoniesTable.name,
        apiary: beeColoniesTable.apiary,
        method: beeTreatmentsTable.method,
        product: sql<string | null>`coalesce(${medicinesTable.name}, ${beeTreatmentsTable.product})`,
        dose: beeTreatmentsTable.dose,
        unit: beeTreatmentsTable.unit,
        batch: sql<string | null>`coalesce(${beeTreatmentsTable.batch}, ${medicinesTable.batch})`,
        source: medicinesTable.vet,
        notes: beeTreatmentsTable.notes,
      })
      .from(beeTreatmentsTable)
      .innerJoin(beeColoniesTable, eq(beeColoniesTable.id, beeTreatmentsTable.colonyId))
      .leftJoin(medicinesTable, eq(medicinesTable.id, beeTreatmentsTable.medicineId))
      .where(eq(beeTreatmentsTable.farmId, farmId))
      .orderBy(asc(beeTreatmentsTable.date), asc(beeTreatmentsTable.id)),
  ]);
  return { beeColonies: beeColonies.map(({ createdAt, ...c }) => ({ ...c, createdAt: createdAt.toISOString() })), beeTreatments };
}
