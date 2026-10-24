// Kept apart from farmTasks.ts, which pulls in the push scheduler (and with
// it the AI client) – the health records must load without them.

import { db, farmTasksTable, type FarmTaskAction, type TaskIntervalUnit } from '@workspace/db';
import { and, asc, eq } from 'drizzle-orm';

import { FarmDataError } from './farmAnimals';

export interface MedicalRepeat {
  kind: 'deworm' | 'vaccinate';
  every: number;
  unit: TaskIntervalUnit;
}

export function checkRepeat(repeat: MedicalRepeat): void {
  if (!Number.isInteger(repeat.every) || repeat.every < 1 || repeat.every > 365) throw new FarmDataError(400, 'Der Abstand muss zwischen 1 und 365 liegen.');
}

/**
 * Erinnerung aus der Gesundheitsakte (docs/gesundheit-erinnerung.md): after a
 * deworming or vaccination, the animal's stall task "Entwurmen"/"Impfen" is
 * due one interval after the treatment. An active task of that kind for the
 * animal is reused – the newest treatment sets interval, notes and the day
 * it was done – otherwise one is created.
 */
export async function scheduleRepeat(farmId: number, animalId: number, repeat: MedicalRepeat, doneOn: string, what: string | null) {
  checkRepeat(repeat);
  const actionType: FarmTaskAction = repeat.kind === 'deworm' ? 'Entwurmen' : 'Impfen';
  // Noon UTC is the same day in Berlin.
  const doneAt = new Date(`${doneOn}T12:00:00Z`);
  const notes = what ? what.slice(0, 200) : null;
  const [existing] = await db
    .select({ id: farmTasksTable.id, lastCompletedAt: farmTasksTable.lastCompletedAt })
    .from(farmTasksTable)
    .where(and(eq(farmTasksTable.farmId, farmId), eq(farmTasksTable.animalId, animalId), eq(farmTasksTable.actionType, actionType), eq(farmTasksTable.isActive, true)))
    .orderBy(asc(farmTasksTable.id))
    .limit(1);
  if (existing) {
    // A treatment entered later but done earlier changes nothing.
    if (existing.lastCompletedAt === null || existing.lastCompletedAt <= doneAt) {
      await db
        .update(farmTasksTable)
        .set({ intervalValue: repeat.every, intervalUnit: repeat.unit, lastCompletedAt: doneAt, ...(notes ? { notes } : {}) })
        .where(eq(farmTasksTable.id, existing.id));
    }
    return;
  }
  await db
    .insert(farmTasksTable)
    .values({ farmId, animalId, herdId: null, actionType, notes, intervalValue: repeat.every, intervalUnit: repeat.unit, reminderTime: '08:00', isActive: true, lastCompletedAt: doneAt });
}
