/**
 * KI-Aufgabenplan (docs/hof-aufgaben.md): what someone says in their own
 * words ("Heute müssen die Eier eingesammelt werden, die Gänse gefüttert und
 * die Blumen gegossen – das Füttern jeden Tag") becomes single Hof-Aufgaben
 * with day, repetition, time and person.
 *
 * The AI only proposes: its answer is coerced into fixed shapes (coercePlan),
 * nothing is saved here. The app shows the plan to check, then creates the
 * tasks through the normal route.
 */

import { db, farmMembershipsTable, herdsTable, usersTable, FARM_TASK_AREAS, type FarmTaskArea } from '@workspace/db';
import { asc, eq } from 'drizzle-orm';

import { FarmDataError, text } from './farmAnimals';
import { guessFarmTaskArea, normalizeWeekdays } from './farmTaskRules';

type Unit = 'Tage' | 'Wochen' | 'Monate';
const UNITS: readonly Unit[] = ['Tage', 'Wochen', 'Monate'];

export interface PlanContext {
  /** Berlin day, YYYY-MM-DD. */
  today: string;
  team: { userId: string; name: string }[];
  herds: { id: number; name: string }[];
  /** What the quick entry had chosen; used where the text says nothing. */
  defaults: { assigneeId: string | null; repeats: boolean };
}

export interface PlannedTask {
  title: string;
  area: FarmTaskArea;
  startsOn: string;
  repeats: boolean;
  intervalValue: number;
  intervalUnit: Unit;
  /** 1 = Montag … 7 = Sonntag ("montags und donnerstags"); null = the interval. */
  weekdays: number[] | null;
  reminderTime: string;
  assigneeId: string | null;
  assigneeName: string | null;
  herdId: number | null;
  herdName: string | null;
}

/** At most this many tasks from one text, like the typed list. */
export const MAX_PLANNED = 20;
const MAX_DAYS_AHEAD = 366;
const DEFAULT_TIME = '08:00';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(day: string): string {
  return WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
}

const lower = (s: string) => s.toLocaleLowerCase('de-DE').trim();

/** A name as said ("Maria", "maria") → the member; first names count too. */
function findByName<T>(said: unknown, list: T[], nameOf: (x: T) => string): T | null {
  if (typeof said !== 'string' || !said.trim()) return null;
  const s = lower(said);
  return list.find((x) => lower(nameOf(x)) === s) ?? list.find((x) => lower(nameOf(x)).split(/\s+/)[0] === s.split(/\s+/)[0]) ?? null;
}

function validDay(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value) return null;
  return value >= today && value <= addDays(today, MAX_DAYS_AHEAD) ? value : null;
}

/**
 * The model's (untrusted) answer → tasks the app can create. Titles are
 * required and cut to 80 characters; a day in the past or far ahead becomes
 * today; an unknown area follows from the words; a person or group that is
 * not on the farm is dropped. Where the text said nothing, the defaults of
 * the quick entry apply.
 */
export function coercePlan(parsed: unknown, ctx: PlanContext): PlannedTask[] {
  const list = (parsed as { aufgaben?: unknown } | null)?.aufgaben;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: PlannedTask[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = typeof r['titel'] === 'string' ? r['titel'].trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '').slice(0, 80) : '';
    if (title.length < 2 || seen.has(lower(title))) continue;
    seen.add(lower(title));

    const area = FARM_TASK_AREAS.includes(r['bereich'] as FarmTaskArea) ? (r['bereich'] as FarmTaskArea) : guessFarmTaskArea(title);
    const startsOn = validDay(r['tag'], ctx.today) ?? ctx.today;

    let repeats = ctx.defaults.repeats;
    let intervalValue = 1;
    let intervalUnit: Unit = 'Tage';
    const w = r['wiederholung'];
    if (w === 'einmalig') repeats = false;
    else if (w && typeof w === 'object') {
      const every = Number((w as Record<string, unknown>)['alle']);
      const unit = (w as Record<string, unknown>)['einheit'] as Unit;
      if (Number.isInteger(every) && every >= 1 && every <= 365 && UNITS.includes(unit)) {
        repeats = true;
        intervalValue = every;
        intervalUnit = unit;
      }
    }

    // "montags und donnerstags": fixed weekdays, repeating.
    const days = normalizeWeekdays(r['wochentage']);
    const weekdays = Array.isArray(days) ? days : null;
    if (weekdays) repeats = true;

    const time = typeof r['uhrzeit'] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r['uhrzeit']) ? r['uhrzeit'] : DEFAULT_TIME;

    const said = r['fuer'];
    const member = findByName(said, ctx.team, (m) => m.name);
    // "für alle" said out loud wins over the default person.
    const forAll = typeof said === 'string' && /^(alle|uns alle|jeden|jede|team)$/i.test(said.trim());
    const assignee = member ?? (forAll ? null : (ctx.team.find((m) => m.userId === ctx.defaults.assigneeId) ?? null));

    const herd = area === 'tiere' ? findByName(r['gruppe'], ctx.herds, (h) => h.name) : null;

    out.push({
      title: title.charAt(0).toLocaleUpperCase('de-DE') + title.slice(1),
      area,
      startsOn,
      repeats,
      intervalValue,
      intervalUnit,
      weekdays,
      reminderTime: time,
      assigneeId: assignee?.userId ?? null,
      assigneeName: assignee?.name ?? null,
      herdId: herd?.id ?? null,
      herdName: herd?.name ?? null,
    });
    if (out.length >= MAX_PLANNED) break;
  }
  return out;
}

