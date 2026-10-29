/**
 * Hof-Aufgaben (docs/hof-aufgaben.md): the pure rules – when a task is due,
 * and which area and action a free text belongs to. No database, so the unit
 * tests load it directly.
 */

import type { FarmTaskAction, FarmTaskArea } from '@workspace/db/schema';

export interface DueInput {
  repeats: boolean;
  /** First due day (YYYY-MM-DD); null = one interval after creation. */
  startsOn: string | null;
  createdDay: string;
  /** Berlin day of the last completion. */
  completedDay: string | null;
  intervalDays: number;
  /** Fixed weekdays (1 = Montag … 7 = Sonntag) instead of the interval. */
  weekdays?: number[] | null;
}

/** ISO weekday of a day: 1 = Montag … 7 = Sonntag. */
export function isoWeekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
}

/** Weekdays as sent → sorted, unique 1–7, or null for none. Anything else is "invalid". */
export function normalizeWeekdays(value: unknown): number[] | null | 'invalid' {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return 'invalid';
  if (value.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return 'invalid';
  const days = [...new Set(value as number[])].sort((a, b) => a - b);
  return days.length > 0 ? days : null;
}

const DAY_ADVERBS = ['montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags', 'sonntags'];

/** "montags und donnerstags", "werktags", "jeden Tag". */
export function weekdaysText(days: number[]): string {
  const key = days.join(',');
  if (key === '1,2,3,4,5,6,7') return 'jeden Tag';
  if (key === '1,2,3,4,5') return 'werktags';
  if (key === '6,7') return 'am Wochenende';
  const words = days.map((d) => DAY_ADVERBS[d - 1]!);
  return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} und ${words.at(-1)}`;
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The day a task is due next. A one-off task is due on its day and done for
 * good once ticked off; a repeating one is due one interval after the last
 * completion, never before its first day; one with weekdays on the next
 * of those days after the last completion.
 */
export function farmTaskDue(t: DueInput): { dueDate: string; done: boolean } {
  if (!t.repeats) return { dueDate: t.startsOn ?? t.createdDay, done: t.completedDay !== null };
  if (t.weekdays && t.weekdays.length > 0) {
    // The next of its weekdays after the last completion – or from the first
    // day on. A day missed stays due (overdue) until it is ticked off.
    let day = t.completedDay !== null ? addDays(t.completedDay, 1) : (t.startsOn ?? t.createdDay);
    if (t.startsOn !== null && t.startsOn > day) day = t.startsOn;
    for (let i = 0; i < 7 && !t.weekdays.includes(isoWeekday(day)); i++) day = addDays(day, 1);
    return { dueDate: day, done: false };
  }
  const base = t.completedDay !== null ? addDays(t.completedDay, t.intervalDays) : (t.startsOn ?? addDays(t.createdDay, t.intervalDays));
  return { dueDate: t.startsOn !== null && t.startsOn > base ? t.startsOn : base, done: false };
}

// Ordered: the first match wins. Lower-case German words; stems, so
// "Hühner", "Huhn" and "Hühnerstall" all match.
const ANIMAL_WORDS = /(huhn|hühn|hahn|küken|eier|\bei\b|gans|gäns|\benten?\b|wachtel|\bputen?\b|tauben?\b|meerschwein|kaninchen|\bhasen?\b|ziege|zicklein|\bschaf|\blämmer|\blamm|pferd|pony|\besel|\brinder|\bkuh|\bkühe|\bkalb|schwein|ferkel|alpaka|\blamas?\b|\bhunde?\b|katze|biene|(?<!in)stall|futter|fütter|tränk|ausmist|einstreu|\bheu\b|weide|\btiere?\b)/;
const GARDEN_WORDS = /(garten|beet|gieß|giess|gießen|pflanz|säen|aussaat|ernte|ernten|unkraut|jäten|rasen|mähen|hecke|gemüse|tomate|salat|kräuter|obst|kompost|mulch|gewächshaus|hochbeet|dünge|rose|baum|strauch|blume)/;

/** Where a task typed into the Hof list belongs: animals, garden or the rest of the Hof. */
export function guessFarmTaskArea(title: string): FarmTaskArea {
  const t = title.toLocaleLowerCase('de-DE');
  if (ANIMAL_WORDS.test(t)) return 'tiere';
  if (GARDEN_WORDS.test(t)) return 'garten';
  return 'hof';
}

/** The stall action for a free text, so Am Stall and the reminders show the right one. */
export function guessFarmTaskAction(title: string): FarmTaskAction {
  const t = title.toLocaleLowerCase('de-DE');
  if (/(eier|\bei\b)/.test(t)) return 'Eier sammeln';
  if (/(tränk|wasser)/.test(t)) return 'Tränken';
  if (/(ausmist|einstreu|misten)/.test(t)) return 'Ausmisten';
  if (/(futter|fütter|heu\b|gras|körner)/.test(t)) return 'Füttern';
  if (/(wurm|entwurm)/.test(t)) return 'Entwurmen';
  if (/impf/.test(t)) return 'Impfen';
  if (/(klaue|huf)/.test(t)) return 'Klauen-/Hufpflege';
  return 'Sonstiges';
}
