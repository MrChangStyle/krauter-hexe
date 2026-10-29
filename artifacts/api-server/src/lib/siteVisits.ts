/**
 * Besucher der Homepage (docs/analyse.md): a count of page views per Berlin
 * day, page and origin – without cookies, without storing an IP or anything
 * else about the visitor. Enough to see which pages and which channels of the
 * marketing plan (docs/MARKETING.md) bring people.
 *
 * Off with env ANALYTICS=off. Bots, previews and the measuring tools are not
 * counted. The browser sends nothing when it asks not to be tracked (GPC/DNT).
 */

import { db, siteVisitsTable } from '@workspace/db';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { berlinDay } from './monitoring';

/** The public pages that are counted (as in SEO_PAGES of the app). */
export const COUNTED_PATHS = [
  '/',
  '/funktionen/pflanzen',
  '/funktionen/tiere',
  '/funktionen/hof',
  '/preise',
  '/modul-finder',
  '/impressum',
  '/datenschutz',
  '/nutzungsbedingungen',
] as const;

/** More different origins a day than this are counted as "andere" (keeps the table small). */
const MAX_SOURCES_PER_DAY = 200;

const BOT = /bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|whatsapp|telegram|curl|wget|python|java\//i;

export function analyticsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['ANALYTICS']?.trim().toLowerCase() !== 'off';
}

/**
 * Where a visit came from, from the visitor's own words only: a campaign name
 * (utm_source or ref, as set in the marketing links) wins, else the referring
 * domain without "www.", "intern" for our own pages, "direkt" without one.
 * Pure.
 */
export function visitSource(input: { campaign?: unknown; referrer?: unknown }, ownHost: string | null): string {
  const campaign = typeof input.campaign === 'string' ? input.campaign.trim().toLowerCase() : '';
  if (/^[a-z0-9._-]{1,40}$/.test(campaign)) return campaign;
  if (typeof input.referrer !== 'string' || !input.referrer) return 'direkt';
  try {
    const host = new URL(input.referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return 'direkt';
    if (ownHost && host === ownHost.toLowerCase().replace(/^www\./, '')) return 'intern';
    return host.slice(0, 60);
  } catch {
    return 'direkt';
  }
}

/** Counts one page view. Never throws; false when it was not counted. */
export async function recordVisit(input: { path?: unknown; campaign?: unknown; referrer?: unknown }, userAgent: string | undefined, ownHost: string | null, now = new Date()): Promise<boolean> {
  if (!analyticsEnabled()) return false;
  if (!userAgent || BOT.test(userAgent)) return false;
  const path = typeof input.path === 'string' ? input.path.replace(/\/$/, '') || '/' : '';
  if (!(COUNTED_PATHS as readonly string[]).includes(path)) return false;
  const day = berlinDay(now);
  let source = visitSource(input, ownHost);
  try {
    const [known] = await db
      .select({ n: sql<number>`count(DISTINCT ${siteVisitsTable.source})::int` })
      .from(siteVisitsTable)
      .where(eq(siteVisitsTable.day, day));
    if ((known?.n ?? 0) >= MAX_SOURCES_PER_DAY) {
      const [exists] = await db
        .select({ day: siteVisitsTable.day })
        .from(siteVisitsTable)
        .where(and(eq(siteVisitsTable.day, day), eq(siteVisitsTable.source, source)))
        .limit(1);
      if (!exists) source = 'andere';
    }
    await db
      .insert(siteVisitsTable)
      .values({ day, path, source, count: 1 })
      .onConflictDoUpdate({ target: [siteVisitsTable.day, siteVisitsTable.path, siteVisitsTable.source], set: { count: sql`${siteVisitsTable.count} + 1` } });
    return true;
  } catch {
    return false;
  }
}

export interface VisitReport {
  enabled: boolean;
  days: number;
  /** Per day, newest first. */
  perDay: { day: string; visits: number }[];
  perPath: { path: string; visits: number }[];
  perSource: { source: string; visits: number }[];
}

/** The owner's view of the last `days` days. */
export async function visitReport(days = 30, now = new Date()): Promise<VisitReport> {
  const from = berlinDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const since = gte(siteVisitsTable.day, from);
  const total = sql<number>`sum(${siteVisitsTable.count})::int`;
  const [perDay, perPath, perSource] = await Promise.all([
    db.select({ day: siteVisitsTable.day, visits: total }).from(siteVisitsTable).where(since).groupBy(siteVisitsTable.day).orderBy(desc(siteVisitsTable.day)),
    db.select({ path: siteVisitsTable.path, visits: total }).from(siteVisitsTable).where(since).groupBy(siteVisitsTable.path).orderBy(desc(total)),
    db.select({ source: siteVisitsTable.source, visits: total }).from(siteVisitsTable).where(since).groupBy(siteVisitsTable.source).orderBy(desc(total)).limit(20),
  ]);
  return { enabled: analyticsEnabled(), days, perDay, perPath, perSource };
}

/** Counts older than about 13 months go (with the hourly housekeeping). */
export async function cleanupSiteVisits(now = new Date()): Promise<void> {
  await db.delete(siteVisitsTable).where(lt(siteVisitsTable.day, berlinDay(new Date(now.getTime() - 400 * 86_400_000))));
}
