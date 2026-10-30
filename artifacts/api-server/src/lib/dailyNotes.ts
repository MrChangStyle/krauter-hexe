/**
 * Alltagsnotizen (docs/alltagsnotizen.md): a shopping list and things to
 * remember. Every person has one list and owns it. The owner shares it with
 * chosen people – from the farm team or by e-mail.
 *
 * Rights on a list:
 * - owner: everything – add, tick off, change, delete, share
 * - shared with: see, tick off, add, change what they wrote; never delete
 */

import {
  dailyNotesTable,
  db,
  farmMembershipsTable,
  NOTE_CATEGORIES,
  NOTE_KINDS,
  noteSharesTable,
  usersTable,
  type NoteCategory,
  type NoteKind,
} from '@workspace/db';
import { accountByCode } from './userCode';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { guessNoteCategory, guessNoteKind } from './noteRules';
import { noteAdded } from './notesPush';

/** At most this many open notes on one list – a list, not an archive. */
export const MAX_OPEN_NOTES = 300;
/** At most this many people per list. */
export const MAX_SHARES = 10;

export interface NoteInput {
  text?: unknown;
  kind?: NoteKind | null;
  category?: NoteCategory | null;
  /** The list (its owner) to put it on; default: the own list. */
  listOwnerId?: string | null;
  done?: boolean;
}

type UserRow = { firstName: string | null; lastName: string | null; username: string | null; email: string | null };

function displayName(u: UserRow): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.email?.split('@')[0] || 'Unbekannt';
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(rows.map((r) => [r.id, displayName(r)]));
}

/** The lists the person may work on: the own one and those shared with them. */
async function listsOf(userId: string): Promise<string[]> {
  const shared = await db.select({ ownerId: noteSharesTable.ownerId }).from(noteSharesTable).where(eq(noteSharesTable.userId, userId));
  return [userId, ...shared.map((s) => s.ownerId)];
}

type Row = typeof dailyNotesTable.$inferSelect;

async function present(rows: Row[], viewerId: string) {
  const who = await names(rows.flatMap((r) => [r.userId, ...(r.addedBy ? [r.addedBy] : []), ...(r.doneBy ? [r.doneBy] : [])]));
  const name = (id: string | null) => (id ? (who.get(id) ?? 'Ehemaliges Mitglied') : null);
  return rows.map((r) => ({
    id: r.id,
    listOwnerId: r.userId,
    listOwnerName: name(r.userId)!,
    kind: r.kind,
    category: r.category,
    text: r.text,
    done: r.done,
    doneAt: r.doneAt,
    doneByName: name(r.doneBy),
    addedByName: name(r.addedBy ?? r.userId)!,
    isOwnList: r.userId === viewerId,
    createdAt: r.createdAt,
  }));
}

/** The notes of every list the person works on; open first, newest first. */
export async function listNotes(userId: string) {
  const owners = await listsOf(userId);
  const rows = await db
    .select()
    .from(dailyNotesTable)
    .where(inArray(dailyNotesTable.userId, owners))
    .orderBy(asc(dailyNotesTable.done), sql`${dailyNotesTable.createdAt} DESC`, sql`${dailyNotesTable.id} DESC`);
  return present(rows, userId);
}

/** The note and whether the person owns its list; 404 when they may not see it. */
async function access(userId: string, noteId: number) {
  const [note] = await db.select().from(dailyNotesTable).where(eq(dailyNotesTable.id, noteId));
  if (!note || !(await listsOf(userId)).includes(note.userId)) throw notFound();
  return { note, owner: note.userId === userId };
}

function kindAndCategory(textValue: string, kind: NoteKind | null | undefined, category: NoteCategory | null | undefined) {
  const k = kind ?? guessNoteKind(textValue);
  if (!NOTE_KINDS.includes(k)) throw new FarmDataError(400, 'Diese Art von Notiz gibt es nicht.');
  if (k !== 'einkauf') return { kind: k, category: null };
  const c = category ?? guessNoteCategory(textValue, k);
  if (c !== null && !NOTE_CATEGORIES.includes(c)) throw new FarmDataError(400, 'Diesen Bereich gibt es nicht.');
  return { kind: k, category: c };
}

