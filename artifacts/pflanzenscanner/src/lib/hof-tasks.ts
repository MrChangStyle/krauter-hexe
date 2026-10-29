/**
 * Hof-Aufgaben (docs/hof-aufgaben.md): the shared list of the farm – what is
 * open today, what is done, what comes next – and turning a typed or spoken
 * list into single tasks.
 */
import type { FarmTask, FarmTaskArea, PlannedFarmTask } from "@workspace/api-client-react";

export const AREA_LABELS: Record<FarmTaskArea, string> = {
  tiere: "Tiere",
  garten: "Garten",
  hof: "Hof & Haus",
};

export type HofFilter = "all" | "mine" | FarmTaskArea;

/** What a task is called in the list: the own wording, else the action. */
export function taskTitle(t: Pick<FarmTask, "title" | "actionType">): string {
  return t.title ?? t.actionType;
}

function matches(t: FarmTask, filter: HofFilter, me: string | null): boolean {
  if (filter === "all") return true;
  // "Für mich": mine and those for everyone.
  if (filter === "mine") return t.assigneeId === null || t.assigneeId === me;
  return t.area === filter;
}

/** "in 7 Tagen" counts as soon. */
const SOON_DAYS = 7;

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The list for today: open (due today or overdue, by time), done today, and
 * the next seven days. Paused tasks and finished one-offs are left out.
 */
export function hofToday(tasks: FarmTask[], today: string, filter: HofFilter = "all", me: string | null = null) {
  const list = tasks.filter((t) => t.isActive && matches(t, filter, me));
  const byTime = (a: FarmTask, b: FarmTask) => a.dueDate.localeCompare(b.dueDate) || a.reminderTime.localeCompare(b.reminderTime) || a.id - b.id;
  const open = list.filter((t) => t.isDue).sort(byTime);
  const done = list.filter((t) => t.doneToday && !t.isDue).sort(byTime);
  const soonEnd = addDays(today, SOON_DAYS);
  const soon = list.filter((t) => !t.isDue && !t.doneToday && !t.isDone && t.dueDate <= soonEnd).sort(byTime);
  return { open, done, soon };
}

const DAY_ADVERBS = ["montags", "dienstags", "mittwochs", "donnerstags", "freitags", "samstags", "sonntags"];

