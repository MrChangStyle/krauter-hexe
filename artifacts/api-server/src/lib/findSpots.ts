/**
 * Fundorte (docs/fundorte.md): the shared map of where a species of the
 * archive was found.
 *
 * Privacy by design:
 * - only accounts that said yes (user_settings.share_find_spots) put finds on it;
 * - the app rounds the position to a ~2 km cell before sending; the server
 *   rounds again and keeps only the cell number, never coordinates;
 * - only the month is kept, no time, no name; the map shows counts per cell;
 * - protected species (PROTECTED_*) show on a ~25 km grid only, so a spot
 *   cannot be found again;
 * - saying no later, or deleting the account, removes the person's finds.
 */
import { db, findSpotsTable, insectScansTable, insectsTable, plantScansTable, plantsTable } from '@workspace/db';
import { and, count, eq, gte, sql } from 'drizzle-orm';

export type FindSpotKind = 'plant' | 'insect';

/** Edge length of a cell on the map (km). Richtwerte, see docs/fundorte.md "Offen". */
export const CELL_KM = 2;
export const PROTECTED_CELL_KM = 25;
/** New finds per account and day – keeps one account from painting the map. */
export const MAX_FINDS_PER_DAY = 30;

const KM_PER_DEGREE = 111.32;

export interface Cell {
  row: number;
  col: number;
}

function latStep(km: number): number {
  return km / KM_PER_DEGREE;
}

function lonStep(km: number, row: number): number {
  const centreLat = (row + 0.5) * latStep(km);
  // Near the poles a cell would get very wide; keep it finite.
  return latStep(km) / Math.max(Math.cos((centreLat * Math.PI) / 180), 0.05);
}

/** The cell of a position on a grid of `km` cells. */
export function cellOf(lat: number, lon: number, km = CELL_KM): Cell {
  const row = Math.floor(lat / latStep(km));
  const col = Math.floor(lon / lonStep(km, row));
  return { row, col };
}

/** Centre of a cell, rounded to 4 places (≈ 10 m – far below the cell size). */
export function cellCentre(cell: Cell, km = CELL_KM): { lat: number; lon: number } {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return { lat: r((cell.row + 0.5) * latStep(km)), lon: r((cell.col + 0.5) * lonStep(km, cell.row)) };
}

