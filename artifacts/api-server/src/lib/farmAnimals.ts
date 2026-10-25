/**
 * Herds and animals of a farm ("Meine Farm", step 3).
 *
 * Every function takes the farmId from requireFarm and filters by it – an id
 * from another farm behaves exactly like an id that does not exist. Animals
 * are archived, never deleted, so their medical history stays exportable.
 */

import {
  db,
  farmAnimalsTable,
  herdsTable,
  type AnimalSex,
  type FarmSpecies,
} from '@workspace/db';
import { and, asc, eq, like, sql } from 'drizzle-orm';

import { deleteImageByUrl, uploadImage } from './imageStorage';

export class FarmDataError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FarmDataError';
  }
}

export const notFound = () => new FarmDataError(404, 'Nicht gefunden.');

export function text(raw: unknown, max: number, label: string, required: true): string;
export function text(raw: unknown, max: number, label: string, required?: false): string | null;
export function text(raw: unknown, max: number, label: string, required = false): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    if (required) throw new FarmDataError(400, `${label} fehlt.`);
    return null;
  }
  if (value.length > max) throw new FarmDataError(400, `${label} ist zu lang (höchstens ${max} Zeichen).`);
  return value;
}

/**
 * YYYY-MM-DD, a real calendar day, not in the future and not before 1950.
 * `label` names the field in the messages ("Geburtsdatum", "Datum").
 */
export function validDate(raw: unknown, label: string, today: Date = new Date()): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new FarmDataError(400, `Bitte gib das ${label} an.`);
  }
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new FarmDataError(400, `Das ${label} ist ungültig.`);
  }
  if (raw > today.toISOString().slice(0, 10)) {
    throw new FarmDataError(400, `Das ${label} liegt in der Zukunft.`);
  }
  if (raw < '1950-01-01') throw new FarmDataError(400, `Das ${label} ist ungültig.`);
  return raw;
}

export function validBirthDate(raw: unknown, today: Date = new Date()): string {
  return validDate(raw, 'Geburtsdatum', today);
}

// ── Herds ────────────────────────────────────────────────────────────────────

export async function listHerds(farmId: number) {
  const animalCount = sql<number>`(
    SELECT count(*)::int FROM ${farmAnimalsTable}
    WHERE ${farmAnimalsTable.herdId} = ${herdsTable.id} AND ${farmAnimalsTable.archivedAt} IS NULL
  )`;
  return db
    .select({
      id: herdsTable.id,
      name: herdsTable.name,
      species: herdsTable.species,
      notes: herdsTable.notes,
      animalCount,
    })
    .from(herdsTable)
    .where(eq(herdsTable.farmId, farmId))
    .orderBy(asc(herdsTable.name));
}

async function herdById(farmId: number, herdId: number) {
  const herds = await listHerds(farmId);
  const herd = herds.find((h) => h.id === herdId);
  if (!herd) throw notFound();
  return herd;
}

export async function createHerd(
  farmId: number,
  input: { name: unknown; species: FarmSpecies; notes?: unknown },
) {
  const [herd] = await db
    .insert(herdsTable)
    .values({
      farmId,
      name: text(input.name, 60, 'Der Name', true),
      species: input.species,
      notes: text(input.notes, 2000, 'Die Notiz'),
    })
    .returning({ id: herdsTable.id });
  return herdById(farmId, herd!.id);
}

export async function updateHerd(
  farmId: number,
  herdId: number,
  input: { name: unknown; species: FarmSpecies; notes?: unknown },
) {
  const updated = await db
    .update(herdsTable)
    .set({
      name: text(input.name, 60, 'Der Name', true),
      species: input.species,
      notes: text(input.notes, 2000, 'Die Notiz'),
    })
    .where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)))
    .returning({ id: herdsTable.id });
  if (updated.length === 0) throw notFound();
  return herdById(farmId, herdId);
}

/** The animals stay, without herd (ON DELETE SET NULL). */
export async function deleteHerd(farmId: number, herdId: number): Promise<void> {
  const deleted = await db
    .delete(herdsTable)
    .where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)))
    .returning({ id: herdsTable.id });
  if (deleted.length === 0) throw notFound();
}

