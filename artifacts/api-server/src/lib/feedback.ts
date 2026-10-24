/**
 * Feedback (docs/feedback.md): testers send the owner improvement ideas from
 * the speech bubble in the app – typed or dictated. The owner reads them under
 * Verwaltung → Feedback and gets a push for each new one.
 */

import { db, feedbackTable, usersTable } from '@workspace/db';
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';

import { FarmDataError, text } from './farmAnimals';
import { logger } from './logger';
import { sendPushToUser } from './webPush';

export const MAX_PER_DAY = 20;

export interface FeedbackInput {
  text: unknown;
  page?: unknown;
  voice?: unknown;
}

export interface FeedbackItem {
  id: number;
  text: string;
  page: string | null;
  voice: boolean;
  author: string;
  email: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Only a path of this app, never a full URL. */
function pagePath(raw: unknown): string | null {
  return typeof raw === 'string' && /^\/[^\s]{0,199}$/.test(raw) && !raw.startsWith('//') ? raw : null;
}

export async function sendFeedback(userId: string, input: FeedbackInput, now = new Date()): Promise<void> {
  const body = text(input.text, 2000, 'Deine Nachricht', true);
  if (body.length < 3) throw new FarmDataError(400, 'Schreib bitte ein paar Worte mehr.');
  const [sent] = await db
    .select({ n: count() })
    .from(feedbackTable)
    .where(and(eq(feedbackTable.userId, userId), gte(feedbackTable.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000))));
  if ((sent?.n ?? 0) >= MAX_PER_DAY) throw new FarmDataError(429, 'Danke für so viel Feedback! Für heute ist das Limit erreicht – morgen geht es weiter.');
  await db.insert(feedbackTable).values({ userId, text: body, page: pagePath(input.page), voice: input.voice === true });

  // Tell the owner – unless the owner is testing it themselves.
  const owners = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isOwner, true));
  for (const owner of owners) {
    if (owner.id === userId) continue;
    await sendPushToUser(owner.id, { topic: 'admin',
      title: 'Neues Feedback',
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      tag: 'feedback',
      url: '/verwaltung#feedback',
    }).catch((err: unknown) => logger.warn({ err }, 'feedback push failed'));
  }
}

export async function listFeedback(limit = 200): Promise<{ items: FeedbackItem[]; unread: number }> {
  const rows = await db
    .select({
      id: feedbackTable.id,
      text: feedbackTable.text,
      page: feedbackTable.page,
      voice: feedbackTable.voice,
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
      author: r.username || r.firstName || r.email?.split('@')[0] || 'Unbekannt',
      email: r.email ?? null,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    })),
    unread: unread?.n ?? 0,
  };
}

export async function markFeedback(id: number, read: boolean): Promise<void> {
  const updated = await db.update(feedbackTable).set({ readAt: read ? new Date() : null }).where(eq(feedbackTable.id, id)).returning({ id: feedbackTable.id });
  if (updated.length === 0) throw new FarmDataError(404, 'Nicht gefunden.');
}

export async function deleteFeedback(id: number): Promise<void> {
  const deleted = await db.delete(feedbackTable).where(eq(feedbackTable.id, id)).returning({ id: feedbackTable.id });
  if (deleted.length === 0) throw new FarmDataError(404, 'Nicht gefunden.');
}
