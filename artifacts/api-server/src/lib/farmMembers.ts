/**
 * Farms and their members ("Meine Farm", step 2).
 *
 * Rules that hold for every change:
 * - a farm always keeps at least one admin while it has members,
 * - a farm's last member cannot just leave – the farm is deleted instead
 *   (explicitly, with its name typed as confirmation),
 * - members are existing, approved, not blocked accounts, added by email,
 * - a Vertretung (stand-in) is a caretaker or guest with a last day of access;
 *   admins never expire, so a farm cannot lose its admin by a date.
 */

import {
  cameraEventsTable,
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmsTable,
  gardenBedsTable,
  usersTable,
  type FarmRole,
} from '@workspace/db';
import { and, asc, count, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';

import { addDays } from './feedSeason';
import { deleteImageByUrl } from './imageStorage';
import { berlinDay } from './monitoring';

export class FarmError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FarmError';
  }
}

export const DEFAULT_FARM_NAME = 'Meine Farm';
/** Farms one account may run as admin – a public app needs a ceiling. */
export const MAX_ADMIN_FARMS = 5;
/** Member additions per account and 24 hours (also slows email probing). */
export const MAX_INVITES_PER_DAY = 30;

export function normalizeFarmName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 60) {
    throw new FarmError(400, 'Der Name muss 1 bis 60 Zeichen lang sein.');
  }
  return name;
}

/**
 * Gives an account its first farm if it has none yet. Safe to call on every
 * visit and from two tabs at once: a per-account lock makes the check and the
 * creation one step.
 */
export async function ensureOwnFarm(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('farm-ensure'), hashtext(${userId}))`);
    const [existing] = await tx
      .select({ id: farmMembershipsTable.id })
      .from(farmMembershipsTable)
      .where(eq(farmMembershipsTable.userId, userId))
      .limit(1);
    if (existing) return;
    const [farm] = await tx
      .insert(farmsTable)
      .values({ name: DEFAULT_FARM_NAME })
      .returning({ id: farmsTable.id });
    await tx.insert(farmMembershipsTable).values({ farmId: farm!.id, userId, role: 'admin' });
  });
}

/** A further farm, run by the account as admin. */
export async function createFarm(userId: string, rawName: unknown): Promise<number> {
  const name = normalizeFarmName(rawName);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('farm-ensure'), hashtext(${userId}))`);
    const [admins] = await tx
      .select({ n: count() })
      .from(farmMembershipsTable)
      // The Demo-Hof (docs/demo.md) does not count.
      .innerJoin(farmsTable, eq(farmsTable.id, farmMembershipsTable.farmId))
      .where(and(eq(farmMembershipsTable.userId, userId), eq(farmMembershipsTable.role, 'admin'), eq(farmsTable.isDemo, false)));
    if ((admins?.n ?? 0) >= MAX_ADMIN_FARMS) {
      throw new FarmError(409, `Du kannst höchstens ${MAX_ADMIN_FARMS} Farmen als Admin führen.`);
    }
    const [farm] = await tx.insert(farmsTable).values({ name }).returning({ id: farmsTable.id });
    await tx.insert(farmMembershipsTable).values({ farmId: farm!.id, userId, role: 'admin' });
    return farm!.id;
  });
}

export async function renameFarm(farmId: number, rawName: unknown): Promise<string> {
  const name = normalizeFarmName(rawName);
  await db.update(farmsTable).set({ name }).where(eq(farmsTable.id, farmId));
  return name;
}

/** Deletes a farm with all its animals and records; the name confirms it. */
export async function deleteFarm(farmId: number, confirmName: unknown): Promise<void> {
  const [farm] = await db.select({ name: farmsTable.name }).from(farmsTable).where(eq(farmsTable.id, farmId));
  if (!farm) throw new FarmError(404, 'Farm nicht gefunden.');
  if (typeof confirmName !== 'string' || confirmName.trim() !== farm.name) {
    throw new FarmError(400, 'Bitte gib zur Bestätigung den Namen der Farm genau so ein.');
  }
  const photos = await farmPhotoUrls([farmId]);
  await db.delete(farmsTable).where(eq(farmsTable.id, farmId));
  deleteFarmPhotos(photos);
}