// ── Animals ──────────────────────────────────────────────────────────────────

const animalColumns = {
  id: farmAnimalsTable.id,
  herdId: farmAnimalsTable.herdId,
  herdName: herdsTable.name,
  name: farmAnimalsTable.name,
  species: farmAnimalsTable.species,
  breed: farmAnimalsTable.breed,
  birthDate: farmAnimalsTable.birthDate,
  sex: farmAnimalsTable.sex,
  registrationNumber: farmAnimalsTable.registrationNumber,
  imageUrl: farmAnimalsTable.imageUrl,
  notes: farmAnimalsTable.notes,
  archivedAt: farmAnimalsTable.archivedAt,
  createdAt: farmAnimalsTable.createdAt,
};

// The herd join also checks the farm, so a herd can never leak across.
const sameFarmHerd = and(
  eq(herdsTable.id, farmAnimalsTable.herdId),
  eq(herdsTable.farmId, farmAnimalsTable.farmId),
);

export async function listAnimals(farmId: number) {
  return db
    .select(animalColumns)
    .from(farmAnimalsTable)
    .leftJoin(herdsTable, sameFarmHerd)
    .where(eq(farmAnimalsTable.farmId, farmId))
    .orderBy(asc(farmAnimalsTable.name), asc(farmAnimalsTable.id));
}

export async function getAnimal(farmId: number, animalId: number) {
  const [animal] = await db
    .select(animalColumns)
    .from(farmAnimalsTable)
    .leftJoin(herdsTable, sameFarmHerd)
    .where(and(eq(farmAnimalsTable.farmId, farmId), eq(farmAnimalsTable.id, animalId)));
  if (!animal) throw notFound();
  return animal;
}

/** Name of one animal, and the group name to suggest. */
export const NAMES: Record<FarmSpecies, { one: string; group: string; prefix: string }> = {
  poultry: { one: 'Huhn', group: 'Hühner', prefix: 'H' },
  rabbit: { one: 'Kaninchen', group: 'Kaninchen', prefix: 'K' },
  guineaPig: { one: 'Meerschweinchen', group: 'Meerschweinchen', prefix: 'M' },
  goat: { one: 'Ziege', group: 'Ziegen', prefix: 'Z' },
  sheep: { one: 'Schaf', group: 'Schafe', prefix: 'S' },
  horse: { one: 'Pferd', group: 'Pferde', prefix: 'P' },
  cattle: { one: 'Rind', group: 'Rinder', prefix: 'R' },
  pig: { one: 'Schwein', group: 'Schweine', prefix: 'SW' },
  cat: { one: 'Katze', group: 'Katzen', prefix: 'KA' },
  dog: { one: 'Hund', group: 'Hunde', prefix: 'HU' },
  other: { one: 'Tier', group: 'Tiere', prefix: 'T' },
};

export interface AnimalInput {
  name?: unknown;
  species: FarmSpecies;
  breed?: unknown;
  birthDate: unknown;
  sex: AnimalSex;
  registrationNumber?: unknown;
  herdId?: number | null;
  notes?: unknown;
}

/**
 * Without a name the animal gets one like the quick start's – "Ziege 3", the
 * first number not used on the farm yet – so lists, push and export always
 * have something to show.
 */
async function defaultName(farmId: number, species: FarmSpecies): Promise<string> {
  const one = NAMES[species].one;
  const used = new Set(
    (
      await db
        .select({ name: farmAnimalsTable.name })
        .from(farmAnimalsTable)
        .where(and(eq(farmAnimalsTable.farmId, farmId), like(farmAnimalsTable.name, `${one} %`)))
    ).map((r) => r.name),
  );
  let k = 1;
  while (used.has(`${one} ${k}`)) k += 1;
  return `${one} ${k}`;
}

