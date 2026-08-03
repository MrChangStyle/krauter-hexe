import { eq, and } from "drizzle-orm";
import {
  db,
  tasksTable,
  careGuidesTable,
  plantsTable,
  type Task,
  type CareGuide,
} from "@workspace/db";
import { logger } from "./logger";
import { sendPushToUser } from "./webPush";

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
function berlinDayKey(d: Date): string {
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

function unitToDays(unit: Task["intervalUnit"]): number {
  if (unit === "Wochen") return 7;
  if (unit === "Monate") return 30;
  return 1;
}

// Mirrors the client-side isTaskDueNow logic: due when at least one full
// interval has elapsed (in Berlin calendar days) since the last completion
// (or creation), evaluated at the task's reminder time.
function isTaskDue(task: Task, todayKey: string): boolean {
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
export async function triggerDueNotifications(): Promise<number> {
  const { hhmm, dateKey } = berlinNow();
  let triggered = 0;

  // ── Task reminders ────────────────────────────────────────────────────────
  const dueTasks = await db
    .select({ task: tasksTable, plantName: plantsTable.germanName })
    .from(tasksTable)
    .leftJoin(plantsTable, eq(plantsTable.id, tasksTable.plantId))
    .where(
      and(eq(tasksTable.isActive, true), eq(tasksTable.reminderTime, hhmm)),
    );

  for (const { task, plantName } of dueTasks) {
    // DB-side dedup: skip if a notification was already sent today (Berlin day).
    const alreadySentToday =
      task.lastNotifiedAt !== null &&
      berlinDayKey(task.lastNotifiedAt) === dateKey;
    if (alreadySentToday || !isTaskDue(task, dateKey)) continue;

    await sendPushToUser(task.userId, {
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

    await sendPushToUser(guide.userId, {
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

  return triggered;
}
