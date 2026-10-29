/**
 * Stall tasks of a farm ("Meine Farm", step 4), grown into the Hof-Aufgaben
 * (docs/hof-aufgaben.md): own wording, area, one-off tasks, a person, who
 * ticked it off, and comments.
 *
 * A separate table instead of extending the plant tasks: those belong to one
 * user and one plant (account deletion removes them, /aufgaben joins the
 * plant), these belong to the farm and are shared by its members. The
 * schedule model and the reminder cron (pushScheduler.ts) are the same.
 */

import {
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmTaskCommentsTable,
  farmTasksTable,
  FARM_TASK_AREAS,
  herdsTable,
  usersTable,
  type FarmTaskAction,
  type FarmTaskArea,
} from '@workspace/db';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { grantedSql } from './farmModules';
import { farmTaskDue, guessFarmTaskAction, guessFarmTaskArea, normalizeWeekdays } from './farmTaskRules';
import { berlinDayKey, berlinTodayKey, unitToDays } from './pushScheduler';
import { sendPushToUser } from './webPush';

type IntervalUnit = 'Tage' | 'Wochen' | 'Monate';

export interface FarmTaskInput {
  /** Without it, the action follows from the title (guessFarmTaskAction). */
  actionType?: FarmTaskAction | null;
  title?: unknown;
  area?: FarmTaskArea | null;
  startsOn?: string | null;
  repeats?: boolean;
  assigneeId?: string | null;
  animalId?: number | null;
  herdId?: number | null;
  notes?: unknown;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  /** 1 = Montag … 7 = Sonntag; replaces the interval when set. */
  weekdays?: unknown;
  reminderTime: string;
  isActive?: boolean;
}

const taskColumns = {
  id: farmTasksTable.id,
  animalId: farmTasksTable.animalId,
  animalName: farmAnimalsTable.name,
  herdId: farmTasksTable.herdId,
  herdName: herdsTable.name,
  actionType: farmTasksTable.actionType,
  title: farmTasksTable.title,
  area: farmTasksTable.area,
  startsOn: farmTasksTable.startsOn,
  repeats: farmTasksTable.repeats,
  assigneeId: farmTasksTable.assigneeId,
  lastCompletedBy: farmTasksTable.lastCompletedBy,
  notes: farmTasksTable.notes,
  intervalValue: farmTasksTable.intervalValue,
  intervalUnit: farmTasksTable.intervalUnit,
  weekdays: farmTasksTable.weekdays,
  reminderTime: farmTasksTable.reminderTime,
  isActive: farmTasksTable.isActive,
  lastCompletedAt: farmTasksTable.lastCompletedAt,
  createdAt: farmTasksTable.createdAt,
};

// Both joins also match the farm, so a name can never leak across farms.
const sameFarmAnimal = and(
  eq(farmAnimalsTable.id, farmTasksTable.animalId),
  eq(farmAnimalsTable.farmId, farmTasksTable.farmId),
);
const sameFarmHerd = and(eq(herdsTable.id, farmTasksTable.herdId), eq(herdsTable.farmId, farmTasksTable.farmId));

type TaskRow = Awaited<ReturnType<typeof selectTasks>>[number];

function selectTasks(farmId: number, taskId?: number) {
  return db
    .select(taskColumns)
    .from(farmTasksTable)
    .leftJoin(farmAnimalsTable, sameFarmAnimal)
    .leftJoin(herdsTable, sameFarmHerd)
    .where(
      taskId === undefined
        ? eq(farmTasksTable.farmId, farmId)
        : and(eq(farmTasksTable.farmId, farmId), eq(farmTasksTable.id, taskId)),
    )
    .orderBy(asc(farmTasksTable.reminderTime), asc(farmTasksTable.id));
}

/** Names of the farm's members, by user id; someone who left is not in it. */
async function memberNames(farmId: number): Promise<Map<string, string>> {
  const rows = await db
    .select({ userId: farmMembershipsTable.userId, firstName: usersTable.firstName, lastName: usersTable.lastName, username: usersTable.username, email: usersTable.email })
    .from(farmMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, farmMembershipsTable.userId))
    .where(eq(farmMembershipsTable.farmId, farmId));
  return new Map(rows.map((r) => [r.userId, [r.firstName, r.lastName].filter(Boolean).join(' ') || r.username || r.email?.split('@')[0] || 'Unbekannt']));
}

