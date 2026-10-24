/**
 * Demo-Daten (docs/demo.md): example data to look around the app – two of
 * each, on a farm of its own ("Demo-Hof", farms.is_demo) so nothing mixes
 * with real data. "Demo-Daten löschen" deletes that farm whole (everything on
 * it goes with it) and the demo grow (grows.is_demo).
 *
 * Everything is created through the modules' own functions, so the demo
 * shows exactly what a user would get.
 */

import { db, farmAnimalsTable, farmMembershipsTable, farmsTable, farmYieldsTable, growAccessTable, growsTable } from '@workspace/db';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { addFeeding, addHoney, addInspection, addTreatment, createColony } from './bees';
import { createBreeding } from './breeding';
import { createItem as createPantryItem, takeOut } from './pantry';
import { FarmDataError } from './farmAnimals';
import { createCamera } from './farmCameras';
import { createContact } from './farmContacts';
import { quickStart } from './farmSetup';
import { addExpense, addYield } from './farmYields';
import { addDays } from './feedSeason';
import { buyFeed } from './feedStock';
import { createBed } from './gardenBeds';
import { addPlanting } from './gardenPlanner';
import { addPlant, createGrow } from './grow';
import { createMedicine } from './medicines';
import { berlinDay } from './monitoring';
import { createSeed } from './seeds';

export const DEMO_FARM_NAME = 'Demo-Hof';

export interface DemoStatus {
  active: boolean;
  /** The Demo-Hof, to switch to it. */
  farmId: number | null;
}

async function demoFarmIds(userId: string): Promise<number[]> {
  const rows = await db
    .select({ id: farmsTable.id })
    .from(farmsTable)
    .innerJoin(farmMembershipsTable, eq(farmMembershipsTable.farmId, farmsTable.id))
    .where(and(eq(farmsTable.isDemo, true), eq(farmMembershipsTable.userId, userId), eq(farmMembershipsTable.role, 'admin')));
  return rows.map((r) => r.id);
}

export async function demoStatus(userId: string): Promise<DemoStatus> {
  const [farmId] = await demoFarmIds(userId);
  const [grow] = await db.select({ id: growsTable.id }).from(growsTable).where(and(eq(growsTable.userId, userId), eq(growsTable.isDemo, true))).limit(1);
  return { active: farmId !== undefined || !!grow, farmId: farmId ?? null };
}

/** Fills a new Demo-Hof with two examples per module, and a demo grow for adults who confirmed their age. */
export async function loadDemo(userId: string, today = berlinDay()): Promise<DemoStatus> {
  if ((await demoStatus(userId)).active) throw new FarmDataError(409, 'Die Demo-Daten sind schon geladen.');
  const [farm] = await db.insert(farmsTable).values({ name: DEMO_FARM_NAME, isDemo: true }).returning({ id: farmsTable.id });
  const farmId = farm!.id;
  await db.insert(farmMembershipsTable).values({ farmId, userId, role: 'admin' });
  try {
    await fill(userId, farmId, today);
  } catch (err) {
    // Half a demo helps nobody: take it away again.
    await deleteDemo(userId);
    throw err;
  }
  return { active: true, farmId };
}