export function validPosition(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

/**
 * Protected species (BArtSchV, FFH) by genus – Richtwert list for the map
 * only, to be checked (docs/fundorte.md "Offen"). Listing too many only makes
 * the map coarser, never more exact.
 */
const PROTECTED_GENERA = new Set([
  // Orchids – every native species is protected.
  'anacamptis', 'cephalanthera', 'coeloglossum', 'corallorhiza', 'cypripedium', 'dactylorhiza', 'epipactis', 'epipogium',
  'goodyera', 'gymnadenia', 'hammarbya', 'herminium', 'himantoglossum', 'limodorum', 'liparis', 'listera', 'malaxis',
  'neotinea', 'neottia', 'nigritella', 'ophrys', 'orchis', 'platanthera', 'pseudorchis', 'serapias', 'spiranthes', 'traunsteinera',
  // Further plants.
  'adonis', 'aquilegia', 'arnica', 'cyclamen', 'daphne', 'dianthus', 'dictamnus', 'diphasiastrum', 'drosera', 'gentiana',
  'gentianella', 'huperzia', 'jovibarba', 'leontopodium', 'leucojum', 'lilium', 'lycopodiella', 'lycopodium', 'nuphar',
  'nymphaea', 'pinguicula', 'primula', 'pulsatilla', 'saxifraga', 'sempervivum', 'stipa', 'trapa', 'trollius', 'galanthus',
  // Mushrooms (BArtSchV Anlage 1) – collecting spots are what people look for.
  'cantharellus', 'morchella', 'leccinum', 'tuber', 'hericium', 'sarcodon',
  // Insects.
  'bombus', 'xylocopa', 'carabus', 'calosoma', 'lucanus', 'dorcus', 'rosalia', 'cerambyx', 'cetonia', 'protaetia',
  'osmoderma', 'papilio', 'iphiclides', 'parnassius', 'saturnia', 'mantis', 'zygaena',
  // Dragonflies – every native species is protected.
  'aeshna', 'anax', 'brachytron', 'calopteryx', 'coenagrion', 'cordulegaster', 'cordulia', 'enallagma', 'erythromma',
  'gomphus', 'ischnura', 'lestes', 'leucorrhinia', 'libellula', 'onychogomphus', 'orthetrum', 'platycnemis', 'pyrrhosoma',
  'somatochlora', 'sympecma', 'sympetrum',
]);

const PROTECTED_SPECIES = new Set([
  'boletus edulis', 'boletus pinophilus', 'boletus reticulatus', 'boletus aereus', 'amanita caesarea', 'lactarius volemus',
  'hepatica nobilis', 'ilex aquifolium', 'menyanthes trifoliata', 'helleborus niger', 'anemone sylvestris', 'iris sibirica',
]);

/** Whether the map shows this species only coarsely. Works on "Genus species Autor". */
export function isProtectedSpecies(scientificName: string): boolean {
  const words = scientificName.toLocaleLowerCase('en').replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const genus = words[0] ?? '';
  return PROTECTED_GENERA.has(genus) || PROTECTED_SPECIES.has(words.slice(0, 2).join(' '));
}

/** "YYYY-MM" in Berlin. */
export function berlinMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

function speciesColumns(kind: FindSpotKind, speciesId: number) {
  return kind === 'plant'
    ? { plantId: speciesId, insectId: null, speciesKey: `p:${speciesId}` }
    : { plantId: null, insectId: speciesId, speciesKey: `i:${speciesId}` };
}

/** Did the account scan this species? Only own scans may go on the map. */
async function scanned(userId: string, kind: FindSpotKind, speciesId: number): Promise<boolean> {
  const rows =
    kind === 'plant'
      ? await db.select({ id: plantScansTable.id }).from(plantScansTable).where(and(eq(plantScansTable.userId, userId), eq(plantScansTable.plantId, speciesId))).limit(1)
      : await db.select({ id: insectScansTable.id }).from(insectScansTable).where(and(eq(insectScansTable.userId, userId), eq(insectScansTable.insectId, speciesId))).limit(1);
  return rows.length > 0;
}

/**
 * Puts the caller's find on the map. `consent` is user_settings.share_find_spots;
 * without a yes nothing is stored. Returns whether it was saved.
 */
export async function recordFindSpot(
  userId: string,
  consent: boolean | null,
  input: { kind: FindSpotKind; speciesId: number; lat: number; lon: number },
  now = new Date(),
): Promise<boolean> {
  if (consent !== true) return false;
  if (!validPosition(input.lat, input.lon)) return false;
  if (!(await scanned(userId, input.kind, input.speciesId))) return false;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [{ today }] = await db
    .select({ today: count() })
    .from(findSpotsTable)
    .where(and(eq(findSpotsTable.userId, userId), gte(findSpotsTable.createdAt, since)));
  if ((today ?? 0) >= MAX_FINDS_PER_DAY) return false;
  const cell = cellOf(input.lat, input.lon);
  const foundMonth = berlinMonth(now);
  await db
    .insert(findSpotsTable)
    .values({ userId, ...speciesColumns(input.kind, input.speciesId), cellRow: cell.row, cellCol: cell.col, foundMonth })
    .onConflictDoUpdate({
      target: [findSpotsTable.userId, findSpotsTable.speciesKey, findSpotsTable.cellRow, findSpotsTable.cellCol],
      set: { foundMonth },
    });
  return true;
}

/** Saying no to the map takes the person's finds off it. */
export async function removeFindSpotsOf(userId: string): Promise<void> {
  await db.delete(findSpotsTable).where(eq(findSpotsTable.userId, userId));
}

export interface FindSpotCell {
  lat: number;
  lon: number;
  finds: number;
  lastMonth: string;
}

/** Fine cells → cells of the map: the same for normal species, merged to 25 km for protected ones. */
export function mapCells(rows: ReadonlyArray<{ cellRow: number; cellCol: number; foundMonth: string }>, protectedSpecies: boolean): FindSpotCell[] {
  const km = protectedSpecies ? PROTECTED_CELL_KM : CELL_KM;
  const cells = new Map<string, FindSpotCell>();
  for (const r of rows) {
    const fine = cellCentre({ row: r.cellRow, col: r.cellCol });
    const cell = protectedSpecies ? cellOf(fine.lat, fine.lon, km) : { row: r.cellRow, col: r.cellCol };
    const key = `${cell.row}:${cell.col}`;
    const hit = cells.get(key);
    if (hit) {
      hit.finds += 1;
      if (r.foundMonth > hit.lastMonth) hit.lastMonth = r.foundMonth;
    } else {
      cells.set(key, { ...cellCentre(cell, km), finds: 1, lastMonth: r.foundMonth });
    }
  }
  return [...cells.values()].sort((a, b) => b.finds - a.finds);
}

/** The map of one species; null if it is not in the archive. */
export async function findSpotMap(kind: FindSpotKind, speciesId: number) {
  const [species] =
    kind === 'plant'
      ? await db.select({ name: plantsTable.botanicalName }).from(plantsTable).where(eq(plantsTable.id, speciesId))
      : await db.select({ name: insectsTable.scientificName }).from(insectsTable).where(eq(insectsTable.id, speciesId));
  if (!species) return null;
  const protectedSpecies = isProtectedSpecies(species.name);
  const rows = await db
    .select({ cellRow: findSpotsTable.cellRow, cellCol: findSpotsTable.cellCol, foundMonth: findSpotsTable.foundMonth })
    .from(findSpotsTable)
    .where(eq(findSpotsTable.speciesKey, speciesColumns(kind, speciesId).speciesKey))
    .orderBy(sql`${findSpotsTable.id} DESC`)
    .limit(5000);
  return {
    cells: mapCells(rows, protectedSpecies),
    cellKm: protectedSpecies ? PROTECTED_CELL_KM : CELL_KM,
    protectedSpecies,
    finds: rows.length,
  };
}