/** At most this many comments per task are sent along, the newest. */
const COMMENTS_PER_TASK = 20;

async function commentsOf(farmId: number, taskIds: number[]) {
  if (taskIds.length === 0) return [];
  return db
    .select({
      id: farmTaskCommentsTable.id,
      taskId: farmTaskCommentsTable.taskId,
      userId: farmTaskCommentsTable.userId,
      body: farmTaskCommentsTable.body,
      createdAt: farmTaskCommentsTable.createdAt,
    })
    .from(farmTaskCommentsTable)
    .where(and(eq(farmTaskCommentsTable.farmId, farmId), inArray(farmTaskCommentsTable.taskId, taskIds)))
    .orderBy(asc(farmTaskCommentsTable.createdAt), asc(farmTaskCommentsTable.id));
}

async function present(farmId: number, rows: TaskRow[], viewerId: string | null) {
  const today = berlinTodayKey();
  const names = await memberNames(farmId);
  const comments = await commentsOf(farmId, rows.map((r) => r.id));
  return rows.map((task) => {
    const completedDay = task.lastCompletedAt ? berlinDayKey(task.lastCompletedAt) : null;
    const { dueDate, done } = farmTaskDue({
      repeats: task.repeats,
      startsOn: task.startsOn,
      createdDay: berlinDayKey(task.createdAt),
      completedDay,
      intervalDays: task.intervalValue * unitToDays(task.intervalUnit),
      weekdays: task.weekdays,
    });
    // Someone who left the farm no longer counts: the task is for everyone again.
    const assigneeName = task.assigneeId ? (names.get(task.assigneeId) ?? null) : null;
    const own = comments.filter((c) => c.taskId === task.id);
    return {
      ...task,
      assigneeId: assigneeName ? task.assigneeId : null,
      assigneeName,
      lastCompletedByName: task.lastCompletedBy ? (names.get(task.lastCompletedBy) ?? 'Ehemaliges Mitglied') : null,
      dueDate,
      isDue: !done && task.isActive && dueDate <= today,
      isDone: done,
      doneToday: completedDay === today,
      commentCount: own.length,
      comments: own.slice(-COMMENTS_PER_TASK).map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        authorName: names.get(c.userId) ?? 'Ehemaliges Mitglied',
        isOwn: c.userId === viewerId,
      })),
    };
  });
}

export async function listFarmTasks(farmId: number, viewerId: string | null = null) {
  return present(farmId, await selectTasks(farmId), viewerId);
}

async function getFarmTask(farmId: number, taskId: number, viewerId: string | null = null) {
  const rows = await selectTasks(farmId, taskId);
  if (rows.length === 0) throw notFound();
  return (await present(farmId, rows, viewerId))[0]!;
}