async function fill(userId: string, farmId: number, today: string): Promise<void> {
  const ago = (n: number) => addDays(today, -n);
  const year = Number(today.slice(0, 4));

  // Tiere, Stall-Aufgaben and Futterplaner: two groups with ration and reminders.
  await quickStart(farmId, { species: 'poultry', count: 2, name: 'Hühner' });
  const goats = await quickStart(farmId, { species: 'goat', count: 2, name: 'Ziegen' });
  // Futtervorrat: a sack of layer feed nearly gone, hay for a while.
  await buyFeed(farmId, { feedKey: 'legehennen', packages: 1, packageKg: 5 });
  await buyFeed(farmId, { feedKey: 'heu', packages: 4, packageKg: 20 });

  // Zucht: a goat in kid, a clutch under a hen.
  const [goat] = await db
    .update(farmAnimalsTable)
    .set({ sex: 'female' })
    .where(eq(farmAnimalsTable.id, db.select({ id: farmAnimalsTable.id }).from(farmAnimalsTable).where(eq(farmAnimalsTable.herdId, goats.herdId)).orderBy(asc(farmAnimalsTable.id)).limit(1)))
    .returning({ id: farmAnimalsTable.id });
  await createBreeding(farmId, { species: 'goat', motherId: goat!.id, fatherName: 'Bock vom Nachbarn', startedOn: ago(130), notes: 'Demo: Deckakt beim Nachbarn' });
  await createBreeding(farmId, { species: 'poultry', startedOn: ago(12), eggCount: 8, notes: 'Demo: Glucke im Stall' });

  // Arzneimittel: one running out soon, one fine.
  await createMedicine(farmId, { name: 'Wurmkur Ziege (Demo)', unit: 'ml', amount: 40, expiresOn: addDays(today, 20), withdrawalMeatDays: 14, withdrawalMilkDays: 5, receivedOn: ago(60) });
  await createMedicine(farmId, { name: 'Wundspray (Demo)', unit: 'Stück', amount: 1, expiresOn: addDays(today, 400), receivedOn: ago(30) });

  // Ertrag & Bilanz: eight weeks of eggs (Legeleistung, laying less lately), milk, one expense.
  const eggs = [];
  for (let n = 2; n <= 56; n++) {
    const amount = n > 14 ? (n % 3 === 0 ? 1 : 2) : n % 2;
    if (amount > 0) eggs.push({ farmId, product: 'eggs', date: ago(n), amount });
  }
  await db.insert(farmYieldsTable).values(eggs);
  await addYield(farmId, { product: 'eggs', date: ago(1), amount: 2 });
  await addYield(farmId, { product: 'milk', date: ago(1), amount: 3 });
  await addExpense(farmId, { date: ago(5), category: 'feed', amountEur: 24.9, note: 'Demo: Legehennenfutter' });

  // Wildtier-Radar: two cameras without events.
  await createCamera(farmId, { name: 'Hühnerstall (Demo)', relayUrl: null, cooldownSeconds: 300 });
  await createCamera(farmId, { name: 'Weide (Demo)', relayUrl: null, cooldownSeconds: 600 });

  // Bienen: two colonies with a hive card.
  const linde = (await createColony(farmId, { name: 'Linde (Demo)', apiary: 'Obstwiese', hiveType: 'Zander', queenYear: year - 1, queenMarked: true, queenOrigin: 'Eigene Nachzucht' }, today)).colony.id;
  const raps = (await createColony(farmId, { name: 'Raps (Demo)', apiary: 'Obstwiese', hiveType: 'Zander', queenYear: year - 3 }, today)).colony.id;
  await addInspection(farmId, linde, { date: ago(12), beeFrames: 16, broodFrames: 7, queenSeen: true, eggsSeen: true, queenCells: 0, temper: 1, mitesPerDay: 2 });
  await addInspection(farmId, linde, { date: ago(3), beeFrames: 17, broodFrames: 6, queenSeen: false, eggsSeen: true, queenCells: 0, temper: 2, foodKg: 8 });
  await addInspection(farmId, raps, { date: ago(5), beeFrames: 11, broodFrames: 4, eggsSeen: true, temper: 3, mitesPerDay: 6 });
  await addFeeding(farmId, linde, { date: ago(20), kind: 'sirup', amountKg: 5 });
  await addTreatment(farmId, raps, { date: ago(40), method: 'drohnenbrut', notes: 'Demo' });
  await addHoney(farmId, linde, { date: ago(60), amountKg: 14, note: 'Frühtracht' });

  // Vorratskammer: preserved, frozen, honey – one to use up soon.
  const beans = await createPantryItem(farmId, { name: 'Bohnen sauer (Demo)', kind: 'pickled', amount: 6, unit: 'Glas', location: 'Keller', madeOn: ago(70), bestBefore: addDays(today, 300) });
  await takeOut(farmId, beans, 1, ago(10));
  await createPantryItem(farmId, { name: 'Kirschen (Demo)', kind: 'frozen', amount: 3, unit: 'Beutel', location: 'Gefriertruhe', madeOn: ago(260), bestBefore: addDays(today, 12) });
  await createPantryItem(farmId, { name: 'Blütenhonig (Demo)', kind: 'honey', amount: 8, unit: 'Glas', location: 'Keller', madeOn: ago(60), bestBefore: addDays(today, 670) });

  // Beet-Architekt and Saatgut.
  const raised = await createBed(farmId, { name: 'Hochbeet (Demo)', type: 'raised', lengthCm: 200, widthCm: 100 });
  const bed = await createBed(farmId, { name: 'Gemüsebeet (Demo)', type: 'bed', lengthCm: 300, widthCm: 120 });
  await addPlanting(farmId, raised.id, year, { cropKey: 'tomate', x: 0, y: 0 });
  await addPlanting(farmId, bed.id, year, { cropKey: 'salat', x: 1, y: 1 });
  await createSeed(farmId, { cropKey: 'tomate', variety: 'Ochsenherz', amount: 30, unit: 'Korn', source: 'bought', harvestYear: year - 1 }, today);
  await createSeed(farmId, { cropKey: 'moehre', variety: 'Nantaise', amount: 2, unit: 'g', source: 'bought', harvestYear: year - 3 }, today);

  // Farm & Team: the vet and a helper.
  await createContact(farmId, { kind: 'vet', name: 'Tierarztpraxis Muster (Demo)', role: 'Großtiere und Geflügel', phone: '0123 456789', note: 'Notdienst über die Praxisnummer' });
  await createContact(farmId, { kind: 'team', name: 'Lena (Demo)', role: 'Stallhilfe am Wochenende', phone: '0170 0000000' });

  // Grow: only for adults who already confirmed their age.
  const [access] = await db.select({ confirmed: growAccessTable.ageConfirmedAt }).from(growAccessTable).where(eq(growAccessTable.userId, userId));
  if (access?.confirmed) {
    const growId = await createGrow(userId, { name: 'Demo-Zelt', environment: 'indoor', medium: 'soil', tentSize: '80×80×160', lightType: 'LED', lightWatts: 240, fanWatts: 30 });
    await db.update(growsTable).set({ isDemo: true }).where(eq(growsTable.id, growId));
    await addPlant(userId, growId, { name: 'Demo 1', strain: 'Beispielsorte', strainType: 'hybrid', flowering: 'photo', seedSex: 'feminized', startedOn: ago(40) });
    await addPlant(userId, growId, { name: 'Demo 2', strainType: 'ruderalis', flowering: 'auto', seedSex: 'feminized', startedOn: ago(20) });
  }
}

/** Removes every Demo-Hof of the account (with all on it) and the demo grow; real data stays. */
export async function deleteDemo(userId: string): Promise<DemoStatus> {
  const farms = await demoFarmIds(userId);
  if (farms.length > 0) await db.delete(farmsTable).where(and(inArray(farmsTable.id, farms), eq(farmsTable.isDemo, true)));
  await db.delete(growsTable).where(and(eq(growsTable.userId, userId), eq(growsTable.isDemo, true)));
  return { active: false, farmId: null };
}
