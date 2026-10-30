/**
 * Betrieb: error monitoring, the status notice and daily usage counts – all
 * inside the app's own database, no outside service.
 *
 * Errors are grouped by a fingerprint (source, message with numbers and ids
 * blanked, first own stack frame) and counted; the app owner sees the groups
 * in "Mehr" and gets a push for a new or returning group (at most once an hour
 * per group). Stored is only what helps to find the bug: no user, no IP, no
 * request body. Usage is daily totals only.
 */

import { createHash } from 'node:crypto';
import { appStatusTable, db, errorGroupsTable, usageDailyTable, usersTable } from '@workspace/db';
import { and, asc, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import { logger } from './logger';

/** Berlin calendar day, YYYY-MM-DD. */
export function berlinDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// ── Usage ────────────────────────────────────────────────────────────────────

export const USAGE_METRICS = ['active_users', 'ai_actions', 'ai_timeouts', 'errors'] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

/** Adds to today's total of a metric. Never throws. */
export async function bumpUsage(metric: UsageMetric, by = 1): Promise<void> {
  try {
    await db
      .insert(usageDailyTable)
      .values({ day: berlinDay(), metric, value: by })
      .onConflictDoUpdate({ target: [usageDailyTable.day, usageDailyTable.metric], set: { value: sql`${usageDailyTable.value} + ${by}` } });
  } catch (err) {
    logger.warn({ err }, 'Usage count failed');
  }
}

/** Counts an approved user once per day as active. Never throws. */
export async function markActive(user: { id: string; approved: boolean; lastActiveOn: string | null }): Promise<void> {
  const today = berlinDay();
  if (!user.approved || user.lastActiveOn === today) return;
  try {
    const updated = await db
      .update(usersTable)
      .set({ lastActiveOn: today })
      .where(and(eq(usersTable.id, user.id), sql`${usersTable.lastActiveOn} IS DISTINCT FROM ${today}`))
      .returning({ id: usersTable.id });
    if (updated.length > 0) await bumpUsage('active_users');
  } catch (err) {
    logger.warn({ err }, 'Activity mark failed');
  }
}

export interface UsageDay {
  day: string;
  activeUsers: number;
  newUsers: number;
  aiActions: number;
  aiTimeouts: number;
  errors: number;
}

/** The last days, newest first (owner). */
export async function usageSummary(days = 14): Promise<UsageDay[]> {
  const from = berlinDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await db.select().from(usageDailyTable).where(gte(usageDailyTable.day, from));
  const signups = await db
    .select({ day: sql<string>`to_char(${usersTable.createdAt} AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(gte(usersTable.createdAt, new Date(Date.now() - days * 86_400_000)))
    .groupBy(sql`1`);
  const out: UsageDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = berlinDay(new Date(Date.now() - i * 86_400_000));
    const v = (m: UsageMetric) => rows.find((r) => r.day === day && r.metric === m)?.value ?? 0;
    out.push({ day, activeUsers: v('active_users'), newUsers: signups.find((s) => s.day === day)?.n ?? 0, aiActions: v('ai_actions'), aiTimeouts: v('ai_timeouts'), errors: v('errors') });
  }
  return out;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export interface ErrorReport {
  source: 'server' | 'client';
  message: string;
  stack?: string | null;
  location?: string | null;
  release?: string | null;
}

/** Numbers, ids, hashes and quoted values vary – the kind of error does not. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hash>')
    .replace(/"[^"]{0,200}"/g, '"…"')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** "/api/farms/12/beds/7?x" → "/api/farms/:id/beds/:id" */
export function normalizePath(path: string): string {
  return path
    .split('?')[0]!
    .split('#')[0]!
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .slice(0, 200);
}

/** First stack frame of our own code (not node internals or dependencies). */
export function topFrame(stack: string | null | undefined): string | null {
  const frames = (stack ?? '').split('\n').filter((l) => /^\s*at /.test(l));
  const own = frames.find((l) => !/node_modules|node:internal|\(native\)/.test(l)) ?? frames[0];
  return own ? own.trim().replace(/:\d+:\d+\)?$/, '').replace(/\?[^)\s]*/, '').slice(0, 200) : null;
}

export function fingerprint(report: ErrorReport): string {
  const key = [report.source, normalizeMessage(report.message), topFrame(report.stack) ?? report.location ?? ''].join('|');
  return createHash('sha1').update(key).digest('hex');
}

const pending = new Map<string, { report: ErrorReport; count: number }>();
let flushTimer: NodeJS.Timeout | null = null;
const NOTIFY_EVERY_MS = 60 * 60 * 1000;

/**
 * Notes an error; written in a batch a moment later, so a burst of the same
 * error costs one query. Never throws.
 */
export function recordError(report: ErrorReport): void {
  try {
    const fp = fingerprint(report);
    const entry = pending.get(fp);
    if (entry) entry.count += 1;
    else if (pending.size < 200) pending.set(fp, { report, count: 1 });
    if (!flushTimer) {
      flushTimer = setTimeout(() => void flushErrors(), 2_000);
      flushTimer.unref();
    }
  } catch {
    /* monitoring must never break the app */
  }
}

async function notifyOwner(message: string, source: string, again: boolean): Promise<void> {
  const [owner] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isOwner, true));
  if (!owner) return;
  const { sendPushToUser } = await import('./webPush');
  await sendPushToUser(owner.id, { topic: 'admin',
    title: again ? 'Fehler wieder aufgetreten' : 'Neuer Fehler in Little Farming',
    body: `${source === 'client' ? 'App' : 'Server'}: ${message.slice(0, 140)}`,
    tag: 'error-monitor',
    url: '/mehr',
  });
}

/** Writes what recordError collected. */
export async function flushErrors(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const batch = [...pending.entries()];
  pending.clear();
  let total = 0;
  for (const [fp, { report, count }] of batch) {
    total += count;
    try {
      const [before] = await db
        .select({ resolvedAt: errorGroupsTable.resolvedAt, notifiedAt: errorGroupsTable.notifiedAt })
        .from(errorGroupsTable)
        .where(eq(errorGroupsTable.fingerprint, fp));
      await db
        .insert(errorGroupsTable)
        .values({
          fingerprint: fp,
          source: report.source,
          message: report.message.slice(0, 500),
          location: report.location?.slice(0, 200) ?? null,
          stack: report.stack?.slice(0, 4000) ?? null,
          release: report.release?.slice(0, 40) ?? null,
          count,
        })
        .onConflictDoUpdate({
          target: errorGroupsTable.fingerprint,
          set: {
            count: sql`${errorGroupsTable.count} + ${count}`,
            lastSeen: new Date(),
            resolvedAt: null,
            release: report.release?.slice(0, 40) ?? sql`${errorGroupsTable.release}`,
            stack: report.stack?.slice(0, 4000) ?? sql`${errorGroupsTable.stack}`,
          },
        });
      const isNew = !before;
      const reopened = !!before?.resolvedAt;
      const quiet = !before?.notifiedAt || Date.now() - before.notifiedAt.getTime() > NOTIFY_EVERY_MS;
      if ((isNew || reopened) && quiet) {
        await db.update(errorGroupsTable).set({ notifiedAt: new Date() }).where(eq(errorGroupsTable.fingerprint, fp));
        await notifyOwner(report.message, report.source, reopened);
      }
    } catch (err) {
      // warn, not error: an error here would be recorded again.
      logger.warn({ err }, 'Error monitor write failed');
    }
  }
  if (total > 0) await bumpUsage('errors', total);
}

export async function listErrorGroups() {
  const rows = await db
    .select()
    .from(errorGroupsTable)
    .orderBy(sql`${errorGroupsTable.resolvedAt} IS NOT NULL`, desc(errorGroupsTable.lastSeen))
    .limit(100);
  return rows.map((r) => ({
    fingerprint: r.fingerprint,
    source: r.source,
    message: r.message,
    location: r.location,
    stack: r.stack,
    release: r.release,
    count: r.count,
    firstSeen: r.firstSeen.toISOString(),
    lastSeen: r.lastSeen.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

export async function resolveErrorGroup(fp: string): Promise<boolean> {
  const updated = await db
    .update(errorGroupsTable)
    .set({ resolvedAt: new Date() })
    .where(eq(errorGroupsTable.fingerprint, fp))
    .returning({ fp: errorGroupsTable.fingerprint });
  return updated.length > 0;
}

/** Old resolved groups and old daily totals go; run with the hourly housekeeping. */
export async function cleanupMonitoring(): Promise<void> {
  await db
    .delete(errorGroupsTable)
    .where(and(isNotNull(errorGroupsTable.resolvedAt), lt(errorGroupsTable.lastSeen, new Date(Date.now() - 90 * 86_400_000))));
  await db.delete(usageDailyTable).where(lt(usageDailyTable.day, berlinDay(new Date(Date.now() - 400 * 86_400_000))));
}

// ── Status notice ────────────────────────────────────────────────────────────

export type StatusLevel = 'info' | 'warning';

export async function getStatus(): Promise<{ message: string | null; level: StatusLevel; updatedAt: string | null }> {
  const [row] = await db.select().from(appStatusTable).where(eq(appStatusTable.id, 1)).orderBy(asc(appStatusTable.id));
  return { message: row?.message ?? null, level: (row?.level as StatusLevel) ?? 'info', updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function setStatus(message: string | null, level: StatusLevel) {
  const text = message?.trim().slice(0, 300) || null;
  await db
    .insert(appStatusTable)
    .values({ id: 1, message: text, level })
    .onConflictDoUpdate({ target: appStatusTable.id, set: { message: text, level, updatedAt: new Date() } });
  return getStatus();
}

// ── Wiring ───────────────────────────────────────────────────────────────────

const RELEASE = (process.env['RENDER_GIT_COMMIT'] ?? process.env['RELEASE'] ?? '').slice(0, 7) || null;

/**
 * Turns logger.error/fatal calls into error reports. Skips what is recorded
 * elsewhere (`captured`), and pino-http's own summary of a failed request.
 */
export function errorFromLog(obj: Record<string, unknown> | null, msg: string | undefined): ErrorReport | null {
  if (obj?.['captured'] === true || msg === 'request errored') return null;
  const err = obj?.['err'];
  const e = err instanceof Error ? err : null;
  const message = e ? `${msg ? `${msg}: ` : ''}${e.message}` : msg ?? (typeof err === 'string' ? err : null);
  if (!message) return null;
  return { source: 'server', message, stack: e?.stack ?? null, location: msg ?? null, release: RELEASE };
}

export function serverRelease(): string | null {
  return RELEASE;
}
