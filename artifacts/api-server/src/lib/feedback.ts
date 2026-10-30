/**
 * Feedback (docs/feedback.md): testers send the owner improvement ideas from
 * the speech bubble in the app – typed or dictated. The owner reads them under
 * Verwaltung → Feedback and gets a push for each new one. Visitors of the
 * homepage send ideas and problems too, without an account.
 */

import { db, feedbackTable, usersTable } from '@workspace/db';
import { and, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import { FarmDataError, text } from './farmAnimals';
import { logger } from './logger';
import { sendPushToUser } from './webPush';

export const MAX_PER_DAY = 20;

export interface FeedbackInput {
  text: unknown;
  page?: unknown;
  voice?: unknown;
  /** A screenshot as an image data URL (the app downscales it). */
  screenshot?: unknown;
}

/** About 1.5 MB of base64 – a downscaled screenshot is far smaller. */
export const MAX_SCREENSHOT_CHARS = 2_000_000;

function screenshotOf(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
    throw new FarmDataError(400, 'Der Screenshot muss ein Bild sein (JPEG, PNG oder WebP).');
  }
  if (raw.length > MAX_SCREENSHOT_CHARS) throw new FarmDataError(400, 'Der Screenshot ist zu groß.');
  return raw;
}

export interface FeedbackItem {
  id: number;
  text: string;
  page: string | null;
  voice: boolean;
  /** Homepage: "idea" or "problem"; null from the app. */
  kind: FeedbackKind | null;
  /** Sent from the homepage without an account. */
  visitor: boolean;
  /** A screenshot is attached (GET /feedback/:id/screenshot, owner only). */
  hasScreenshot: boolean;
  author: string;
  email: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Only a path of this app, never a full URL. */
function pagePath(raw: unknown): string | null {
  return typeof raw === 'string' && /^\/[^\s]{0,199}$/.test(raw) && !raw.startsWith('//') ? raw : null;
}

export const FEEDBACK_KINDS = ['idea', 'problem'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Tell the owners – unless one of them wrote it. */
async function notifyOwners(title: string, body: string, from: string | null): Promise<void> {
  const owners = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isOwner, true));
  for (const owner of owners) {
    if (owner.id === from) continue;
    await sendPushToUser(owner.id, { topic: 'admin', title, body: body.length > 120 ? `${body.slice(0, 117)}…` : body, tag: 'feedback', url: '/verwaltung#feedback' }).catch((err: unknown) =>
      logger.warn({ err }, 'feedback push failed'),
    );
  }
}

export async function sendFeedback(userId: string, input: FeedbackInput, now = new Date()): Promise<void> {
  const body = text(input.text, 2000, 'Deine Nachricht', true);
  if (body.length < 3) throw new FarmDataError(400, 'Schreib bitte ein paar Worte mehr.');
  const screenshot = screenshotOf(input.screenshot);
  const [sent] = await db
    .select({ n: count() })
    .from(feedbackTable)
    .where(and(eq(feedbackTable.userId, userId), gte(feedbackTable.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))));
  if ((sent?.n ?? 0) >= MAX_PER_DAY) throw new FarmDataError(429, 'Danke für so viel Feedback! Für heute ist das Limit erreicht – morgen geht es weiter.');
  await db.insert(feedbackTable).values({ userId, text: body, page: pagePath(input.page), voice: input.voice === true, screenshot });
  await notifyOwners(screenshot ? 'Neues Feedback mit Screenshot' : 'Neues Feedback', body, userId);
}

// ── From the homepage ────────────────────────────────────────────────────────

export interface SiteFeedbackInput {
  text: unknown;
  page?: unknown;
  kind?: unknown;
  contact?: unknown;
  /** Honeypot: a field people never see. Filled in means a bot. */
  website?: unknown;
}

/** Per address: so many messages an hour. */
export const SITE_PER_HOUR = 5;
/** All visitors together, per day – a ceiling against floods. */
export const SITE_PER_DAY = 200;
/** Visitor feedback is kept this long at most (Datenschutzerklärung). */
export const SITE_KEEP_DAYS = 365;

const recent = new Map<string, number[]>();

/** For tests: forget the per-address counts. */
export function resetSiteFeedbackLimits(): void {
  recent.clear();
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,100}\.[^\s@]{2,20}$/;

/**
 * Feedback from the homepage bubble: an idea or a problem, optionally with an
 * address for a reply. Signed in, it goes with the account like in the app.
 * Returns false when the honeypot caught a bot (nothing is stored, the bot
 * is not told).
 */
