import type { BedPlanting } from "@workspace/api-client-react";

/**
 * Verschieben im Beet-Raster (docs/beet-architekt.md): where a planting may go
 * – inside the bed, not onto another planting; its own old spot is free for it.
 * The server checks the same again.
 */
export function fitsAt(
  planting: Pick<BedPlanting, "id" | "w" | "h">,
  x: number,
  y: number,
  plantings: readonly Pick<BedPlanting, "id" | "x" | "y" | "w" | "h">[],
  cols: number,
  rows: number,
): boolean {
  if (x < 0 || y < 0 || x + planting.w > cols || y + planting.h > rows) return false;
  return !plantings.some(
    (o) => o.id !== planting.id && x < o.x + o.w && o.x < x + planting.w && y < o.y + o.h && o.y < y + planting.h,
  );
}

/** Which cell of a planting (w × h fields) the finger holds, from where it touched the drawn box. */
export function grabbedCell(
  planting: Pick<BedPlanting, "w" | "h">,
  box: { left: number; top: number; width: number; height: number },
  point: { x: number; y: number },
): { dx: number; dy: number } {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  return {
    dx: clamp(Math.floor(((point.x - box.left) / box.width) * planting.w), planting.w),
    dy: clamp(Math.floor(((point.y - box.top) / box.height) * planting.h), planting.h),
  };
}