/** "montags und donnerstags", "werktags", "jeden Tag" (as on the server, farmTaskRules.ts). */
export function weekdaysText(days: number[]): string {
  const key = days.join(",");
  if (key === "1,2,3,4,5,6,7") return "jeden Tag";
  if (key === "1,2,3,4,5") return "werktags";
  if (key === "6,7") return "am Wochenende";
  const words = days.map((d) => DAY_ADVERBS[d - 1]!);
  return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} und ${words.at(-1)}`;
}

/** "jeden Tag", "alle 2 Wochen", "montags und donnerstags", "einmalig am 27.10." */
export function scheduleText(t: Pick<FarmTask, "repeats" | "intervalValue" | "intervalUnit" | "startsOn" | "dueDate"> & { weekdays?: number[] | null }): string {
  if (!t.repeats) {
    const [, m, d] = (t.startsOn ?? t.dueDate).split("-");
    return `einmalig am ${Number(d)}.${Number(m)}.`;
  }
  if (t.weekdays && t.weekdays.length > 0) return weekdaysText(t.weekdays);
  if (t.intervalValue === 1) return t.intervalUnit === "Tage" ? "jeden Tag" : t.intervalUnit === "Wochen" ? "jede Woche" : "jeden Monat";
  return `alle ${t.intervalValue} ${t.intervalUnit}`;
}

/** "seit 2 Tagen" for an overdue task, else null. */
export function overdueText(dueDate: string, today: string): string | null {
  if (dueDate >= today) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
  return days === 1 ? "seit gestern" : `seit ${days} Tagen`;
}

/** At most this many tasks from one list. */
export const MAX_LIST = 20;

/**
 * A typed or spoken list → single tasks. New lines, commas, semicolons and
 * the sentences of the dictation (lib/speech.ts ends each phrase with a dot)
 * separate them, and so do the spoken words "dann", "danach", "außerdem",
 * "und dann", "nächste Aufgabe". A plain "und" does not: "Nassfutter und
 * Trockenfutter geben" stays one task.
 */
export function splitTaskList(text: string): string[] {
  const parts = text
    .replace(/\b(und dann|und danach|dann noch|danach|außerdem|nächste aufgabe|neue aufgabe|dann)\b/gi, "\n")
    .split(/[\n,;]+|[.!?](?:\s+|$)/)
    .map((p) => p.trim().replace(/^[-•*\d.)\s]+/, "").replace(/[.!?]+$/, "").trim())
    .filter((p) => p.length >= 2)
    .map((p) => (p.charAt(0).toLocaleUpperCase("de-DE") + p.slice(1)).slice(0, 80));
  return [...new Set(parts)].slice(0, MAX_LIST);
}

// ── KI-Aufgabenplan: without the AI ──────────────────────────────────────────

/** A proposed task, as the AI plan returns it (PlannedFarmTask). */
export type Planned = PlannedFarmTask;

const WEEKDAY_NAMES = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
const NUMBER_WORDS: Record<string, number> = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, zehn: 10, vierzehn: 14 };

function weekdayFrom(today: string, index: number): string {
  const d = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, ((index - d + 7) % 7) || 7);
}

interface Schedule {
  day?: string;
  repeat?: { every: number; unit: "Tage" | "Wochen" | "Monate" } | "once";
  /** 1 = Montag … 7 = Sonntag ("montags und donnerstags"). */
  weekdays?: number[];
  time?: string;
  person?: string | "all";
}

// Word boundaries that also hold for ä, ö, ü and ß (\b does not).
const w = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, "iu");

/** Day, repetition, time and person said in one piece of text; the words found are taken out. */
function readSchedule(piece: string, today: string): { schedule: Schedule; rest: string } {
  const s: Schedule = {};
  let t = ` ${piece} `;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = t.match(re);
    if (m) {
      fn(m);
      t = t.replace(re, " ");
    }
  };
  take(w(String.raw`(nur heute|einmalig|einmal)`), () => (s.repeat = "once"));
  take(w(String.raw`(täglich|jeden tag|jeden morgen|jeden abend)`), () => (s.repeat = { every: 1, unit: "Tage" }));
  take(w(String.raw`(wöchentlich|jede woche|einmal die woche)`), () => (s.repeat = { every: 1, unit: "Wochen" }));
  take(w(String.raw`(monatlich|jeden monat|einmal im monat)`), () => (s.repeat = { every: 1, unit: "Monate" }));
  take(w(String.raw`alle (\d{1,3}|zwei|drei|vier|fünf|sechs|sieben|zehn|vierzehn) (tage|wochen|monate)`), (m) => {
    const n = NUMBER_WORDS[m[1]!.toLowerCase()] ?? Number(m[1]);
    const unit = m[2]!.toLowerCase();
    if (n >= 1 && n <= 365) s.repeat = { every: n, unit: unit === "tage" ? "Tage" : unit === "wochen" ? "Wochen" : "Monate" };
  });
  take(w(String.raw`werktags|montags bis freitags|von montag bis freitag`), () => (s.weekdays = [1, 2, 3, 4, 5]));
  take(w(String.raw`(?:am|jedes) wochenende|samstags und sonntags`), () => (s.weekdays = [6, 7]));
  // "montags und donnerstags", "jeden Dienstag und Freitag", "montags, mittwochs und freitags".
  const DAY = String.raw`(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)`;
  take(w(String.raw`jeden ${DAY}(?:(?:, | und | sowie )${DAY})*|${DAY}s(?:(?:, | und | sowie )${DAY}s)*`), (m) => {
    const days = [...m[0].toLowerCase().matchAll(/montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag/g)].map((d) => WEEKDAY_NAMES.indexOf(d[0]) || 7);
    s.weekdays = [...new Set(days)].sort((a, b) => a - b);
  });
  take(w(String.raw`(übermorgen)`), () => (s.day = addDays(today, 2)));
  take(w(String.raw`(morgen)`), () => (s.day = addDays(today, 1)));
  take(w(String.raw`(heute)`), () => (s.day = today));
  take(w(String.raw`(?:am |nächsten )?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)`), (m) => (s.day = weekdayFrom(today, WEEKDAY_NAMES.indexOf(m[1]!.toLowerCase()))));
  take(w(String.raw`um (\d{1,2})(?:[:.](\d{2}))?(?: uhr)?`), (m) => {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h <= 23 && min <= 59) s.time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  });
  if (!s.time) take(w(String.raw`(morgens|früh)`), () => (s.time = "07:00"));
  if (!s.time) take(w(String.raw`(mittags)`), () => (s.time = "12:00"));
  if (!s.time) take(w(String.raw`(abends)`), () => (s.time = "18:00"));
  take(w(String.raw`für (alle|uns alle)`), () => (s.person = "all"));
  take(w(String.raw`für ([\p{L}-]+)`), (m) => (s.person = m[1]!));
  // Filler of spoken German.
  const rest = t
    .replace(/\b(muss|müssen|musst|soll|sollen|sollte|bitte|noch|mal|dann|auch|werden|wird|also|ich|wir|du|ihr|man)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(und|oder)\s+/i, "")
    .replace(/[.!?,]+$/, "");
  return { schedule: s, rest };
}

/** "das Ganze ist für morgen", "alles jeden Tag": applies to every task. */
const FOR_ALL = /^(das ganze|alles|alle aufgaben|die aufgaben|das|alle)?\s*(ist|sind|gilt|gelten)?\s*(für)?\s*$/i;

/**
 * The plan without the AI – offline, at the AI's daily limit, or when it is
 * not reachable. Splits like splitTaskList and reads simple words for day,
 * repetition, time and person; a day said once carries on to the next tasks.
 */
export function planLocally(
  text: string,
  today: string,
  team: { userId: string; displayName: string }[],
  defaults: { assigneeId: string | null; repeats: boolean },
): Planned[] {
  const pieces = splitTaskList(text);
  const parts = pieces.map((p) => readSchedule(p, today));
  const global: Schedule = {};
  for (const p of parts) if (FOR_ALL.test(p.rest)) Object.assign(global, p.schedule);
  let carriedDay: string | undefined;
  const out: Planned[] = [];
  for (const { schedule, rest } of parts) {
    if (FOR_ALL.test(rest) || rest.length < 2) continue;
    if (schedule.day) carriedDay = schedule.day;
    const day = schedule.day ?? carriedDay ?? global.day ?? today;
    const weekdays = schedule.weekdays ?? global.weekdays ?? null;
    const repeat = weekdays ? { every: 1, unit: "Wochen" as const } : (schedule.repeat ?? global.repeat ?? (defaults.repeats ? { every: 1, unit: "Tage" as const } : "once"));
    const person = schedule.person ?? global.person;
    const member =
      person && person !== "all"
        ? team.find((m) => m.displayName.toLocaleLowerCase("de-DE").split(/\s+/)[0] === person.toLocaleLowerCase("de-DE"))
        : person === "all"
          ? undefined
          : team.find((m) => m.userId === defaults.assigneeId);
    const title = (rest.charAt(0).toLocaleUpperCase("de-DE") + rest.slice(1)).slice(0, 80);
    out.push({
      title,
      area: guessArea(title),
      startsOn: day,
      repeats: repeat !== "once",
      intervalValue: repeat === "once" ? 1 : repeat.every,
      intervalUnit: repeat === "once" ? "Tage" : repeat.unit,
      weekdays,
      reminderTime: schedule.time ?? global.time ?? "08:00",
      assigneeId: member?.userId ?? null,
      assigneeName: member?.displayName ?? null,
      herdId: null,
      herdName: null,
    });
  }
  return out;
}

// Same words as the server (farmTaskRules.ts), for the preview only; the server decides.
function guessArea(title: string): FarmTaskArea {
  const t = title.toLocaleLowerCase("de-DE");
  if (/(huhn|hühn|hahn|küken|eier|\bei\b|gans|gäns|\benten?\b|meerschwein|kaninchen|ziege|\bschaf|pferd|pony|\bkuh|\bkühe|schwein|alpaka|\bhunde?\b|katze|biene|(?<!in)stall|futter|fütter|tränk|ausmist|einstreu|\bheu\b|weide|\btiere?\b)/.test(t)) return "tiere";
  if (/(garten|beet|gieß|giess|pflanz|säen|ernte|unkraut|rasen|mähen|hecke|gemüse|tomate|salat|kräuter|obst|kompost|blume|rose|baum|strauch)/.test(t)) return "garten";
  return "hof";
}

/** Whether a text is more than one plain task – then it goes through the plan (AI). */
export function needsPlan(text: string): boolean {
  if (splitTaskList(text).length > 1) return true;
  return /\b(heute|morgen|übermorgen|täglich|jeden|jede|wöchentlich|monatlich|alle \S+ (tage|wochen|monate)|einmalig|um \d|für |morgens|mittags|abends|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|werktags|wochenende)/i.test(text) || text.trim().split(/\s+/).length > 8;
}

/** "heute", "morgen", "Fr 30.10." */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "heute";
  if (day === addDays(today, 1)) return "morgen";
  if (day === addDays(today, 2)) return "übermorgen";
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
}
