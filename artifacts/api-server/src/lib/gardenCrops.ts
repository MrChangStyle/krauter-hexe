/**
 * New crops for the Anbaudaten (Beet-Architekt step 5, spec: "Neue Pflanzen:
 * KI-Entwurf, Admin gibt frei, danach gelten sie für alle").
 *
 * A caretaker asks for a crop the catalog does not know; the AI drafts its
 * data, which is coerced into the catalog's exact shape (unknown neighbours
 * dropped, numbers clamped). Only after the app owner approves it does the
 * crop count – for every farm, with the same fixed rules as the catalog.
 */

import { bedPlantingsTable, db, gardenCropsTable, plantsTable } from '@workspace/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { FarmDataError } from './farmAnimals';
import { GARDEN_CATALOG, cropByKey, fullCatalog, setApprovedCrops, type Crop, type CropGroup, type Feeder, type Light, type WeekRange } from './gardenCatalog';
import { speciesKey } from './speciesKey';

// ── Approved crops in memory ─────────────────────────────────────────────────

const RELOAD_MS = 60_000;
let loadedAt = 0;

/** Keeps the approved crops current (at most one query a minute per instance). */
export async function loadApprovedCrops(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < RELOAD_MS) return;
  const rows = await db.select().from(gardenCropsTable).where(eq(gardenCropsTable.status, 'approved'));
  setApprovedCrops(rows.flatMap((r) => (r.data && typeof r.data === 'object' ? [{ ...(r.data as unknown as Crop), key: r.key }] : [])));
  loadedAt = Date.now();
}

// ── Coercion of a draft ──────────────────────────────────────────────────────

const GROUPS: CropGroup[] = ['vegetable', 'herb', 'flower', 'fruit'];
const FEEDERS: Feeder[] = ['heavy', 'medium', 'light'];
const LIGHTS: Light[] = ['full', 'partial', 'shade'];
const GROUP_COLORS: Record<CropGroup, string> = { vegetable: '#7DBB6A', herb: '#8FAF6E', flower: '#E9A23B', fruit: '#D9534F' };

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
}

function int(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
}

function weeks(value: unknown): WeekRange | null {
  if (!value || typeof value !== 'object') return null;
  const from = int((value as Record<string, unknown>)['from'], -20, 30);
  const to = int((value as Record<string, unknown>)['to'], -20, 30);
  if (from === null || to === null) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** "Rote Bete" → "rote_bete" */
export function keyFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

/**
 * The model's answer as a catalog crop, or null when something essential is
 * missing. Neighbours must be keys of the catalog; everything else is clamped.
 */
export function coerceCrop(raw: Record<string, unknown>, key: string, fallbackName: string): Crop | null {
  const known = new Set(fullCatalog().map((c) => c.key));
  const neighbours = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === 'string' && known.has(k) && k !== key))].slice(0, 20) : [];
  const family = text(raw['family'], 40);
  const botanicalName = text(raw['botanicalName'], 80);
  const spacingCm = int(raw['spacingCm'], 5, 200);
  const rowSpacingCm = int(raw['rowSpacingCm'], 5, 250);
  const harvest = raw['harvest'] as Record<string, unknown> | undefined;
  const hFrom = int(harvest?.['from'], 1, 12);
  const hTo = int(harvest?.['to'], 1, 12);
  const sowIndoor = weeks(raw['sowIndoor']);
  const directSow = weeks(raw['directSow']);
  const plantOut = weeks(raw['plantOut']);
  const group = GROUPS.includes(raw['group'] as CropGroup) ? (raw['group'] as CropGroup) : null;
  const feeder = FEEDERS.includes(raw['feeder'] as Feeder) ? (raw['feeder'] as Feeder) : null;
  const light = LIGHTS.includes(raw['light'] as Light) ? (raw['light'] as Light) : null;
  if (!family || !botanicalName || !spacingCm || !rowSpacingCm || !hFrom || !hTo || !group || !feeder || !light) return null;
  if (!sowIndoor && !directSow && !plantOut) return null;
  const good = neighbours(raw['good']);
  const bad = neighbours(raw['bad']).filter((k) => !good.includes(k));
  const color = typeof raw['color'] === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw['color']) ? raw['color'] : GROUP_COLORS[group];
  return {
    key,
    name: text(raw['name'], 40) ?? fallbackName,
    botanicalName,
    group,
    family,
    feeder,
    spacingCm,
    rowSpacingCm,
    light,
    frostHardy: raw['frostHardy'] === true,
    sowIndoor,
    directSow,
    plantOut,
    harvest: { from: hFrom, to: hTo },
    good,
    bad,
    color,
  };
}

async function draftWithAi(name: string, botanicalName: string | null, key: string): Promise<Crop> {
  // Loaded on demand: the rest of this module (approved crops) runs without an AI key.
  const { TEXT_MODELS, runModelChain } = await import('./plantIdentification');
  const catalog = fullCatalog()
    .map((c) => `${c.key} (${c.name})`)
    .join(', ');
  const example = JSON.stringify(cropByKey('tomate'));
  const prompt = `Du bist Gärtnermeister und pflegst Anbaudaten für Hobbygärten in Deutschland.
Erstelle die Anbaudaten für: ${name}${botanicalName ? ` (${botanicalName})` : ''}.
Antworte nur mit einem JSON-Objekt in genau diesem Format (Beispiel Tomate):
${example}
Regeln:
- Wochenangaben ("sowIndoor", "directSow", "plantOut") zählen relativ zum letzten Frühjahrsfrost (0 = Woche des letzten Frosts, negativ = davor); null, wenn es diese Art der Aussaat nicht gibt.
- "harvest": Erntemonate 1–12 (from > to, wenn die Ernte über den Jahreswechsel geht).
- "group": vegetable, herb, flower oder fruit. "feeder": heavy, medium oder light. "light": full, partial oder shade.
- "family": deutscher Name der Pflanzenfamilie, wie im Beispiel.
- "good"/"bad": nur Schlüssel aus dieser Liste: ${catalog}.
- "name": deutscher Name, "botanicalName": wissenschaftlicher Name.
Gib nur gesicherte, übliche Gartenpraxis an.`;
  const parsed = (await runModelChain([{ role: 'user', parts: [{ text: prompt }] }], TEXT_MODELS, {
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
  })) as Record<string, unknown> | null;
  const crop = coerceCrop(parsed ?? {}, key, name);
  if (!crop) throw new Error('Incomplete crop draft from AI');
  return crop;
}