async function animalValues(farmId: number, input: AnimalInput, current?: string) {
  // A herd id must belong to this very farm.
  if (input.herdId != null) {
    const [herd] = await db
      .select({ id: herdsTable.id })
      .from(herdsTable)
      .where(and(eq(herdsTable.id, input.herdId), eq(herdsTable.farmId, farmId)));
    if (!herd) throw new FarmDataError(400, 'Diese Herde gibt es auf der Farm nicht.');
  }
  return {
    // Optional: a new animal gets a name like "Ziege 3", an edited one keeps its own.
    name: text(input.name, 60, 'Der Name') ?? current ?? (await defaultName(farmId, input.species)),
    species: input.species,
    breed: text(input.breed, 60, 'Die Rasse'),
    birthDate: validBirthDate(input.birthDate),
    sex: input.sex,
    // Optional: empty means none (yet).
    registrationNumber: text(input.registrationNumber, 40, 'Die Ring- bzw. Ohrmarkennummer'),
    herdId: input.herdId ?? null,
    notes: text(input.notes, 2000, 'Die Notiz'),
  };
}

function isDuplicateRegistration(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint ?? e?.cause?.constraint;
  return code === '23505' && (constraint === undefined || constraint === 'farm_animals_farm_registration_unique');
}

const duplicate = () =>
  new FarmDataError(409, 'Diese Ring- bzw. Ohrmarkennummer gibt es auf der Farm schon.');

export async function createAnimal(farmId: number, input: AnimalInput) {
  const values = await animalValues(farmId, input);
  try {
    const [animal] = await db
      .insert(farmAnimalsTable)
      .values({ farmId, ...values })
      .returning({ id: farmAnimalsTable.id });
    return getAnimal(farmId, animal!.id);
  } catch (err) {
    if (isDuplicateRegistration(err)) throw duplicate();
    throw err;
  }
}

export async function updateAnimal(farmId: number, animalId: number, input: AnimalInput) {
  const [current] = await db
    .select({ name: farmAnimalsTable.name })
    .from(farmAnimalsTable)
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (!current) throw notFound();
  const values = await animalValues(farmId, input, current.name);
  try {
    const updated = await db
      .update(farmAnimalsTable)
      .set(values)
      .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)))
      .returning({ id: farmAnimalsTable.id });
    if (updated.length === 0) throw notFound();
  } catch (err) {
    if (isDuplicateRegistration(err)) throw duplicate();
    throw err;
  }
  return getAnimal(farmId, animalId);
}

export async function setArchived(farmId: number, animalId: number, archived: boolean) {
  const updated = await db
    .update(farmAnimalsTable)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)))
    .returning({ id: farmAnimalsTable.id });
  if (updated.length === 0) throw notFound();
  return getAnimal(farmId, animalId);
}

export const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_PHOTO_LENGTH = 8 * 1024 * 1024;

/**
 * Uploads the animal's photo to Cloudinary and replaces the old one. The old
 * file is removed only after the new URL is saved.
 */
export async function setPhoto(farmId: number, animalId: number, imageData: unknown) {
  if (typeof imageData !== 'string' || imageData.length > MAX_PHOTO_LENGTH || !PHOTO_RE.test(imageData)) {
    throw new FarmDataError(400, 'Das ist kein gültiges Foto.');
  }
  const current = await getAnimal(farmId, animalId);
  let url: string;
  try {
    url = await uploadImage(imageData);
  } catch {
    throw new FarmDataError(502, 'Das Foto konnte gerade nicht gespeichert werden. Bitte versuche es später erneut.');
  }
  await db
    .update(farmAnimalsTable)
    .set({ imageUrl: url })
    .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
  if (current.imageUrl && current.imageUrl !== url) {
    void deleteImageByUrl(current.imageUrl).catch(() => false);
  }
  return getAnimal(farmId, animalId);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `n` registration numbers free on this farm: H-1, H-2, … continuing after existing ones. */
export async function freeNumbers(tx: Tx, farmId: number, prefix: string, n: number): Promise<{ k: number; nr: string }[]> {
  const taken = new Set(
    (
      await tx
        .select({ nr: farmAnimalsTable.registrationNumber })
        .from(farmAnimalsTable)
        .where(and(eq(farmAnimalsTable.farmId, farmId), like(farmAnimalsTable.registrationNumber, `${prefix}-%`)))
    ).map((r) => r.nr),
  );
  const out: { k: number; nr: string }[] = [];
  for (let k = 1; out.length < n; k++) {
    const nr = `${prefix}-${k}`;
    if (!taken.has(nr)) out.push({ k, nr });
  }
  return out;
}
