/**
 * Push for shared Alltagsnotizen (docs/alltagsnotizen.md): when someone puts
 * something on a list, everyone else on it hears about it. Notes often come in
 * a burst (a dictated shopping list is saved item by item), so a list's new
 * notes are collected for a short while and go out as one push per person:
 * "Maria hat 3 Sachen auf die Liste gesetzt: Hafer, Milch, Eier".
 *
 * Kept in memory: a restart within the window loses one push, nothing else.
 */

import { db, noteSharesTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

import { logger } from './logger';
import { sendPushToUser } from './webPush';

/** How long new notes of one list are gathered before the push goes out. */
export const GATHER_MS = 60_000;

interface Pending {
  ownerId: string;
  addedBy: string;
  addedByName: string;
  texts: string[];
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

/** "Hafer", "Hafer und Milch", "3 Sachen: Hafer, Milch, Eier" */
export function notesPushBody(name: string, texts: string[], ownList: boolean): { title: string; body: string } {
  const where = ownList ? 'deine Liste' : 'die gemeinsame Liste';
  const shown = texts.slice(0, 4).map((t) => `„${t}“`);
  const more = texts.length > 4 ? ` und ${texts.length - 4} weitere` : '';
  const what = texts.length === 1 ? shown[0]! : texts.length === 2 ? `${shown[0]} und ${shown[1]}` : `${texts.length} Sachen: ${shown.join(', ')}${more}`;
  return { title: 'Alltagsnotizen', body: `${name} hat ${what} auf ${where} gesetzt.` };
}

/** Everyone on the list of `ownerId` except the one who wrote. */
async function recipients(ownerId: string, addedBy: string): Promise<string[]> {
  const shares = await db.select({ userId: noteSharesTable.userId }).from(noteSharesTable).where(eq(noteSharesTable.ownerId, ownerId));
  return [ownerId, ...shares.map((s) => s.userId)].filter((id, i, all) => id !== addedBy && all.indexOf(id) === i);
}

export async function flushNotesPush(key: string): Promise<number> {
  const p = pending.get(key);
  if (!p) return 0;
  pending.delete(key);
  clearTimeout(p.timer);
  let sent = 0;
  try {
    for (const userId of await recipients(p.ownerId, p.addedBy)) {
      sent += await sendPushToUser(userId, { topic: 'notes', ...notesPushBody(p.addedByName, p.texts, userId === p.ownerId), tag: `notes-${p.ownerId}`, url: '/notizen' });
    }
  } catch (err) {
    logger.warn({ err }, 'notes push failed');
  }
  return sent;
}

/** A note was put on a list; only lists that are shared make a push. */
export async function noteAdded(ownerId: string, addedBy: string, addedByName: string, noteText: string): Promise<void> {
  const key = `${ownerId}|${addedBy}`;
  const p = pending.get(key);
  if (p) {
    p.texts.push(noteText);
    return;
  }
  const [shared] = await db.select({ id: noteSharesTable.id }).from(noteSharesTable).where(eq(noteSharesTable.ownerId, ownerId)).limit(1);
  if (!shared) return;
  const timer = setTimeout(() => void flushNotesPush(key), GATHER_MS);
  timer.unref?.();
  pending.set(key, { ownerId, addedBy, addedByName, texts: [noteText], timer });
}

/** For tests: the keys waiting to be sent. */
export function pendingNotesPushes(): string[] {
  return [...pending.keys()];
}