/** On the own list, or on one shared with the person. */
export async function createNote(userId: string, input: NoteInput) {
  const value = text(input.text, 120, 'Die Notiz', true);
  const owner = input.listOwnerId ?? userId;
  if (!(await listsOf(userId)).includes(owner)) throw new FarmDataError(403, 'Diese Liste ist nicht mit dir geteilt.');
  const [{ open }] = await db
    .select({ open: count() })
    .from(dailyNotesTable)
    .where(and(eq(dailyNotesTable.userId, owner), eq(dailyNotesTable.done, false)));
  if ((open ?? 0) >= MAX_OPEN_NOTES) throw new FarmDataError(400, 'Die Liste ist sehr lang. Bitte hak erst etwas ab oder lösche alte Notizen.');
  const [row] = await db
    .insert(dailyNotesTable)
    .values({ userId: owner, addedBy: userId, text: value, ...kindAndCategory(value, input.kind, input.category) })
    .returning();
  const note = (await present([row!], userId))[0]!;
  // Tell the others on a shared list (gathered into one push).
  void noteAdded(owner, userId, note.addedByName, value).catch(() => {});
  return note;
}

/** Tick off or back: everyone on the list. Wording and kind: the owner and who wrote it. */
export async function updateNote(userId: string, noteId: number, input: NoteInput) {
  const { note, owner } = await access(userId, noteId);
  const set: Partial<Row> = {};
  if (input.text !== undefined || input.kind !== undefined || input.category !== undefined) {
    if (!owner && (note.addedBy ?? note.userId) !== userId) throw new FarmDataError(403, 'Ändern kann nur, wer die Notiz geschrieben hat, oder der Besitzer der Liste.');
    const value = input.text !== undefined ? text(input.text, 120, 'Die Notiz', true) : note.text;
    const kind = input.kind === undefined ? note.kind : input.kind;
    const category = input.category === undefined && input.kind === undefined ? note.category : input.category;
    Object.assign(set, { text: value }, kindAndCategory(value, kind, category));
  }
  if (input.done !== undefined && input.done !== note.done) {
    set.done = input.done;
    set.doneAt = input.done ? new Date() : null;
    set.doneBy = input.done ? userId : null;
  }
  const [row] = Object.keys(set).length > 0 ? await db.update(dailyNotesTable).set(set).where(eq(dailyNotesTable.id, noteId)).returning() : [note];
  return (await present([row!], userId))[0]!;
}

/** Only the owner of the list deletes. */
export async function deleteNote(userId: string, noteId: number): Promise<void> {
  const { owner } = await access(userId, noteId);
  if (!owner) throw new FarmDataError(403, 'Löschen kann nur der Besitzer der Liste.');
  await db.delete(dailyNotesTable).where(eq(dailyNotesTable.id, noteId));
}

/** "Erledigte entfernen" on the own list. */
export async function clearDoneNotes(userId: string): Promise<number> {
  const removed = await db
    .delete(dailyNotesTable)
    .where(and(eq(dailyNotesTable.userId, userId), eq(dailyNotesTable.done, true)))
    .returning({ id: dailyNotesTable.id });
  return removed.length;
}

// ── Sharing ──────────────────────────────────────────────────────────────────

/** Who the own list is shared with, and whose lists are shared with me. */
export async function listShares(userId: string) {
  const mine = await db.select().from(noteSharesTable).where(eq(noteSharesTable.ownerId, userId)).orderBy(asc(noteSharesTable.createdAt));
  const withMe = await db.select().from(noteSharesTable).where(eq(noteSharesTable.userId, userId)).orderBy(asc(noteSharesTable.createdAt));
  const who = await names([...mine.map((s) => s.userId), ...withMe.map((s) => s.ownerId)]);
  return {
    sharedWith: mine.map((s) => ({ userId: s.userId, name: who.get(s.userId) ?? 'Ehemaliges Mitglied' })),
    sharedWithMe: withMe.map((s) => ({ userId: s.ownerId, name: who.get(s.ownerId) ?? 'Ehemaliges Mitglied' })),
  };
}

/**
 * Shares the own list – with someone from one of the person's farms (userId)
 * or with any approved account (e-mail), e.g. family off the farm.
 */
// Share attempts by Nutzer-ID per owner and day – in memory like the invite limit.
const sharesByOwner = new Map<string, number[]>();
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SHARE_TRIES_PER_DAY = 20;

export function resetShareCounters(): void {
  sharesByOwner.clear();
}