async function taskValues(farmId: number, input: FarmTaskInput) {
  const animalId = input.animalId ?? null;
  const herdId = input.herdId ?? null;
  if (animalId !== null && herdId !== null) {
    throw new FarmDataError(400, 'Bitte wähle ein Tier oder eine Herde, nicht beides.');
  }
  // Animal and herd must belong to this very farm.
  if (animalId !== null) {
    const [animal] = await db
      .select({ id: farmAnimalsTable.id })
      .from(farmAnimalsTable)
      .where(and(eq(farmAnimalsTable.id, animalId), eq(farmAnimalsTable.farmId, farmId)));
    if (!animal) throw new FarmDataError(400, 'Dieses Tier gibt es auf der Farm nicht.');
  }
  if (herdId !== null) {
    const [herd] = await db
      .select({ id: herdsTable.id })
      .from(herdsTable)
      .where(and(eq(herdsTable.id, herdId), eq(herdsTable.farmId, farmId)));
    if (!herd) throw new FarmDataError(400, 'Diese Herde gibt es auf der Farm nicht.');
  }
  if (!Number.isInteger(input.intervalValue) || input.intervalValue < 1 || input.intervalValue > 365) {
    throw new FarmDataError(400, 'Der Abstand muss zwischen 1 und 365 liegen.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.reminderTime)) {
    throw new FarmDataError(400, 'Bitte gib eine Uhrzeit an (HH:MM).');
  }
  const title = text(input.title, 80, 'Die Aufgabe');
  const actionType = input.actionType ?? (title ? guessFarmTaskAction(title) : null);
  if (!actionType) throw new FarmDataError(400, 'Was ist zu tun? Bitte gib die Aufgabe an.');
  // A text without an area goes where its words point ("Teichpumpe" → Hof).
  const area = input.area ?? (title ? guessFarmTaskArea(title) : 'tiere');
  if (!FARM_TASK_AREAS.includes(area)) throw new FarmDataError(400, 'Diesen Bereich gibt es nicht.');
  const startsOn = input.startsOn ?? null;
  if (startsOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || Number.isNaN(Date.parse(`${startsOn}T00:00:00Z`)))) {
    throw new FarmDataError(400, 'Bitte gib ein gültiges Datum an.');
  }
  const repeats = input.repeats ?? true;
  if (!repeats && startsOn === null) throw new FarmDataError(400, 'Eine einmalige Aufgabe braucht einen Tag.');
  const weekdays = normalizeWeekdays(input.weekdays);
  if (weekdays === 'invalid') throw new FarmDataError(400, 'Bitte wähle Wochentage von Montag bis Sonntag.');
  const assigneeId = input.assigneeId ?? null;
  if (assigneeId !== null) {
    const [member] = await db
      .select({ id: farmMembershipsTable.id })
      .from(farmMembershipsTable)
      .where(and(eq(farmMembershipsTable.farmId, farmId), eq(farmMembershipsTable.userId, assigneeId)));
    if (!member) throw new FarmDataError(400, 'Diese Person gehört nicht zum Team.');
  }
  return {
    animalId,
    herdId,
    actionType,
    title,
    area,
    startsOn,
    repeats,
    assigneeId,
    notes: text(input.notes, 200, 'Die Notiz'),
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    // Weekdays only for a repeating task.
    weekdays: repeats ? weekdays : null,
    reminderTime: input.reminderTime,
    isActive: input.isActive ?? true,
  };
}

export async function createFarmTask(farmId: number, input: FarmTaskInput, viewerId: string | null = null) {
  const values = await taskValues(farmId, input);
  const [task] = await db
    .insert(farmTasksTable)
    .values({ farmId, ...values })
    .returning({ id: farmTasksTable.id });
  return getFarmTask(farmId, task!.id, viewerId);
}

export async function updateFarmTask(farmId: number, taskId: number, input: FarmTaskInput, viewerId: string | null = null) {
  const values = await taskValues(farmId, input);
  const updated = await db
    .update(farmTasksTable)
    .set(values)
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)))
    .returning({ id: farmTasksTable.id });
  if (updated.length === 0) throw notFound();
  return getFarmTask(farmId, taskId, viewerId);
}

export async function deleteFarmTask(farmId: number, taskId: number): Promise<void> {
  const deleted = await db
    .delete(farmTasksTable)
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)))
    .returning({ id: farmTasksTable.id });
  if (deleted.length === 0) throw notFound();
}

const LATE_TAP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Done now – or at `doneAt`, when "Am Stall" sends a tap later from its
 * offline queue (docs/stall.md). A later tap never moves an earlier
 * completion back.
 */
