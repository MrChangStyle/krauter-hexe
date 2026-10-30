/**
 * What an account set up for itself: the modules it hides and whether it went
 * through the first-start assistant (docs/module.md), and which pushes it wants
 * when (docs/benachrichtigungen.md). The modules themselves live in the web
 * app; the server only keeps the choice.
 */

import { ModuleId, PushTopic, type ModuleId as Module, type PushTopic as Topic, type QuietHours } from '@workspace/api-zod';
import { ANIMAL_KINDS, db, userSettingsTable, type AnimalKind } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { organicTipsFor } from './farming';

const KNOWN = new Set<string>(Object.values(ModuleId));
const TOPICS = new Set<string>(Object.values(PushTopic));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface UserSettings {
  hiddenModules: Module[];
  onboarded: boolean;
  pushOff: Topic[];
  quietHours: QuietHours | null;
  seasonalCare: boolean;
  /** Bio (docs/bio.md): the account's own switch for organic plant advice. */
  organicTips: boolean;
  /** A farm of the account farms naturally or organically – its advice is organic anyway. */
  organicFarm: string | null;
  /** Meine Tierarten: animal kinds hidden in "Essbar für" and the Kräuter-Hexe. */
  hiddenAnimals: AnimalKind[];
}

/** Known ids only, each once – a module the app no longer has drops out. */
export function cleanModules(ids: readonly string[]): Module[] {
  return [...new Set(ids)].filter((m): m is Module => KNOWN.has(m));
}

/** Known animal kinds only, each once. */
export function cleanAnimals(ids: readonly string[]): AnimalKind[] {
  return [...new Set(ids)].filter((k): k is AnimalKind => (ANIMAL_KINDS as readonly string[]).includes(k));
}

export function cleanTopics(ids: readonly string[]): Topic[] {
  return [...new Set(ids)].filter((t): t is Topic => TOPICS.has(t));
}

function quiet(start: string | null | undefined, end: string | null | undefined): QuietHours | null {
  return start && end && HHMM.test(start) && HHMM.test(end) && start !== end ? { from: start, to: end } : null;
}

export async function getSettings(userId: string): Promise<UserSettings> {
  const [row] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId));
  return {
    hiddenModules: cleanModules(row?.hiddenModules ?? []),
    onboarded: !!row?.onboardedAt,
    pushOff: cleanTopics(row?.pushOff ?? []),
    quietHours: quiet(row?.quietStart, row?.quietEnd),
    seasonalCare: row?.seasonalCare ?? true,
    organicTips: row?.organicTips ?? false,
    organicFarm: (await organicTipsFor(userId)).farmName,
    hiddenAnimals: cleanAnimals(row?.hiddenAnimals ?? []),
  };
}

export async function setSettings(
  userId: string,
  input: { hiddenModules?: readonly string[]; onboarded?: boolean; pushOff?: readonly string[]; quietHours?: QuietHours | null; seasonalCare?: boolean; organicTips?: boolean; hiddenAnimals?: readonly string[] },
): Promise<UserSettings> {
  const set: Partial<typeof userSettingsTable.$inferInsert> = { updatedAt: new Date() };
  if (input.hiddenModules !== undefined) set.hiddenModules = cleanModules(input.hiddenModules);
  if (input.onboarded !== undefined) set.onboardedAt = input.onboarded ? new Date() : null;
  if (input.pushOff !== undefined) set.pushOff = cleanTopics(input.pushOff);
  if (input.seasonalCare !== undefined) set.seasonalCare = input.seasonalCare;
  if (input.organicTips !== undefined) set.organicTips = input.organicTips;
  if (input.hiddenAnimals !== undefined) set.hiddenAnimals = cleanAnimals(input.hiddenAnimals);
  if (input.quietHours !== undefined) {
    const q = input.quietHours && quiet(input.quietHours.from, input.quietHours.to);
    set.quietStart = q ? q.from : null;
    set.quietEnd = q ? q.to : null;
  }
  await db
    .insert(userSettingsTable)
    .values({ userId, ...set, hiddenModules: set.hiddenModules ?? [], pushOff: set.pushOff ?? [] })
    .onConflictDoUpdate({ target: userSettingsTable.userId, set });
  return getSettings(userId);
}

/** "HH:MM" in Berlin. */
export function berlinClock(now: Date): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

/** Inside the quiet time? It may cross midnight (22:00–07:00); the end is outside. */
export function inQuietHours(q: QuietHours | null, clock: string): boolean {
  if (!q) return false;
  return q.from < q.to ? clock >= q.from && clock < q.to : clock >= q.from || clock < q.to;
}

/**
 * Whether a push about `topic` may go to this account now. The predator alarm
 * (wildlife) ignores the quiet time – it is urgent exactly at night.
 */
export async function pushAllowed(userId: string, topic: Topic, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ pushOff: userSettingsTable.pushOff, quietStart: userSettingsTable.quietStart, quietEnd: userSettingsTable.quietEnd })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.userId, userId));
  if (!row) return true;
  if ((row.pushOff ?? []).includes(topic)) return false;
  return topic === 'wildlife' || !inQuietHours(quiet(row.quietStart, row.quietEnd), berlinClock(now));
}