export async function addShare(userId: string, input: { userId?: string | null; userCode?: number | string | null }) {
  let target: string | null = null;
  if (input.userId) {
    const mine = db.select({ farmId: farmMembershipsTable.farmId }).from(farmMembershipsTable).where(eq(farmMembershipsTable.userId, userId));
    const [m] = await db
      .select({ userId: farmMembershipsTable.userId })
      .from(farmMembershipsTable)
      .where(and(eq(farmMembershipsTable.userId, input.userId), inArray(farmMembershipsTable.farmId, mine)));
    target = m?.userId ?? null;
  } else if (input.userCode !== undefined && input.userCode !== null && input.userCode !== '') {
    // Many tries in a day would mean guessing Nutzer-IDs.
    const now = Date.now();
    const recent = (sharesByOwner.get(userId) ?? []).filter((t) => now - t < DAY_MS);
    if (recent.length >= MAX_SHARE_TRIES_PER_DAY) throw new FarmDataError(429, 'Du hast heute schon sehr oft geteilt. Bitte versuche es morgen erneut.');
    sharesByOwner.set(userId, [...recent, now]);
    target = (await accountByCode(input.userCode))?.id ?? null;
  }
  if (!target) throw new FarmDataError(400, 'Zu dieser Nutzer-ID gibt es kein freigeschaltetes Konto. Die Person braucht ein eigenes Konto und findet ihre Nutzer-ID unter Mehr → Konto.');
  if (target === userId) throw new FarmDataError(400, 'Das ist deine eigene Liste.');
  const [{ n }] = await db.select({ n: count() }).from(noteSharesTable).where(eq(noteSharesTable.ownerId, userId));
  if ((n ?? 0) >= MAX_SHARES) throw new FarmDataError(400, `Eine Liste lässt sich mit höchstens ${MAX_SHARES} Personen teilen.`);
  await db.insert(noteSharesTable).values({ ownerId: userId, userId: target }).onConflictDoNothing();
  return listShares(userId);
}

/** The owner stops sharing with someone – or someone leaves a list shared with them. */
export async function removeShare(userId: string, otherId: string) {
  await db
    .delete(noteSharesTable)
    .where(
      sql`(${noteSharesTable.ownerId} = ${userId} AND ${noteSharesTable.userId} = ${otherId}) OR (${noteSharesTable.ownerId} = ${otherId} AND ${noteSharesTable.userId} = ${userId})`,
    );
  return listShares(userId);
}

// ── KI: free speech → notes ──────────────────────────────────────────────────

export interface PlannedNote {
  text: string;
  kind: NoteKind;
  category: NoteCategory | null;
}

export const MAX_PLANNED_NOTES = 30;

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  lebensmittel: 'Lebensmittel',
  getraenke: 'Getränke',
  drogerie: 'Drogerie & Apotheke',
  haushalt: 'Haushalt',
  tierbedarf: 'Tierbedarf',
  garten: 'Garten & Baumarkt',
  sonstiges: 'Sonstiges',
};

/** The model's (untrusted) answer → notes: text required, kind and section from fixed lists, else from the words. */
export function coerceNotes(parsed: unknown): PlannedNote[] {
  const list = (parsed as { notizen?: unknown } | null)?.notizen;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: PlannedNote[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const t = typeof r['text'] === 'string' ? r['text'].trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '').slice(0, 120) : '';
    const key = t.toLocaleLowerCase('de-DE');
    if (t.length < 2 || seen.has(key)) continue;
    seen.add(key);
    const kind = NOTE_KINDS.includes(r['art'] as NoteKind) ? (r['art'] as NoteKind) : guessNoteKind(t);
    const category =
      kind === 'einkauf' ? (NOTE_CATEGORIES.includes(r['bereich'] as NoteCategory) ? (r['bereich'] as NoteCategory) : guessNoteCategory(t, kind)) : null;
    out.push({ text: t.charAt(0).toLocaleUpperCase('de-DE') + t.slice(1), kind, category });
    if (out.length >= MAX_PLANNED_NOTES) break;
  }
  return out;
}