export async function completeFarmTask(farmId: number, taskId: number, doneAt?: Date, now = new Date(), userId: string | null = null) {
  let at = now;
  if (doneAt !== undefined) {
    if (Number.isNaN(doneAt.getTime()) || doneAt.getTime() < now.getTime() - LATE_TAP_MS) throw new FarmDataError(400, 'Das liegt zu weit zurück.');
    // A clock a little ahead counts as now.
    at = doneAt.getTime() > now.getTime() ? now : doneAt;
  }
  const last = farmTasksTable.lastCompletedAt;
  // The completion before today's is kept, so today's tick can be taken back.
  const today = berlinTodayKey();
  const updated = await db
    .update(farmTasksTable)
    .set({
      prevCompletedAt: sql`CASE WHEN ${last} IS NOT NULL AND to_char(${last} AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD') = ${today} THEN ${farmTasksTable.prevCompletedAt} ELSE ${last} END`,
      lastCompletedBy: sql`CASE WHEN ${last} IS NULL OR ${last} <= ${at} THEN ${userId}::text ELSE ${farmTasksTable.lastCompletedBy} END`,
      lastCompletedAt: sql`GREATEST(coalesce(${last}, ${at}), ${at})`,
    })
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)))
    .returning({ id: farmTasksTable.id });
  if (updated.length === 0) throw notFound();
  return getFarmTask(farmId, taskId, userId);
}

/** Takes back today's tick: the task is open again, as before. */
export async function uncompleteFarmTask(farmId: number, taskId: number, userId: string | null = null) {
  const [task] = await db
    .select({ lastCompletedAt: farmTasksTable.lastCompletedAt })
    .from(farmTasksTable)
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)));
  if (!task) throw notFound();
  if (!task.lastCompletedAt || berlinDayKey(task.lastCompletedAt) !== berlinTodayKey()) {
    throw new FarmDataError(400, 'Nur was heute abgehakt wurde, lässt sich zurücknehmen.');
  }
  await db
    .update(farmTasksTable)
    .set({ lastCompletedAt: farmTasksTable.prevCompletedAt, prevCompletedAt: null, lastCompletedBy: null })
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)));
  return getFarmTask(farmId, taskId, userId);
}

const MAX_COMMENTS_PER_TASK = 200;

/**
 * A comment on a task ("Wir brauchen neue Eierkartons"). The others on the
 * team who see the tasks get a push, so a wish does not get lost.
 */
export async function addFarmTaskComment(farmId: number, taskId: number, userId: string, rawBody: unknown) {
  const body = text(rawBody, 300, 'Der Kommentar', true);
  const [task] = await db
    .select({ title: farmTasksTable.title, actionType: farmTasksTable.actionType })
    .from(farmTasksTable)
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)));
  if (!task) throw notFound();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(farmTaskCommentsTable)
    .where(eq(farmTaskCommentsTable.taskId, taskId));
  if ((count ?? 0) >= MAX_COMMENTS_PER_TASK) throw new FarmDataError(400, 'Diese Aufgabe hat schon sehr viele Kommentare. Bitte lösche alte.');
  await db.insert(farmTaskCommentsTable).values({ farmId, taskId, userId, body });

  const names = await memberNames(farmId);
  const others = await db
    .select({ userId: farmMembershipsTable.userId })
    .from(farmMembershipsTable)
    .where(and(eq(farmMembershipsTable.farmId, farmId), ne(farmMembershipsTable.userId, userId), grantedSql('farm-tasks')));
  for (const { userId: to } of others) {
    await sendPushToUser(to, {
      topic: 'farm-tasks',
      title: `${names.get(userId) ?? 'Jemand'} zu „${task.title ?? task.actionType}“`,
      body: body.length > 120 ? `${body.slice(0, 119)}…` : body,
      tag: `farm-task-comment-${taskId}`,
      url: '/hof-aufgaben',
    });
  }
  return getFarmTask(farmId, taskId, userId);
}

/** Own comments; an admin may remove any. */
export async function deleteFarmTaskComment(farmId: number, taskId: number, commentId: number, userId: string, isAdmin: boolean) {
  const deleted = await db
    .delete(farmTaskCommentsTable)
    .where(
      and(
        eq(farmTaskCommentsTable.id, commentId),
        eq(farmTaskCommentsTable.taskId, taskId),
        eq(farmTaskCommentsTable.farmId, farmId),
        isAdmin ? undefined : eq(farmTaskCommentsTable.userId, userId),
      ),
    )
    .returning({ id: farmTaskCommentsTable.id });
  if (deleted.length === 0) throw notFound();
  return getFarmTask(farmId, taskId, userId);
}
