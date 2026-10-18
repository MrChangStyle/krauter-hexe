/**
 * When does a new scan's photo replace the shared photo of a species?
 *
 * Every scan rates its photo 1-10 (sharpness, light, subject fills the frame,
 * typical features visible). The shared photo is replaced only by a clearly
 * better one, so two similar photos do not swap back and forth, and never
 * when the admin has locked it.
 */

/** Assumed rating of a shared photo from before ratings existed. */
export const UNRATED_QUALITY = 6;
/** How much better a photo must be rated to replace the shared one. */
export const MIN_IMPROVEMENT = 2;

export function coerceQuality(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 10 ? rounded : null;
}

export function shouldReplaceSharedImage(args: {
  locked: boolean;
  current: number | null | undefined;
  candidate: number | null | undefined;
}): boolean {
  if (args.locked) return false;
  if (args.candidate == null) return false;
  return args.candidate >= (args.current ?? UNRATED_QUALITY) + MIN_IMPROVEMENT;
}