export function planPrompt(said: string, ctx: PlanContext): string {
  const day = (n: number) => `${addDays(ctx.today, n)} (${weekdayOf(addDays(ctx.today, n))})`;
  return `Du schreibst die Aufgabenliste eines kleinen Bauernhofs. Jemand hat frei gesprochen, was zu tun ist.
Heute ist ${day(0)}. Morgen: ${day(1)}. Übermorgen: ${day(2)}.
Team: ${ctx.team.length ? ctx.team.map((m) => m.name).join(', ') : 'nur eine Person'}.
Tiergruppen auf dem Hof: ${ctx.herds.length ? ctx.herds.map((h) => h.name).join(', ') : 'keine'}.

Gesagt:
"""${said}"""

Zerlege das in einzelne Aufgaben. Regeln:
- Nur Aufgaben, die gesagt wurden; nichts erfinden, nichts zusammenlegen, was getrennt gesagt wurde ("Nassfutter und Trockenfutter" darf eine Aufgabe bleiben).
- "titel": kurz und klar wie auf einem Zettel, ohne "heute", "muss", "bitte", ohne Zeit und Person, z. B. "Eier einsammeln", "Gänse füttern", "Blumen gießen". Höchstens 80 Zeichen.
- "bereich": "tiere" (Tiere, Stall, Füttern, Eier), "garten" (Beet, Pflanzen, Blumen, gießen, ernten) oder "hof" (alles andere: Teich, Haus, Holz, Technik).
- "tag": der erste Tag als JSON-Datum. "heute" = ${ctx.today}, "morgen", "übermorgen", ein Wochentag = der nächste solche Tag (heute zählt nicht, wenn der Wochentag heute ist und "nächsten" gesagt wurde). Nichts gesagt: null.
- "wiederholung": {"alle": Zahl, "einheit": "Tage" | "Wochen" | "Monate"} bei "jeden Tag", "täglich", "jede Woche", "alle zwei Tage", "einmal im Monat" …; "einmalig" bei "nur heute", "einmal", "einmalig"; nichts gesagt: null.
- "wochentage": Liste der Wochentage als Zahlen (1 = Montag … 7 = Sonntag) bei festen Tagen: "montags und donnerstags" [1, 4], "jeden Dienstag" [2], "werktags" [1, 2, 3, 4, 5], "am Wochenende" [6, 7]; sonst null. Dann ist "wiederholung" egal.
- "uhrzeit": "HH:MM" bei "um 8", "um halb sechs abends" (17:30), "morgens" (07:00), "mittags" (12:00), "abends" (18:00); sonst null.
- "fuer": Name aus dem Team, wenn gesagt ("für Maria", "Maria soll …"), "alle" bei "für alle"; sonst null.
- "gruppe": Name einer Tiergruppe, wenn sie gemeint ist; sonst null.
- Gilt etwas für alles ("das Ganze ist für morgen", "alles jeden Tag"), trage es bei jeder Aufgabe ein.
Antworte nur mit JSON:
{"aufgaben": [{"titel": "...", "bereich": "...", "tag": null, "wiederholung": null, "wochentage": null, "uhrzeit": null, "fuer": null, "gruppe": null}]}`;
}

async function contextFor(farmId: number, today: string, defaults: PlanContext['defaults']): Promise<PlanContext> {
  const members = await db
    .select({ userId: farmMembershipsTable.userId, role: farmMembershipsTable.role, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username, email: usersTable.email })
    .from(farmMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, farmMembershipsTable.userId))
    .where(eq(farmMembershipsTable.farmId, farmId))
    // Members added together share a timestamp: the id keeps the order fixed.
    .orderBy(asc(farmMembershipsTable.createdAt), asc(farmMembershipsTable.id));
  const herds = await db.select({ id: herdsTable.id, name: herdsTable.name }).from(herdsTable).where(eq(herdsTable.farmId, farmId)).orderBy(asc(herdsTable.id));
  return {
    today,
    // Guests only read, so nothing is planned for them.
    team: members
      .filter((m) => m.role !== 'guest')
      .map((m) => ({ userId: m.userId, name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.username || m.email?.split('@')[0] || 'Unbekannt' })),
    herds,
    defaults: {
      assigneeId: defaults.assigneeId && members.some((m) => m.userId === defaults.assigneeId) ? defaults.assigneeId : null,
      repeats: defaults.repeats,
    },
  };
}

/** Asks the AI for the plan of a spoken or typed text; saves nothing. */
export async function planTasks(farmId: number, rawText: unknown, today: string, defaults: PlanContext['defaults']): Promise<PlannedTask[]> {
  const said = text(rawText, 2000, 'Der Text', true);
  const ctx = await contextFor(farmId, today, defaults);
  const { AI_PLAN_ATTEMPT_MS, AI_PLAN_OUTPUT_TOKENS, AI_PLAN_TIMEOUT_MS, TEXT_MODELS, runModelChain } = await import('./plantIdentification');
  const parsed = await runModelChain([{ role: 'user', parts: [{ text: planPrompt(said, ctx) }] }], TEXT_MODELS, {
    maxOutputTokens: AI_PLAN_OUTPUT_TOKENS,
    responseMimeType: 'application/json',
  }, { timeoutMs: AI_PLAN_TIMEOUT_MS, attemptTimeoutMs: AI_PLAN_ATTEMPT_MS, quick: true });
  const tasks = coercePlan(parsed, ctx);
  if (tasks.length === 0) throw new FarmDataError(422, 'Daraus konnte die KI keine Aufgabe machen. Sag es bitte noch einmal anders.');
  return tasks;
}