/** Cloudinary URLs of the animal, camera and bed photos of these farms. */
export async function farmPhotoUrls(
  farmIds: number[],
  executor: Pick<typeof db, 'select'> = db,
): Promise<string[]> {
  if (farmIds.length === 0) return [];
  const animals = await executor
    .select({ url: farmAnimalsTable.imageUrl })
    .from(farmAnimalsTable)
    .where(and(inArray(farmAnimalsTable.farmId, farmIds), isNotNull(farmAnimalsTable.imageUrl)));
  const cameraEvents = await executor
    .select({ url: cameraEventsTable.imageUrl })
    .from(cameraEventsTable)
    .where(and(inArray(cameraEventsTable.farmId, farmIds), isNotNull(cameraEventsTable.imageUrl)));
  const beds = await executor
    .select({ url: gardenBedsTable.photoUrl })
    .from(gardenBedsTable)
    .where(and(inArray(gardenBedsTable.farmId, farmIds), isNotNull(gardenBedsTable.photoUrl)));
  return [...animals, ...cameraEvents, ...beds].map((r) => r.url!).filter(Boolean);
}

/**
 * Removes photos of deleted farms from Cloudinary – after the database change
 * is committed, best effort (a leftover file costs a little storage, nothing
 * more).
 */
export function deleteFarmPhotos(urls: string[]): void {
  for (const url of urls) void deleteImageByUrl(url).catch(() => false);
}

export interface FarmMember {
  userId: string;
  displayName: string;
  /** Only shown to admins – they manage who belongs to the farm. */
  email: string | null;
  role: FarmRole;
  isMe: boolean;
  /** Vertretung: last day of access, or null. */
  accessUntil: string | null;
  /** Modul-Freigaben: granted farm modules, null = all (always null for admins). */
  modules: string[] | null;
}

/** A stand-in's last day: today up to a year ahead; never for admins. */
export function accessUntilValue(raw: string | null | undefined, role: FarmRole, today = berlinDay()): string | null {
  if (raw == null || raw === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw < today || raw > addDays(today, 365)) {
    throw new FarmError(400, 'Die Vertretung endet frühestens heute und höchstens in einem Jahr.');
  }
  if (role === 'admin') throw new FarmError(400, 'Eine Vertretung ist Betreuer oder Gast, kein Admin.');
  return raw;
}

/** Memberships whose last day has passed – gone, like a member who left. */
export async function removeExpiredMemberships(today = berlinDay()): Promise<number> {
  const removed = await db
    .delete(farmMembershipsTable)
    .where(and(isNotNull(farmMembershipsTable.accessUntil), lt(farmMembershipsTable.accessUntil, today)))
    .returning({ id: farmMembershipsTable.id });
  return removed.length;
}

function displayNameOf(u: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
}): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return full || u.username || u.email?.split('@')[0] || 'Unbekannt';
}

export async function listMembers(
  farmId: number,
  viewer: { userId: string; role: FarmRole },
): Promise<FarmMember[]> {
  const rows = await db
    .select({
      userId: farmMembershipsTable.userId,
      role: farmMembershipsTable.role,
      accessUntil: farmMembershipsTable.accessUntil,
      modules: farmMembershipsTable.modules,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      username: usersTable.username,
      email: usersTable.email,
    })
    .from(farmMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, farmMembershipsTable.userId))
    .where(eq(farmMembershipsTable.farmId, farmId))
    .orderBy(asc(farmMembershipsTable.createdAt), asc(farmMembershipsTable.id));
  return rows.map((r) => ({
    userId: r.userId,
    displayName: displayNameOf(r),
    email: viewer.role === 'admin' ? r.email : null,
    role: r.role,
    isMe: r.userId === viewer.userId,
    accessUntil: r.accessUntil,
    modules: r.role === 'admin' ? null : r.modules,
  }));
}

// In memory like the login lock-out; a restart resetting it is acceptable.
const invitesByActor = new Map<string, number[]>();
const DAY_MS = 24 * 60 * 60 * 1000;

export function resetInviteCounters(): void {
  invitesByActor.clear();
}