export function notesPrompt(said: string): string {
  return `Du schreibst einen Einkaufszettel und Merkzettel für eine Familie auf einem Hof. Der Text kommt meist aus der Spracheingabe am Handy: oft ohne Satzzeichen, klein geschrieben, mit Füllwörtern und manchmal mit falsch erkannten Wörtern.

Gesagt:
"""${said}"""

So gehst du vor:
1. Finde jedes einzelne Ding, das gekauft, besorgt, erledigt oder gemerkt werden soll – auch wenn die Dinge ohne Komma hintereinander stehen ("nudeln eier milch" → drei Notizen) oder in einem langen Satz stecken.
2. Mehrere Dinge sind mehrere Notizen ("Zahnbürsten und Fleisch" → zwei). Auch mehrere Sorten desselben Dings sind mehrere Notizen – dann ergänzt du die ausgelassenen Wörter, damit jede Notiz für sich verständlich ist: "Nudeln mit roter und grüner Soße" → "Nudeln mit roter Soße", "Nudeln mit grüner Soße"; "Joghurt Erdbeer und Vanille" → "Erdbeerjoghurt", "Vanillejoghurt"; "zwei Liter Vollmilch und einen fettarme" → "2 l Vollmilch", "1 l fettarme Milch". Was nur EIN Ding genauer beschreibt, bleibt eine Notiz ("Milch laktosefrei", "Brot vom Bäcker").
3. Läden sind keine Produkte. Penny, Aldi, Lidl, Rewe, Edeka, Netto, Norma, Kaufland, Globus, dm, Rossmann, Müller, Fressnapf, Obi, Bauhaus, Hornbach, Raiffeisen, Landhandel, Bäcker, Metzger, Apotheke, Markt und ähnliche: Häng den Laden in Klammern an jedes Ding, das dort gekauft werden soll ("bei Penny Nudeln und Eier kaufen" → "Nudeln (Penny)", "Eier (Penny)").
4. "text" kurz wie auf einem Zettel: das Ding mit großem Anfangsbuchstaben, mit Menge, wenn gesagt ("2 kg Hackfleisch", "6 Eier"), ohne "ich muss", "wir brauchen", "kaufen", "holen", "noch", "bitte". Beim Merken das Tun behalten ("Oma anrufen", "Tierarzt Termin machen"). Höchstens 120 Zeichen. Offensichtlich falsch erkannte Wörter darfst du zum gemeinten Produkt verbessern ("Butterbrot Papier" → "Butterbrotpapier"); sonst nichts erfinden.
5. Satzzeichen im Text sagen nichts: Die Spracheingabe setzt Punkte, wo jemand kurz überlegt, und lässt Kommas weg. Lies den Text als einen durchgehenden Satz und entscheide nach dem Sinn, was zusammengehört ("Nudeln mit roter. Und grüner Soße" ist EIN Gedanke). Gesprochene Wörter wie "Komma", "Punkt", "neue Zeile" sind Trennungen, keine Dinge.
6. "art": "einkauf" für alles zum Kaufen oder Besorgen, "merken" für Erledigen und Erinnern (anrufen, Termin, bezahlen, abgeben, reparieren …).
7. "bereich" nur bei "einkauf": ${Object.entries(CATEGORY_LABELS)
    .map(([k, v]) => `"${k}" (${v})`)
    .join(', ')}; bei "merken": null.

Beispiele:
- "bei penny nudeln kaufen" → [{"text": "Nudeln (Penny)", "art": "einkauf", "bereich": "lebensmittel"}]
- "nudeln eier und zwei liter milch dann noch katzenfutter" → Nudeln, Eier, 2 l Milch (lebensmittel), Katzenfutter (tierbedarf)
- "Nudeln mit roter und mit grüner Soße. Kakis. Orangen" → "Nudeln mit roter Soße", "Nudeln mit grüner Soße", "Kakis", "Orangen" (alle lebensmittel)
- "ich muss morgen den tierarzt anrufen und zahnpasta holen" → "Tierarzt anrufen" (merken), "Zahnpasta" (drogerie)

Antworte nur mit JSON:
{"notizen": [{"text": "...", "art": "einkauf", "bereich": "lebensmittel"}]}`;
}

export async function planNotes(rawText: unknown): Promise<PlannedNote[]> {
  const said = text(rawText, 2000, 'Der Text', true);
  const { AI_PLAN_ATTEMPT_MS, AI_PLAN_OUTPUT_TOKENS, AI_PLAN_TIMEOUT_MS, TEXT_MODELS, runModelChain } = await import('./plantIdentification');
  const parsed = await runModelChain([{ role: 'user', parts: [{ text: notesPrompt(said) }] }], TEXT_MODELS, {
    maxOutputTokens: AI_PLAN_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
  }, { timeoutMs: AI_PLAN_TIMEOUT_MS, attemptTimeoutMs: AI_PLAN_ATTEMPT_MS, quick: true });
  const notes = coerceNotes(parsed);
  if (notes.length === 0) throw new FarmDataError(422, 'Daraus konnte die KI keine Notiz machen. Sag es bitte noch einmal anders.');
  return notes;
}
