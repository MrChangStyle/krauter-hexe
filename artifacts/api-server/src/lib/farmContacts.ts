/**
 * Farm & Team – Wichtige Kontakte (docs/team.md): vet, team, Vertretung, the
 * farmer, family, emergency, authorities, suppliers. Every member reads them,
 * admins keep them.
 */

import { FARM_CONTACT_KINDS, db, farmContactsTable, type FarmContactKind } from '@workspace/db';
import { and, asc, count, eq } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';

export const MAX_CONTACTS = 200;

export interface FarmContactInput {
  kind: string;
  name: unknown;
  role?: unknown;
  phone?: unknown;
  email?: unknown;
  note?: unknown;
}

export interface FarmContact {
  id: number;
  kind: FarmContactKind;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
}

function values(input: FarmContactInput) {
  if (!(FARM_CONTACT_KINDS as readonly string[]).includes(input.kind)) throw new FarmDataError(400, 'Bitte wähle, wer das ist.');
  const phone = text(input.phone, 40, 'Die Telefonnummer');
  if (phone && !/^[+\d][\d\s/()-]{2,39}$/.test(phone)) throw new FarmDataError(400, 'Die Telefonnummer ist ungültig.');
  const email = text(input.email, 200, 'Die E-Mail-Adresse');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FarmDataError(400, 'Die E-Mail-Adresse ist ungültig.');
  return {
    kind: input.kind,
    name: text(input.name, 80, 'Der Name', true),
    role: text(input.role, 80, 'Die Aufgabe'),
    phone,
    email,
    note: text(input.note, 1000, 'Die Notiz'),
  };
}

const ORDER: Record<FarmContactKind, number> = Object.fromEntries(FARM_CONTACT_KINDS.map((k, i) => [k, i])) as Record<FarmContactKind, number>;

function toContact(row: typeof farmContactsTable.$inferSelect): FarmContact {
  return { id: row.id, kind: row.kind as FarmContactKind, name: row.name, role: row.role, phone: row.phone, email: row.email, note: row.note };
}

/** All contacts, grouped by kind in the order of FARM_CONTACT_KINDS, then by name. */
export async function listContacts(farmId: number): Promise<FarmContact[]> {
  const rows = await db.select().from(farmContactsTable).where(eq(farmContactsTable.farmId, farmId)).orderBy(asc(farmContactsTable.name), asc(farmContactsTable.id));
  return rows.map(toContact).sort((a, b) => (ORDER[a.kind] ?? 99) - (ORDER[b.kind] ?? 99));
}

export async function createContact(farmId: number, input: FarmContactInput): Promise<FarmContact[]> {
  const row = values(input);
  const [n] = await db.select({ n: count() }).from(farmContactsTable).where(eq(farmContactsTable.farmId, farmId));
  if ((n?.n ?? 0) >= MAX_CONTACTS) throw new FarmDataError(409, `Eine Farm hat höchstens ${MAX_CONTACTS} Kontakte.`);
  await db.insert(farmContactsTable).values({ farmId, ...row });
  return listContacts(farmId);
}

export async function updateContact(farmId: number, id: number, input: FarmContactInput): Promise<FarmContact[]> {
  const updated = await db
    .update(farmContactsTable)
    .set(values(input))
    .where(and(eq(farmContactsTable.id, id), eq(farmContactsTable.farmId, farmId)))
    .returning({ id: farmContactsTable.id });
  if (updated.length === 0) throw notFound();
  return listContacts(farmId);
}

export async function deleteContact(farmId: number, id: number): Promise<FarmContact[]> {
  const deleted = await db
    .delete(farmContactsTable)
    .where(and(eq(farmContactsTable.id, id), eq(farmContactsTable.farmId, farmId)))
    .returning({ id: farmContactsTable.id });
  if (deleted.length === 0) throw notFound();
  return listContacts(farmId);
}