// ── Drafts ───────────────────────────────────────────────────────────────────

export interface CropDraft {
  crop: Crop;
  status: 'draft' | 'approved';
  createdAt: string;
}

function toDraft(row: typeof gardenCropsTable.$inferSelect): CropDraft {
  return { crop: { ...(row.data as unknown as Crop), key: row.key }, status: row.status, createdAt: row.createdAt.toISOString() };
}

export interface CropRequest {
  name?: string | null;
  plantId?: number | null;
}

/**
 * Asks the AI for a crop's data and keeps it as a draft for the owner. When
 * the catalog or an earlier draft already has the crop, that one is returned
 * (no new AI call) – `existing` says so.
 */
export async function requestCrop(
  userId: string,
  input: CropRequest,
  runAi: <T>(run: () => Promise<T>) => Promise<T | null>,
): Promise<{ draft: CropDraft; existing: boolean } | null> {
  let name = text(input.name, 40);
  let botanicalName: string | null = null;
  if (input.plantId != null) {
    const [plant] = await db
      .select({ germanName: plantsTable.germanName, botanicalName: plantsTable.botanicalName })
      .from(plantsTable)
      .where(eq(plantsTable.id, input.plantId));
    if (!plant) throw new FarmDataError(400, 'Diese Pflanze gibt es im Archiv nicht.');
    name = plant.germanName;
    botanicalName = plant.botanicalName;
  }
  if (!name) throw new FarmDataError(400, 'Bitte gib den Namen der Pflanze an.');
  const key = keyFor(name);
  if (key.length < 2) throw new FarmDataError(400, 'Bitte gib den Namen der Pflanze an.');

  await loadApprovedCrops();
  const species = botanicalName ? speciesKey(botanicalName) : null;
  const inCatalog =
    cropByKey(key) ??
    fullCatalog().find((c) => c.name.toLowerCase() === name!.toLowerCase() || (species !== null && speciesKey(c.botanicalName) === species));
  if (inCatalog) return { draft: { crop: inCatalog, status: 'approved', createdAt: new Date(0).toISOString() }, existing: true };
  const [earlier] = await db.select().from(gardenCropsTable).where(eq(gardenCropsTable.key, key));
  if (earlier) return { draft: toDraft(earlier), existing: true };

  const crop = await runAi(() => draftWithAi(name!, botanicalName, key));
  if (!crop) return null;
  await db
    .insert(gardenCropsTable)
    .values({ key, data: crop as unknown as Record<string, unknown>, requestedBy: userId })
    .onConflictDoNothing();
  const [row] = await db.select().from(gardenCropsTable).where(eq(gardenCropsTable.key, key));
  return { draft: toDraft(row!), existing: false };
}

/** Open drafts, oldest first (owner). */
export async function listCropDrafts(): Promise<CropDraft[]> {
  const rows = await db.select().from(gardenCropsTable).where(eq(gardenCropsTable.status, 'draft')).orderBy(asc(gardenCropsTable.createdAt));
  return rows.map(toDraft);
}

/**
 * Approves a draft: from now on it is part of the catalog, and plantings of
 * archive plants of that species get its data too.
 */
export async function approveCrop(key: string): Promise<CropDraft> {
  const [row] = await db
    .update(gardenCropsTable)
    .set({ status: 'approved', approvedAt: new Date() })
    .where(and(eq(gardenCropsTable.key, key), eq(gardenCropsTable.status, 'draft')))
    .returning();
  if (!row) throw new FarmDataError(404, 'Diesen Entwurf gibt es nicht (mehr).');
  await loadApprovedCrops(true);
  const crop = cropByKey(key);
  const species = crop ? speciesKey(crop.botanicalName) : null;
  if (species && !GARDEN_CATALOG.some((c) => speciesKey(c.botanicalName) === species)) {
    const unmatched = await db
      .select({ plantingId: bedPlantingsTable.id, botanicalName: plantsTable.botanicalName })
      .from(bedPlantingsTable)
      .innerJoin(plantsTable, eq(plantsTable.id, bedPlantingsTable.plantId))
      .where(isNull(bedPlantingsTable.cropKey));
    const ids = unmatched.filter((p) => speciesKey(p.botanicalName) === species).map((p) => p.plantingId);
    if (ids.length > 0) await db.update(bedPlantingsTable).set({ cropKey: key }).where(inArray(bedPlantingsTable.id, ids));
  }
  return toDraft(row);
}

/** Throws a draft away (owner); approved crops stay. */
export async function rejectCrop(key: string): Promise<void> {
  const deleted = await db
    .delete(gardenCropsTable)
    .where(and(eq(gardenCropsTable.key, key), eq(gardenCropsTable.status, 'draft')))
    .returning({ key: gardenCropsTable.key });
  if (deleted.length === 0) throw new FarmDataError(404, 'Diesen Entwurf gibt es nicht (mehr).');
}