export async function sendSiteFeedback(input: SiteFeedbackInput, ip: string, userId: string | null, now = new Date()): Promise<boolean> {
  if (typeof input.website === 'string' && input.website.trim() !== '') return false;
  const body = text(input.text, 2000, 'Deine Nachricht', true);
  if (body.length < 3) throw new FarmDataError(400, 'Schreib bitte ein paar Worte mehr.');
  const kind: FeedbackKind = input.kind === 'problem' ? 'problem' : 'idea';
  const contact = text(input.contact, 120, 'Die E-Mail-Adresse');
  if (contact && !EMAIL.test(contact)) throw new FarmDataError(400, 'Die E-Mail-Adresse sieht nicht richtig aus.');

  const hourAgo = now.getTime() - 60 * 60 * 1000;
  const mine = (recent.get(ip) ?? []).filter((t) => t > hourAgo);
  if (mine.length >= SITE_PER_HOUR) throw new FarmDataError(429, 'Danke! Für die nächste Stunde ist das genug – schreib uns gern später wieder.');
  const [today] = await db
    .select({ n: count() })
    .from(feedbackTable)
    .where(and(isNull(feedbackTable.userId), gte(feedbackTable.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))));
  if ((today?.n ?? 0) >= SITE_PER_DAY) throw new FarmDataError(429, 'Gerade kommen sehr viele Nachrichten an. Bitte versuch es später noch einmal.');
  recent.set(ip, [...mine, now.getTime()]);
  if (recent.size > 5000) recent.delete(recent.keys().next().value!);

  await db.insert(feedbackTable).values({ userId, text: body, page: pagePath(input.page), kind, contact });
  // Visitor feedback is not kept forever.
  await db.delete(feedbackTable).where(and(isNull(feedbackTable.userId), lt(feedbackTable.createdAt, new Date(now.getTime() - SITE_KEEP_DAYS * 24 * 60 * 60 * 1000))));
  await notifyOwners(kind === 'problem' ? 'Problem gemeldet (Homepage)' : 'Idee von der Homepage', body, userId);
  return true;
}

export async function listFeedback(limit = 200): Promise<{ items: FeedbackItem[]; unread: number }> {
  const rows = await db
    .select({
      id: feedbackTable.id,
      text: feedbackTable.text,
      page: feedbackTable.page,
      voice: feedbackTable.voice,
      kind: feedbackTable.kind,
      contact: feedbackTable.contact,
      hasScreenshot: sql<boolean>`${feedbackTable.screenshot} is not null`,
      userId: feedbackTable.userId,
      createdAt: feedbackTable.createdAt,
      readAt: feedbackTable.readAt,
      username: usersTable.username,
      firstName: usersTable.firstName,
      email: usersTable.email,
    })
    .from(feedbackTable)
    .leftJoin(usersTable, eq(usersTable.id, feedbackTable.userId))
    .orderBy(desc(feedbackTable.createdAt), desc(feedbackTable.id))
    .limit(limit);
  const [unread] = await db.select({ n: count() }).from(feedbackTable).where(isNull(feedbackTable.readAt));
  return {
    items: rows.map((r) => ({
      id: r.id,
      text: r.text,
      page: r.page,
      voice: r.voice,
      kind: (FEEDBACK_KINDS as readonly string[]).includes(r.kind ?? '') ? (r.kind as FeedbackKind) : null,
      visitor: r.userId === null,
      hasScreenshot: r.hasScreenshot,
      author: r.userId === null ? 'Besuch der Homepage' : r.username || r.firstName || r.email?.split('@')[0] || 'Unbekannt',
      email: r.contact ?? r.email ?? null,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    })),
    unread: unread?.n ?? 0,
  };
}

/** The screenshot of one feedback as bytes, or null. */
export async function feedbackScreenshot(id: number): Promise<{ type: string; bytes: Buffer } | null> {
  const [row] = await db.select({ screenshot: feedbackTable.screenshot }).from(feedbackTable).where(eq(feedbackTable.id, id));
  const m = row?.screenshot ? /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(row.screenshot) : null;
  return m ? { type: m[1]!, bytes: Buffer.from(m[2]!, 'base64') } : null;
}

export async function markFeedback(id: number, read: boolean): Promise<void> {
  const updated = await db.update(feedbackTable).set({ readAt: read ? new Date() : null }).where(eq(feedbackTable.id, id)).returning({ id: feedbackTable.id });
  if (updated.length === 0) throw new FarmDataError(404, 'Nicht gefunden.');
}

export async function deleteFeedback(id: number): Promise<void> {
  const deleted = await db.delete(feedbackTable).where(eq(feedbackTable.id, id)).returning({ id: feedbackTable.id });
  if (deleted.length === 0) throw new FarmDataError(404, 'Nicht gefunden.');
}