/** Adds an existing, approved account by its email address. */
export async function addMember(
  farmId: number,
  actorId: string,
  rawEmail: unknown,
  role: FarmRole,
  rawAccessUntil?: string | null,
): Promise<void> {
  const accessUntil = accessUntilValue(rawAccessUntil, role);
  const now = Date.now();
  const recent = (invitesByActor.get(actorId) ?? []).filter((t) => now - t < DAY_MS);
  if (recent.length >= MAX_INVITES_PER_DAY) {
    throw new FarmError(429, 'Du hast heute schon sehr viele Mitglieder hinzugefügt. Bitte versuche es morgen erneut.');
  }
  invitesByActor.set(actorId, [...recent, now]);

  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!email || email.length > 254) throw new FarmError(400, 'Bitte gib eine E-Mail-Adresse ein.');

  const [user] = await db
    .select({ id: usersTable.id, approved: usersTable.approved, blockedAt: usersTable.blockedAt })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`);
  if (!user || !user.approved || user.blockedAt) {
    throw new FarmError(
      404,
      'Zu dieser E-Mail-Adresse gibt es kein aktives Konto. Die Person muss sich zuerst bei Little Farming registrieren.',
    );
  }

  const inserted = await db
    .insert(farmMembershipsTable)
    .values({ farmId, userId: user.id, role, accessUntil })
    .onConflictDoNothing()
    .returning({ id: farmMembershipsTable.id });
  if (inserted.length === 0) throw new FarmError(409, 'Diese Person gehört schon zur Farm.');
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function adminsOf(tx: Tx, farmId: number): Promise<string[]> {
  const rows = await tx
    .select({ userId: farmMembershipsTable.userId })
    .from(farmMembershipsTable)
    .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.role, 'admin')));
  return rows.map((r) => r.userId);
}

/**
 * Changes a member's role – and the end of a Vertretung (undefined: as it is;
 * becoming admin ends it) – never leaving the farm without an admin.
 */
export async function changeRole(farmId: number, targetUserId: string, role: FarmRole, rawAccessUntil?: string | null): Promise<void> {
  const accessUntil = rawAccessUntil === undefined ? undefined : accessUntilValue(rawAccessUntil, role);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('farm-members'), ${farmId})`);
    const [target] = await tx
      .select({ role: farmMembershipsTable.role })
      .from(farmMembershipsTable)
      .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, targetUserId)));
    if (!target) throw new FarmError(404, 'Dieses Mitglied gibt es auf der Farm nicht.');
    if (target.role === 'admin' && role !== 'admin') {
      const admins = await adminsOf(tx, farmId);
      if (admins.length <= 1) {
        throw new FarmError(409, 'Die Farm braucht mindestens einen Admin. Mach zuerst jemand anderen zum Admin.');
      }
    }
    await tx
      .update(farmMembershipsTable)
      .set({ role, ...(role === 'admin' ? { accessUntil: null } : accessUntil !== undefined && { accessUntil }) })
      .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, targetUserId)));
  });
}

/**
 * Removes a member – or lets a member leave (actor === target). Admins may
 * remove anyone; everyone else only themselves.
 */
export async function removeMember(
  farmId: number,
  actor: { userId: string; role: FarmRole },
  targetUserId: string,
): Promise<void> {
  const leaving = actor.userId === targetUserId;
  if (!leaving && actor.role !== 'admin') {
    throw new FarmError(403, 'Nur Admins können andere Mitglieder entfernen.');
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('farm-members'), ${farmId})`);
    const members = await tx
      .select({ userId: farmMembershipsTable.userId, role: farmMembershipsTable.role })
      .from(farmMembershipsTable)
      .where(eq(farmMembershipsTable.farmId, farmId));
    const target = members.find((m) => m.userId === targetUserId);
    if (!target) throw new FarmError(404, 'Dieses Mitglied gibt es auf der Farm nicht.');
    if (members.length === 1) {
      throw new FarmError(409, 'Du bist das letzte Mitglied. Lösche stattdessen die Farm.');
    }
    if (target.role === 'admin' && members.filter((m) => m.role === 'admin').length === 1) {
      throw new FarmError(409, 'Die Farm braucht mindestens einen Admin. Mach zuerst jemand anderen zum Admin.');
    }
    await tx
      .delete(farmMembershipsTable)
      .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, targetUserId)));
  });
}

/** Modul-Freigaben: which farm modules a member may use (null = all). Admins always have all. */
export async function setMemberModules(farmId: number, targetUserId: string, modules: string[] | null): Promise<void> {
  const updated = await db
    .update(farmMembershipsTable)
    .set({ modules })
    .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, targetUserId)))
    .returning({ role: farmMembershipsTable.role });
  if (updated.length === 0) throw new FarmError(404, 'Dieses Mitglied gibt es auf der Farm nicht.');
}
