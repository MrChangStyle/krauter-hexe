import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmsTable,
  farmTasksTable,
  herdsTable,
  tasksTable,
  careGuidesTable,
  plantsTable,
  type Task,
  type CareGuide,
} from "@workspace/db";
import { logger } from "./logger";
import { sendGardenDigests } from "./gardenCalendar";
import { sendFeedDigests } from "./feedStock";
import { sendMedicineDigests } from "./medicines";
import { grantedSql } from "./farmModules";
import { sendDutyDigests } from "./farmDuties";
import { sendBreedingDigests } from "./breeding";
import { sendGrowDigests } from "./growWeather";
import { sendBeeDigests } from "./bees";
import { sendPantryDigests } from "./pantry";
import { sendPastureDigests } from "./pasture";
import { removeExpiredMemberships } from "./farmMembers";
import { sendPushToUser } from "./webPush";
import { careDue, careForecast, rainWaters, seasonalCareOn, sendFrostNotices } from "./careWeather";
import { sendWeatherDigests, WEATHER_DIGEST_TIME, type DayForecast } from "./farmWeather";

// All reminder times in the app are entered as German local wall-clock times
// (HH:MM), so the scheduler evaluates "now" in Europe/Berlin regardless of
// the server's own timezone.
const TIME_ZONE = "Europe/Berlin";

function berlinNow(): { hhmm: string; dateKey: string; date: Date } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hhmm: `${get("hour")}:${get("minute")}`,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    date: now,
  };
}

// Days since a reference date, counted in Berlin calendar days.
export function berlinDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`).getTime();
  const to = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function unitToDays(unit: Task["intervalUnit"]): number {
  if (unit === "Wochen") return 7;
  if (unit === "Monate") return 30;
  return 1;
}

// Due when at least one full interval has elapsed (in Berlin calendar days)
// since the last completion (or creation), evaluated at the task's reminder
// time. Plant care tasks add the weather and winter rules (careWeather.ts).
type Schedule = Pick<Task, "lastCompletedAt" | "createdAt" | "intervalValue" | "intervalUnit">;

export function isTaskDue(task: Schedule, todayKey: string): boolean {
  const ref = task.lastCompletedAt ?? task.createdAt;
  const elapsedDays = daysBetween(berlinDayKey(ref), todayKey);
  return elapsedDays >= task.intervalValue * unitToDays(task.intervalUnit);
}

interface DailyEntry {
  day: number;
  giessen?: boolean;
  bespruehen?: boolean;
  drehen?: boolean;
  duengen?: boolean;
  umtopfen?: boolean;
  beschneiden?: boolean;
}

const GUIDE_ACTION_LABELS: ReadonlyArray<[keyof DailyEntry, string]> = [
  ["umtopfen", "Umtopfen"],
  ["giessen", "Gießen"],
  ["bespruehen", "Besprühen"],
  ["beschneiden", "Beschneiden"],
  ["drehen", "Drehen"],
  ["duengen", "Düngen"],
];

function guideActionsForToday(guide: CareGuide, todayKey: string): string[] {
  // Day 1 is the guide's start date, counted in Berlin calendar days.
  const dayNo = daysBetween(berlinDayKey(guide.startDate), todayKey) + 1;
  if (dayNo < 1 || dayNo > 30) return [];

  let completed: number[] = [];
  try {
    completed = JSON.parse(guide.completedDays) as number[];
  } catch {
    /* treat unparseable as none completed */
  }
  if (completed.includes(dayNo)) return [];

  let plan: DailyEntry[] = [];
  try {
    plan = JSON.parse(guide.dailyPlan) as DailyEntry[];
  } catch {
    return [];
  }
  const entry = plan.find((e) => e.day === dayNo);
  if (!entry) return [];
  return GUIDE_ACTION_LABELS.filter(([key]) => entry[key] === true).map(
    ([, label]) => label,
  );
}

/**
 * Evaluate all due task reminders and care-guide reminders for the current
 * Berlin minute and send push notifications to their owners.
 *
 * Idempotency: each task/guide row stores `lastNotifiedAt`. A notification is
 * only sent when `lastNotifiedAt` is null OR its Berlin calendar date differs
 * from today's — so calling this function multiple times within the same
 * minute is safe and produces at most one notification per item per day.
 *
 * @returns the number of notifications sent
 */
/** The Berlin day (YYYY-MM-DD) a task is next due – same rule as isTaskDue. */
export function nextDueDayKey(task: Schedule): string {
  const ref = berlinDayKey(task.lastCompletedAt ?? task.createdAt);
  const due = new Date(`${ref}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + task.intervalValue * unitToDays(task.intervalUnit));
  return due.toISOString().slice(0, 10);
}

