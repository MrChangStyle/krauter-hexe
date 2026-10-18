import type { BedPlanting, Crop, GardenBed } from "@workspace/api-client-react";

/** Edge of one planner cell – same as the server (BED_CELL_CM). */
export const CELL_CM = 30;

export function gridSize(bed: Pick<GardenBed, "lengthCm" | "widthCm">): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor(bed.lengthCm / CELL_CM)),
    rows: Math.max(1, Math.floor(bed.widthCm / CELL_CM)),
  };
}

/** Cells per side – the server places with the same rule. */
export function footprint(crop: Pick<Crop, "spacingCm"> | undefined): number {
  if (!crop) return 1;
  return Math.min(5, Math.max(1, Math.ceil(crop.spacingCm / CELL_CM)));
}

/** Plants in one 30-cm cell (small crops), else one plant per footprint. */
export function plantsPerCell(crop: Pick<Crop, "spacingCm" | "rowSpacingCm">): number {
  if (footprint(crop) > 1) return 1;
  return Math.max(1, Math.floor(CELL_CM / crop.spacingCm)) * Math.max(1, Math.floor(CELL_CM / crop.rowSpacingCm));
}

type Rect = Pick<BedPlanting, "x" | "y" | "w" | "h">;

export function fits(rect: Rect, cols: number, rows: number, taken: Rect[]): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > cols || rect.y + rect.h > rows) return false;
  return !taken.some((t) => rect.x < t.x + t.w && t.x < rect.x + rect.w && rect.y < t.y + t.h && t.y < rect.y + rect.h);
}

/** Next to each other – sharing an edge or a corner. */
export function touching(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export interface NeighbourPair {
  a: BedPlanting;
  b: BedPlanting;
}

/** Good and bad neighbours among plantings that touch (from the catalog). */
export function neighbourHints(plantings: BedPlanting[], crops: Map<string, Crop>): { good: NeighbourPair[]; bad: NeighbourPair[] } {
  const good: NeighbourPair[] = [];
  const bad: NeighbourPair[] = [];
  for (let i = 0; i < plantings.length; i += 1) {
    for (let j = i + 1; j < plantings.length; j += 1) {
      const a = plantings[i]!;
      const b = plantings[j]!;
      if (!a.cropKey || !b.cropKey || a.cropKey === b.cropKey || !touching(a, b)) continue;
      const ca = crops.get(a.cropKey);
      const cb = crops.get(b.cropKey);
      if (!ca || !cb) continue;
      if (ca.bad.includes(cb.key) || cb.bad.includes(ca.key)) bad.push({ a, b });
      else if (ca.good.includes(cb.key) || cb.good.includes(ca.key)) good.push({ a, b });
    }
  }
  return { good, bad };
}

export type BedLight = "full" | "partial" | "shade";

/** Light of the bed from its sun hours (null when unknown). */
export function bedLight(sunHours: number | null): BedLight | null {
  if (sunHours === null) return null;
  if (sunHours >= 6) return "full";
  if (sunHours >= 4) return "partial";
  return "shade";
}

const LIGHT_RANK: Record<BedLight, number> = { shade: 0, partial: 1, full: 2 };

/** True when the crop wants more sun than the bed gets. */
export function tooShady(crop: Pick<Crop, "light">, light: BedLight | null): boolean {
  return light !== null && LIGHT_RANK[crop.light] > LIGHT_RANK[light];
}

/** Henni's line about the plan: problems first, then praise, else a hint. */
export function hennyLine(
  hints: { good: NeighbourPair[]; bad: NeighbourPair[] },
  shady: string[],
  empty: boolean,
  rotation: string | null = null,
): string {
  if (hints.bad.length > 0) {
    const { a, b } = hints.bad[0]!;
    return `Achtung: ${a.label} und ${b.label} vertragen sich nicht – setz sie weiter auseinander.`;
  }
  if (rotation) return `Fruchtfolge: ${rotation}`;
  if (shady.length > 0) return `${shady[0]} braucht mehr Sonne, als dieses Beet bekommt.`;
  if (hints.good.length > 0) {
    const { a, b } = hints.good[0]!;
    return `Gute Nachbarn: ${a.label} neben ${b.label}!`;
  }
  return empty ? "Tippe auf ein freies Feld und wähle, was dort wachsen soll." : "Keine Nachbarn, die sich stören – passt so.";
}

/** "Solanum lycopersicum L." → "solanum lycopersicum" – same matching as the server. */
export function speciesKey(botanicalName: string): string | null {
  const words = botanicalName.toLowerCase().replace(/[^a-zäöüß\s-]/g, " ").split(/\s+/).filter(Boolean);
  return words.length >= 2 ? `${words[0]} ${words[1]}` : null;
}
