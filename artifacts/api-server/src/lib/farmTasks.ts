/**
 * Stall tasks of a farm ("Meine Farm", step 4).
 *
 * A separate table instead of extending the plant tasks: those belong to one
 * user and one plant (account deletion removes them, /aufgaben joins the
 * plant), these belong to the farm and are shared by its members. The
 * schedule model and the reminder cron (pushScheduler.ts) are the same.
 */

import { db, farmAnimalsTable, farmTasksTable, herdsTable, type FarmTaskAction } from '@workspace/db';
import { and, asc, eq } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { berlinTodayKey, nextDueDayKey } from './pushScheduler';

type IntervalUnit = 'Tage' | 'Wochen' | 'Monate';

export interface FarmTaskInput {
  actionType: FarmTaskAction;
  animalId?: number | null;
  herdId?: number | null;
  notes?: unknown;
  intervalValue: number;
  intervalUnit: IntervalUnit;
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
  notes: farmTasksTable.notes,
  intervalValue: farmTasksTable.intervalValue,
  intervalUnit: farmTasksTable.intervalUnit,
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

function withDue(task: TaskRow, todayKey: string) {
  const dueDate = nextDueDayKey(task);
  return { ...task, dueDate, isDue: dueDate <= todayKey };
}

export async function listFarmTasks(farmId: number) {
  const today = berlinTodayKey();
  return (await selectTasks(farmId)).map((t) => withDue(t, today));
}

async function getFarmTask(farmId: number, taskId: number) {
  const [task] = await selectTasks(farmId, taskId);
  if (!task) throw notFound();
  return withDue(task, berlinTodayKey());
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
  return {
    animalId,
    herdId,
    actionType: input.actionType,
    notes: text(input.notes, 200, 'Die Notiz'),
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    reminderTime: input.reminderTime,
    isActive: input.isActive ?? true,
  };
}

export async function createFarmTask(farmId: number, input: FarmTaskInput) {
  const values = await taskValues(farmId, input);
  const [task] = await db
    .insert(farmTasksTable)
    .values({ farmId, ...values })
    .returning({ id: farmTasksTable.id });
  return getFarmTask(farmId, task!.id);
}

export async function updateFarmTask(farmId: number, taskId: number, input: FarmTaskInput) {
  const values = await taskValues(farmId, input);
  const updated = await db
    .update(farmTasksTable)
    .set(values)
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)))
    .returning({ id: farmTasksTable.id });
  if (updated.length === 0) throw notFound();
  return getFarmTask(farmId, taskId);
}

export async function deleteFarmTask(farmId: number, taskId: number): Promise<void> {
  const deleted = await db
    .delete(farmTasksTable)
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)))
    .returning({ id: farmTasksTable.id });
  if (deleted.length === 0) throw notFound();
}

/** Done now: the next due day moves one interval ahead of today. */
export async function completeFarmTask(farmId: number, taskId: number) {
  const updated = await db
    .update(farmTasksTable)
    .set({ lastCompletedAt: new Date() })
    .where(and(eq(farmTasksTable.id, taskId), eq(farmTasksTable.farmId, farmId)))
    .returning({ id: farmTasksTable.id });
  if (updated.length === 0) throw notFound();
  return getFarmTask(farmId, taskId);
}