export function berlinTodayKey(): string {
  return berlinNow().dateKey;
}

let frostCheckedOn: string | null = null;

export async function triggerDueNotifications(): Promise<number> {
  const { hhmm, dateKey } = berlinNow();
  let triggered = 0;

  // Vertretung: a stand-in past their last day is no member any more – before
  // any push, so nobody gets reminders for a farm they left.
  await removeExpiredMemberships(dateKey);

  // ── Task reminders ────────────────────────────────────────────────────────
  const dueTasks = await db
    .select({ task: tasksTable, plantName: plantsTable.germanName })
    .from(tasksTable)
    .leftJoin(plantsTable, eq(plantsTable.id, tasksTable.plantId))
    .where(
      and(eq(tasksTable.isActive, true), eq(tasksTable.reminderTime, hhmm)),
    );

  // Wetterabhängige Pflege (careWeather.ts): per account its winter setting
  // and today's weather, looked up once per run.
  const seasonal = new Map<string, boolean>();
  const weather = new Map<string, DayForecast | null>();
  for (const { task, plantName } of dueTasks) {
    // DB-side dedup: skip if a notification was already sent today (Berlin day).
    const alreadySentToday =
      task.lastNotifiedAt !== null &&
      berlinDayKey(task.lastNotifiedAt) === dateKey;
    if (alreadySentToday) continue;
    if (!seasonal.has(task.userId)) seasonal.set(task.userId, await seasonalCareOn(task.userId));
    if (!careDue(task, dateKey, seasonal.get(task.userId)!)) continue;

    if (task.outdoor && task.actionType === "Gießen") {
      if (!weather.has(task.userId)) {
        const days = await careForecast(task.userId, dateKey).catch((): DayForecast[] => []);
        weather.set(task.userId, days.find((d) => d.date === dateKey) ?? null);
      }
      if (rainWaters(task, weather.get(task.userId)!)) {
        // The rain waters today: done, no push.
        const now = new Date();
        await db
          .update(tasksTable)
          .set({ lastCompletedAt: now, lastNotifiedAt: now, rainSkippedOn: dateKey })
          .where(eq(tasksTable.id, task.id));
        continue;
      }
    }

    await sendPushToUser(task.userId, { topic: "plant-care",
      title: "Pflanzenaufgabe fällig",
      body: `Zeit zum ${task.actionType} für ${plantName ?? "deine Pflanze"}!`,
      tag: `task-${task.id}`,
      url: "/aufgaben",
    });
    await db
      .update(tasksTable)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(tasksTable.id, task.id));
    triggered++;
  }

  // ── Stall tasks ("Meine Farm") ───────────────────────────────────────────
  // Shared by the farm: every admin and caretaker gets the reminder (guests
  // cannot tick tasks off). Same once-per-Berlin-day guard as above.
  const dueFarmTasks = await db
    .select({
      task: farmTasksTable,
      farmName: farmsTable.name,
      animalName: farmAnimalsTable.name,
      herdName: herdsTable.name,
    })
    .from(farmTasksTable)
    .innerJoin(farmsTable, eq(farmsTable.id, farmTasksTable.farmId))
    .leftJoin(
      farmAnimalsTable,
      and(eq(farmAnimalsTable.id, farmTasksTable.animalId), eq(farmAnimalsTable.farmId, farmTasksTable.farmId)),
    )
    .leftJoin(
      herdsTable,
      and(eq(herdsTable.id, farmTasksTable.herdId), eq(herdsTable.farmId, farmTasksTable.farmId)),
    )
    .where(
      and(eq(farmTasksTable.isActive, true), eq(farmTasksTable.reminderTime, hhmm)),
    );

  for (const { task, farmName, animalName, herdName } of dueFarmTasks) {
    const alreadySentToday =
      task.lastNotifiedAt !== null &&
      berlinDayKey(task.lastNotifiedAt) === dateKey;
    if (alreadySentToday || !isTaskDue(task, dateKey)) continue;

    const members = await db
      .select({ userId: farmMembershipsTable.userId })
      .from(farmMembershipsTable)
      .where(
        and(
          eq(farmMembershipsTable.farmId, task.farmId),
          inArray(farmMembershipsTable.role, ["admin", "caretaker"]),
          grantedSql("farm-tasks"),
        ),
      );
    const target = animalName ?? herdName;
    for (const { userId } of members) {
      await sendPushToUser(userId, { topic: "farm-tasks",
        title: "Stall-Aufgabe fällig",
        body: `${task.actionType}${target ? ` – ${target}` : ""} (${farmName})`,
        tag: `farm-task-${task.id}`,
        url: "/farm/aufgaben",
      });
    }
    await db
      .update(farmTasksTable)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(farmTasksTable.id, task.id));
    triggered++;
  }

  // ── Care-guide reminders ──────────────────────────────────────────────────
  const guides = await db
    .select()
    .from(careGuidesTable)
    .where(
      and(
        eq(careGuidesTable.status, "Aktiv"),
        eq(careGuidesTable.reminderEnabled, true),
        eq(careGuidesTable.reminderTime, hhmm),
      ),
    );

  for (const guide of guides) {
    const alreadySentToday =
      guide.lastNotifiedAt !== null &&
      berlinDayKey(guide.lastNotifiedAt) === dateKey;
    if (alreadySentToday) continue;

    const actions = guideActionsForToday(guide, dateKey);
    if (actions.length === 0) continue;

    await sendPushToUser(guide.userId, { topic: "plant-care",
      title: "Pflege-Guide Erinnerung",
      body: `Heute steht ${actions.join(" & ")} für ${guide.plantName} an!`,
      tag: `care-guide-${guide.id}`,
      url: `/pflege-guide/${guide.id}`,
    });
    await db
      .update(careGuidesTable)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(careGuidesTable.id, guide.id));
    triggered++;
  }

  // ── Garden (Beet-Architekt) ─────────────────────────────────────────────
  // One push per farm and day from 07:30: dates starting today, frost warning.
  triggered += await sendGardenDigests(hhmm, dateKey);

  // ── Futterplaner: buy more feed ───────────────────────────────────────────
  triggered += await sendFeedDigests(hhmm, dateKey);

  // ── Weather warnings for the farm ─────────────────────────────────────────
  triggered += await sendWeatherDigests(hhmm, dateKey);

  // ── Arzneimittel-Vorrat: expiry ───────────────────────────────────────────
  triggered += await sendMedicineDigests(hhmm, dateKey);

  // ── Pflichten: stock report in January ────────────────────────────────────
  triggered += await sendDutyDigests(hhmm, dateKey);

  // ── Zucht: today's steps ──────────────────────────────────────────────────
  triggered += await sendBreedingDigests(hhmm, dateKey);

  // ── Grow: plan steps and weather warnings (discreet by default) ───────────
  triggered += await sendGrowDigests(hhmm, dateKey);

  // ── Bienen: swarm checks, treatments, feeding – on the day they come due ──
  triggered += await sendBeeDigests(hhmm, dateKey);

  // ── Vorratskammer: on Mondays, what to use up within 14 days ─────────────
  triggered += await sendPantryDigests(hhmm, dateKey);

  // ── Weide: a pasture ready again, a herd that should move on ─────────────
  triggered += await sendPastureDigests(hhmm, dateKey);

  // ── Pflegeplan: frost in sight for plants outside, once a day per process ─
  if (hhmm >= WEATHER_DIGEST_TIME && frostCheckedOn !== dateKey) {
    frostCheckedOn = dateKey;
    triggered += await sendFrostNotices(dateKey, sendPushToUser);
  }

  return triggered;
}
