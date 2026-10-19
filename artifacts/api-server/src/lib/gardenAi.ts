/**
 * KI of the Beet-Architekt (step 5): corner suggestion and analysis of the
 * bed photo, and a planting suggestion for a bed.
 *
 * The AI only advises – its answers are coerced into fixed shapes, and every
 * suggested planting goes through the same fixed rules as a tap in the grid
 * (room, overlap, bad neighbours, crop rotation, light). What breaks a rule is
 * dropped and named.
 */

import { bedPlantingsTable, db, gardenBedsTable, type BedPhotoAnalysis, type GardenBed } from '@workspace/db';
import { and, eq } from 'drizzle-orm';

import { FarmDataError } from './farmAnimals';
import { getBed, validCorners } from './gardenBeds';
import { cropByKey, fullCatalog, type Crop, type Light } from './gardenCatalog';
import { loadApprovedCrops } from './gardenCrops';
import { footprint, gridSize, overlaps, validSeason } from './gardenPlanner';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

async function ai() {
  return import('./plantIdentification');
}

/** The stored bed photo as inline image data for the model. */
async function photoOf(bed: GardenBed): Promise<{ mimeType: string; data: string }> {
  if (!bed.photoUrl) throw new FarmDataError(400, 'Für dieses Beet gibt es noch kein Foto.');
  const { parseDataUrl } = await ai();
  if (bed.photoUrl.startsWith('data:')) return parseDataUrl(bed.photoUrl);
  const res = await fetch(bed.photoUrl, { signal: AbortSignal.timeout(15_000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`Bed photo ${res.status} ${type}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Bed photo too large');
  return { mimeType: type.split(';')[0]!, data: bytes.toString('base64') };
}

const JSON_CONFIG = (maxOutputTokens: number) => ({ maxOutputTokens, responseMimeType: 'application/json' });

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().replace(/\s+/g, ' ');
  return t ? t.slice(0, max) : null;
}

// ── Corner suggestion ────────────────────────────────────────────────────────

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Four points in any order → grid order: start at the top-left one, go round,
 * and take the direction whose first edge matches the bed's length (the
 * longer pair of image edges for a bed longer than wide). Null when they do
 * not make a proper quadrilateral.
 */
export function orderCorners(points: Point[], bed: { lengthCm: number; widthCm: number }): Point[] | null {
  if (points.length !== 4) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const round = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const start = round.indexOf(round.reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best)));
  const cw = [0, 1, 2, 3].map((i) => round[(start + i) % 4]!);
  const firstPair = dist(cw[0]!, cw[1]!) + dist(cw[2]!, cw[3]!);
  const secondPair = dist(cw[1]!, cw[2]!) + dist(cw[3]!, cw[0]!);
  const wantLonger = bed.lengthCm >= bed.widthCm;
  const ordered = firstPair >= secondPair === wantLonger ? cw : [cw[0]!, cw[3]!, cw[2]!, cw[1]!];
  const rounded = ordered.map((p) => ({ x: Math.round(p.x * 10_000) / 10_000, y: Math.round(p.y * 10_000) / 10_000 }));
  return validCorners(rounded) ? rounded : null;
}

export function coerceCorners(parsed: Record<string, unknown>, bed: { lengthCm: number; widthCm: number }): Point[] | null {
  if (parsed['beetSichtbar'] === false || !Array.isArray(parsed['ecken'])) return null;
  const points = (parsed['ecken'] as unknown[]).flatMap((p) => {
    const x = Number((p as Record<string, unknown> | null)?.['x']);
    const y = Number((p as Record<string, unknown> | null)?.['y']);
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [{ x, y }] : [];
  });
  return orderCorners(points, bed);
}

/** Where the bed's corners probably are on its photo – the user confirms. */
export async function suggestCorners(farmId: number, bedId: number): Promise<Point[] | null> {
  const bed = await getBed(farmId, bedId);
  const image = await photoOf(bed);
  const { MODELS, runModelChain } = await ai();
  const prompt = `Auf dem Foto ist ein Gartenbeet (${bed.type === 'raised' ? 'Hochbeet' : 'Beet'}, ${bed.lengthCm} × ${bed.widthCm} cm), schräg von oben fotografiert.
Finde die vier Ecken der Beetfläche (Innenkante der Einfassung, wo die Erde beginnt).
Antworte nur mit einem JSON-Objekt:
{
  "beetSichtbar": boolean (sind alle vier Ecken zu sehen?),
  "ecken": [ {"x": Zahl, "y": Zahl}, … vier Punkte ]
}
x und y sind Anteile von Bildbreite und -höhe (0 bis 1, x von links, y von oben).`;
  const parsed = (await runModelChain([{ role: 'user', parts: [{ text: prompt }, { inlineData: image }] }], MODELS, JSON_CONFIG(512))) as Record<
    string,
    unknown
  > | null;
  return coerceCorners(parsed ?? {}, bed);
}

// ── Photo analysis ───────────────────────────────────────────────────────────

export function coerceAnalysis(parsed: Record<string, unknown>): Omit<BedPhotoAnalysis, 'createdAt'> | null {
  const shade = text(parsed['schatten'], 600);
  const soil = text(parsed['boden'], 600);
  const weeds = text(parsed['unkraut'], 600);
  if (!shade || !soil || !weeds) return null;
  const tips = Array.isArray(parsed['tipps'])
    ? parsed['tipps'].map((t) => text(t, 200)).filter((t): t is string => !!t).slice(0, 5)
    : [];
  return { shade, soil, weeds, tips };
}

/** KI-Einschätzung of the bed photo; stored on the bed until the next photo. */
export async function analyzeBedPhoto(farmId: number, bedId: number) {
  const bed = await getBed(farmId, bedId);
  const image = await photoOf(bed);
  const { MODELS, runModelChain } = await ai();
  const prompt = `Du bist erfahrener Gärtner. Schau dir das Foto eines Gartenbeets an (${bed.lengthCm} × ${bed.widthCm} cm${bed.sunHours !== null ? `, laut Besitzer etwa ${bed.sunHours} Sonnenstunden am Tag` : ''}).
Beurteile nur, was auf dem Foto zu sehen ist, auf Deutsch, je 1–3 Sätze, ohne Markdown. Antworte nur mit einem JSON-Objekt:
{
  "schatten": "Schatten: Wo fällt Schatten aufs Beet (Bäume, Mauern, Hecken)? Was heißt das für die Bepflanzung?",
  "boden": "Boden: Wie sieht die Erde aus (Farbe, Krümel, Verkrustung, Feuchte, Mulch)? Was würde ihr guttun?",
  "unkraut": "Unkraut: Wie stark ist das Beet verunkrautet, was ist zu erkennen, was ist zu tun?",
  "tipps": ["bis zu 3 kurze, konkrete Tipps für die nächsten Wochen"]
}
Wenn auf dem Foto kein Beet zu erkennen ist, sag das in allen drei Feldern.`;
  const parsed = (await runModelChain([{ role: 'user', parts: [{ text: prompt }, { inlineData: image }] }], MODELS, JSON_CONFIG(1024))) as Record<
    string,
    unknown
  > | null;
  const content = coerceAnalysis(parsed ?? {});
  if (!content) throw new Error('Incomplete photo analysis from AI');
  const analysis: BedPhotoAnalysis = { ...content, createdAt: new Date().toISOString() };
  const [updated] = await db
    .update(gardenBedsTable)
    .set({ photoAnalysis: analysis })
    .where(and(eq(gardenBedsTable.id, bedId), eq(gardenBedsTable.farmId, farmId), eq(gardenBedsTable.photoUrl, bed.photoUrl!)))
    .returning();
  if (!updated) throw new FarmDataError(409, 'Das Foto wurde inzwischen geändert. Bitte noch einmal analysieren.');
  return updated;
}

// ── Planting suggestion ──────────────────────────────────────────────────────

export interface ProposalItem {
  cropKey: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Proposal {
  items: ProposalItem[];
  dropped: { label: string; reason: string }[];
  notes: string;
}

type Planted = Rect & { cropKey: string | null; label: string };
type Earlier = Planted & { season: number };

const LIGHT_RANK: Record<Light, number> = { shade: 0, partial: 1, full: 2 };

export function bedLight(sunHours: number | null): Light | null {
  if (sunHours === null) return null;
  return sunHours >= 6 ? 'full' : sunHours >= 4 ? 'partial' : 'shade';
}

/** Edge or corner contact (same rule as the app's neighbour hints). */
function touching(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/**
 * Puts the AI's wishes through the fixed rules, in its order: a crop it does
 * not know, no room, a bad neighbour, the same family on these cells in the
 * last three seasons (or heavy after heavy), or too little sun → dropped.
 */
export function checkProposal(
  bed: { lengthCm: number; widthCm: number; sunHours: number | null },
  season: number,
  planted: Planted[],
  earlier: Earlier[],
  wishes: { cropKey: unknown; x: unknown; y: unknown }[],
): Pick<Proposal, 'items' | 'dropped'> {
  const { cols, rows } = gridSize(bed);
  const light = bedLight(bed.sunHours);
  const items: ProposalItem[] = [];
  const dropped: Proposal['dropped'] = [];
  const taken: Planted[] = [...planted];
  for (const wish of wishes.slice(0, 40)) {
    const crop = typeof wish.cropKey === 'string' ? cropByKey(wish.cropKey) : undefined;
    if (!crop) continue;
    const side = footprint(crop);
    const rect = { x: Number(wish.x), y: Number(wish.y), w: side, h: side };
    const drop = (reason: string) => dropped.push({ label: crop.name, reason });
    if (!Number.isInteger(rect.x) || !Number.isInteger(rect.y) || rect.x < 0 || rect.y < 0 || rect.x + side > cols || rect.y + side > rows) {
      drop('passt nicht ins Beet');
      continue;
    }
    if (taken.some((t) => overlaps(t, rect))) {
      drop('Platz schon belegt');
      continue;
    }
    const badNeighbour = taken.find((t) => {
      const other = t.cropKey ? cropByKey(t.cropKey) : undefined;
      return other && other.key !== crop.key && touching(t, rect) && (crop.bad.includes(other.key) || other.bad.includes(crop.key));
    });
    if (badNeighbour) {
      drop(`verträgt sich nicht mit ${badNeighbour.label}`);
      continue;
    }
    const rotation = earlier.find((e) => {
      const before = e.cropKey ? cropByKey(e.cropKey) : undefined;
      if (!before || e.season >= season || e.season < season - 3 || !overlaps(e, rect)) return false;
      return before.family === crop.family || (e.season === season - 1 && before.feeder === 'heavy' && crop.feeder === 'heavy');
    });
    if (rotation) {
      drop(`Fruchtfolge – ${rotation.season} stand dort ${rotation.label}`);
      continue;
    }
    if (light && LIGHT_RANK[crop.light] > LIGHT_RANK[light]) {
      drop('braucht mehr Sonne');
      continue;
    }
    const item = { cropKey: crop.key, label: crop.name, ...rect };
    items.push(item);
    taken.push(item);
  }
  return { items, dropped };
}

function cropLine(c: Crop): string {
  const side = footprint(c);
  return `${c.key}: ${c.name}, ${side}×${side} Felder, ${c.family}, ${c.feeder}, Licht ${c.light}${c.good.length ? `, gut neben ${c.good.join('/')}` : ''}${c.bad.length ? `, schlecht neben ${c.bad.join('/')}` : ''}`;
}

/** A planting plan for the free cells of a bed – checked, not saved. */
export async function suggestPlanting(farmId: number, bedId: number, season: number, wishes: string | null | undefined): Promise<Proposal> {
  validSeason(season);
  await loadApprovedCrops();
  const bed = await getBed(farmId, bedId);
  const all = await db
    .select({
      season: bedPlantingsTable.season,
      cropKey: bedPlantingsTable.cropKey,
      label: bedPlantingsTable.label,
      x: bedPlantingsTable.x,
      y: bedPlantingsTable.y,
      w: bedPlantingsTable.w,
      h: bedPlantingsTable.h,
    })
    .from(bedPlantingsTable)
    .where(and(eq(bedPlantingsTable.farmId, farmId), eq(bedPlantingsTable.bedId, bedId)));
  const planted = all.filter((p) => p.season === season);
  const earlier = all.filter((p) => p.season < season && p.season >= season - 3);
  const { cols, rows } = gridSize(bed);
  if (planted.reduce((n, p) => n + p.w * p.h, 0) >= cols * rows) throw new FarmDataError(400, 'Das Beet ist schon voll.');

  const light = bedLight(bed.sunHours);
  const catalog = fullCatalog().filter((c) => !light || LIGHT_RANK[c.light] <= LIGHT_RANK[light]);
  const rect = (p: Rect) => `x ${p.x}–${p.x + p.w - 1}, y ${p.y}–${p.y + p.h - 1}`;
  const wish = text(wishes, 300);
  const prompt = `Du planst ein Gemüsebeet nach Mischkultur und Fruchtfolge (Saison ${season}).
Beet: ${bed.lengthCm} × ${bed.widthCm} cm = Raster ${cols} Spalten (x 0–${cols - 1}) × ${rows} Zeilen (y 0–${rows - 1}), ein Feld 30 × 30 cm${light ? `, Licht: ${light}` : ''}${bed.soilTexture ? `, Boden: ${bed.soilTexture}` : ''}.
Schon gepflanzt (nicht verändern): ${planted.length ? planted.map((p) => `${p.label} (${rect(p)})`).join('; ') : 'nichts'}.
Früher an dieser Stelle: ${earlier.length ? earlier.map((p) => `${p.season} ${p.label} (${rect(p)})`).join('; ') : 'unbekannt'}.
${wish ? `Wünsche des Gärtners: ${wish}\n` : ''}Mögliche Pflanzen (Schlüssel: Name, Platzbedarf, Familie, Nährstoffbedarf, Licht, Nachbarn):
${catalog.map(cropLine).join('\n')}
Regeln: keine Überschneidung, alles im Raster, schlechte Nachbarn nicht nebeneinander (auch nicht diagonal), gleiche Familie nicht dorthin, wo sie in den letzten 3 Jahren stand, Starkzehrer nicht nach Starkzehrern. Fülle die freien Felder sinnvoll, gute Nachbarn zusammen.
Antworte nur mit einem JSON-Objekt:
{
  "pflanzen": [ {"cropKey": "Schlüssel", "x": Spalte der linken oberen Ecke, "y": Zeile der linken oberen Ecke}, … ],
  "hinweis": "2–3 Sätze auf Deutsch: Idee des Plans"
}`;
  const { TEXT_MODELS, runModelChain } = await ai();
  const parsed = (await runModelChain([{ role: 'user', parts: [{ text: prompt }] }], TEXT_MODELS, JSON_CONFIG(2048))) as Record<
    string,
    unknown
  > | null;
  const wishesList = Array.isArray(parsed?.['pflanzen']) ? (parsed!['pflanzen'] as { cropKey: unknown; x: unknown; y: unknown }[]) : [];
  const checked = checkProposal(bed, season, planted, earlier, wishesList.filter((w) => w && typeof w === 'object'));
  if (checked.items.length === 0 && checked.dropped.length === 0) throw new Error('Empty planting suggestion from AI');
  return { ...checked, notes: text(parsed?.['hinweis'], 600) ?? '' };
}

