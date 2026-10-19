/**
 * Hof einrichten ("Meine Farm"): a checklist for a new farm – what is done is
 * read from the data, nothing is ticked by hand – and a quick start that sets
 * up a group of animals in one go: the group, its animals (numbered, to be
 * renamed later), a starting ration from the Futterplaner and the daily
 * reminders. Fixed rules, no AI.
 */

import {
  db,
  farmAnimalsTable,
  farmMembershipsTable,
  farmTasksTable,
  farmsTable,
  feedRationsTable,
  gardenBedsTable,
  herdsTable,
  type FarmSpecies,
} from '@workspace/db';
import { and, count, eq, isNotNull, isNull, like } from 'drizzle-orm';

import { FarmDataError, notFound, text } from './farmAnimals';
import { DEFAULT_FARM_NAME } from './farmMembers';
import { createFarmTask } from './farmTasks';
import { feedReminders, saveRation } from './feedPlanner';
import type { LifeStage } from './feedNeeds';

export const SETUP_STEPS = ['name', 'location', 'animals', 'rations', 'tasks', 'beds', 'members'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export interface FarmSetup {
  dismissed: boolean;
  steps: { key: SetupStep; done: boolean }[];
}

async function counted(query: Promise<{ n: number }[]>): Promise<boolean> {
  const [row] = await query;
  return (row?.n ?? 0) > 0;
}

export async function farmSetup(farmId: number): Promise<FarmSetup> {
  const [farm] = await db
    .select({ name: farmsTable.name, latitude: farmsTable.latitude, dismissedAt: farmsTable.setupDismissedAt })
    .from(farmsTable)
    .where(eq(farmsTable.id, farmId));
  if (!farm) throw notFound();
  const [animals, rations, tasks, beds, members] = await Promise.all([
    counted(db.select({ n: count() }).from(farmAnimalsTable).where(and(eq(farmAnimalsTable.farmId, farmId), isNull(farmAnimalsTable.archivedAt)))),
    counted(db.select({ n: count() }).from(feedRationsTable).where(eq(feedRationsTable.farmId, farmId))),
    counted(db.select({ n: count() }).from(farmTasksTable).where(eq(farmTasksTable.farmId, farmId))),
    counted(db.select({ n: count() }).from(gardenBedsTable).where(eq(gardenBedsTable.farmId, farmId))),
    db.select({ n: count() }).from(farmMembershipsTable).where(eq(farmMembershipsTable.farmId, farmId)).then(([r]) => (r?.n ?? 0) > 1),
  ]);
  // A bed with a location counts for the weather, too (see farmWeather.farmLocation).
  const bedLocation = await counted(
    db.select({ n: count() }).from(gardenBedsTable).where(and(eq(gardenBedsTable.farmId, farmId), isNotNull(gardenBedsTable.latitude))),
  );
  const done: Record<SetupStep, boolean> = {
    name: farm.name !== DEFAULT_FARM_NAME,
    location: farm.latitude !== null || bedLocation,
    animals,
    rations,
    tasks,
    beds,
    members,
  };
  return { dismissed: farm.dismissedAt !== null, steps: SETUP_STEPS.map((key) => ({ key, done: done[key] })) };
}

export async function dismissSetup(farmId: number, dismissed: boolean): Promise<FarmSetup> {
  await db.update(farmsTable).set({ setupDismissedAt: dismissed ? new Date() : null }).where(eq(farmsTable.id, farmId));
  return farmSetup(farmId);
}

// ── Quick start ──────────────────────────────────────────────────────────────

/** Name of one animal, and the group name to suggest. */
const NAMES: Record<FarmSpecies, { one: string; group: string; prefix: string }> = {
  poultry: { one: 'Huhn', group: 'Hühner', prefix: 'H' },
  rabbit: { one: 'Kaninchen', group: 'Kaninchen', prefix: 'K' },
  guineaPig: { one: 'Meerschweinchen', group: 'Meerschweinchen', prefix: 'M' },
  goat: { one: 'Ziege', group: 'Ziegen', prefix: 'Z' },
  sheep: { one: 'Schaf', group: 'Schafe', prefix: 'S' },
  horse: { one: 'Pferd', group: 'Pferde', prefix: 'P' },
  cattle: { one: 'Rind', group: 'Rinder', prefix: 'R' },
  pig: { one: 'Schwein', group: 'Schweine', prefix: 'SW' },
  cat: { one: 'Katze', group: 'Katzen', prefix: 'KA' },
  dog: { one: 'Hund', group: 'Hunde', prefix: 'HU' },
  other: { one: 'Tier', group: 'Tiere', prefix: 'T' },
};

/**
 * A sensible first ration per species from the feed list (per animal and day,
 * as fed) – a start to adjust in the Futterplaner, not a recommendation for
 * every animal. Cats and dogs get their complete feed as the label says.
 */
export const START_RATIONS: Partial<Record<FarmSpecies, { stage: LifeStage; items: [string, number][] }>> = {
  poultry: { stage: 'laying', items: [['legehennen', 120]] },
  rabbit: { stage: 'maintenance', items: [['heu', 150], ['kaninchenpellets', 25], ['moehre', 50]] },
  guineaPig: { stage: 'maintenance', items: [['heu', 60], ['meerschweinchenpellets', 15], ['petersilie', 15]] },
  goat: { stage: 'maintenance', items: [['heu', 1900], ['mineral_ziege', 15]] },
  sheep: { stage: 'maintenance', items: [['heu', 1700], ['mineral_schaf', 15]] },
  horse: { stage: 'maintenance', items: [['heu', 10000], ['mineral_pferd', 50]] },
  cattle: { stage: 'maintenance', items: [['heu', 14000], ['mineral_rind', 80]] },
  pig: { stage: 'maintenance', items: [['schweinefutter', 2600]] },
};

export interface QuickStartInput {
  species: FarmSpecies;
  count: number;
  name?: unknown;
}

export interface QuickStartResult {
  herdId: number;
  animals: number;
  rationId: number | null;
  tasks: number;
}

export async function quickStart(farmId: number, input: QuickStartInput): Promise<QuickStartResult> {
  const n = Number(input.count);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new FarmDataError(400, 'Bitte 1 bis 50 Tiere angeben.');
  const names = NAMES[input.species];
  if (!names) throw new FarmDataError(400, 'Diese Tierart gibt es nicht.');
  const groupName = text(input.name, 60, 'Der Name') ?? names.group;

  const herdId = await db.transaction(async (tx) => {
    const [herd] = await tx.insert(herdsTable).values({ farmId, name: groupName, species: input.species }).returning({ id: herdsTable.id });
    // Numbers that are free on this farm: H-1, H-2, … continuing after existing ones.
    const taken = new Set(
      (
        await tx
          .select({ nr: farmAnimalsTable.registrationNumber })
          .from(farmAnimalsTable)
          .where(and(eq(farmAnimalsTable.farmId, farmId), like(farmAnimalsTable.registrationNumber, `${names.prefix}-%`)))
      ).map((r) => r.nr),
    );
    const rows: (typeof farmAnimalsTable.$inferInsert)[] = [];
    for (let k = 1; rows.length < n; k++) {
      const nr = `${names.prefix}-${k}`;
      if (taken.has(nr)) continue;
      rows.push({ farmId, herdId: herd!.id, name: `${names.one} ${k}`, species: input.species, registrationNumber: nr, sex: 'unknown' });
    }
    await tx.insert(farmAnimalsTable).values(rows);
    return herd!.id;
  });

  let rationId: number | null = null;
  let tasks = 0;
  const start = START_RATIONS[input.species];
  if (start) {
    const ration = await saveRation(farmId, {
      herdId,
      stage: start.stage,
      items: start.items.map(([feedKey, grams]) => ({ feedKey, grams })),
      times: ['morgens', 'abends'],
      gradual: false,
    });
    rationId = ration.id;
    tasks += (await feedReminders(farmId, ration.id)).created;
  }
  tasks += 1;
  await createFarmTask(farmId, { actionType: 'Ausmisten', herdId, notes: null, intervalValue: 1, intervalUnit: 'Wochen', reminderTime: '10:00' });
  if (input.species === 'poultry') {
    tasks += 1;
    await createFarmTask(farmId, { actionType: 'Eier sammeln', herdId, notes: null, intervalValue: 1, intervalUnit: 'Tage', reminderTime: '17:00' });
  }
  return { herdId, animals: n, rationId, tasks };
}
