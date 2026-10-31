/**
 * Who may create an account, and how fast.
 *
 * The app started as a private family app: new accounts waited until the owner
 * approved them. With OPEN_REGISTRATION=true it becomes a public app – new
 * accounts can use it right away. Every scan costs money on the owner's Gemini
 * key, so open sign-up comes with brakes that do not depend on the owner
 * watching: a cap per client address and a cap for the whole app per day.
 */

import { db, usersTable } from '@workspace/db';
import { gte, sql } from 'drizzle-orm';

/**
 * Version of Datenschutzerklärung + Nutzungsbedingungen a new account agrees
 * to. Bump it whenever those texts change materially; the stored value tells
 * which version each account accepted.
 */
export const LEGAL_VERSION = '2026-10-31';

/** True when new accounts may use the app without the owner's approval. */
export function isOpenRegistration(): boolean {
  return process.env['OPEN_REGISTRATION'] === 'true';
}

// ── Per-address limit ────────────────────────────────────────────────────────
// In memory, like the login lock-out: a restart clearing it is acceptable,
// the daily cap below is the durable backstop.

const ADDRESS_WINDOW_MS = 60 * 60 * 1000;
export const MAX_ACCOUNTS_PER_ADDRESS = 5;
const createdByAddress = new Map<string, number[]>();

function recentFor(address: string, now: number): number[] {
  const recent = (createdByAddress.get(address) ?? []).filter(
    (at) => now - at < ADDRESS_WINDOW_MS,
  );
  if (recent.length > 0) createdByAddress.set(address, recent);
  else createdByAddress.delete(address);
  return recent;
}

/** True when this address may create another account right now. */
export function addressMayRegister(address: string, now: number = Date.now()): boolean {
  return recentFor(address, now).length < MAX_ACCOUNTS_PER_ADDRESS;
}

/** Counts one created account against the address. */
export function recordRegistration(address: string, now: number = Date.now()): void {
  createdByAddress.set(address, [...recentFor(address, now), now]);
}

/** Test hook: forget all counted registrations. */
export function resetRegistrationCounters(): void {
  createdByAddress.clear();
}

// ── Daily cap for the whole app ──────────────────────────────────────────────

const DEFAULT_DAILY_CAP = 50;

/** New accounts allowed per rolling 24 hours (REGISTRATION_DAILY_CAP). */
export function registrationDailyCap(): number {
  const raw = Number(process.env['REGISTRATION_DAILY_CAP']);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_DAILY_CAP;
}

/**
 * True while fewer than the daily cap of accounts were created in the last
 * 24 hours. Only enforced with open registration: in family mode every new
 * account waits for approval anyway and costs nothing.
 */
export async function dailyCapAllowsRegistration(now: number = Date.now()): Promise<boolean> {
  if (!isOpenRegistration()) return true;
  const since = new Date(now - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(gte(usersTable.createdAt, since));
  return (row?.count ?? 0) < registrationDailyCap();
}
