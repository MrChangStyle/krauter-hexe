/**
 * Cost brake for the scan endpoints.
 *
 * A scan costs real money: every attempt sends the photo to the AI *before*
 * anything is written to the database. When a scan fails for a reason that
 * cannot heal by itself (a broken sequence, a missing column, a bad
 * deployment), the client's queue retries the photo - and each retry burns
 * another AI call. Bounding that on the client alone is not enough: installed
 * PWAs can run an old cached bundle for days, so the guarantee has to live on
 * the server.
 *
 * Two independent brakes, both applied BEFORE the AI call so a blocked attempt
 * costs nothing:
 *
 * 1. Per-photo: after MAX_PHOTO_FAILURES consecutive server-side failures for
 *    the same captured photo, that photo is refused for PHOTO_BLOCK_MS. This
 *    stops one broken photo from looping forever.
 * 2. Per-scope global: after MAX_GLOBAL_FAILURES server-side failures inside
 *    GLOBAL_WINDOW_MS, all scanning *of that kind* is refused for
 *    GLOBAL_BLOCK_MS. This is the "the database is down" case, where every
 *    photo would fail and the whole queue would be converted into AI spend.
 *
 * The global brake is deliberately per-scope: plant and insect scans write to
 * different tables and fail independently, so a working insect scan is no
 * evidence that plant scans have recovered and must not lift their pause.
 *
 * In-memory and global to the process, like the password brute-force brake in
 * routes/plants.ts: the app runs as a single instance, and a restart merely
 * resets the counters (which is safe - it only ever grants extra attempts).
 */

import { createHash } from "node:crypto";

/** Which scan endpoint a brake applies to. They fail independently. */
export type ScanScope = "plant" | "insect";

/**
 * Stable per-photo key for clients that send no localImageId (an old cached
 * bundle). Without it such a request would only be covered by the global brake,
 * which is exactly the audience that has no client-side back-off. Hashing a few
 * hundred KB costs about a millisecond - nothing against one AI call.
 */
export function photoFingerprint(imageDataUrl: string): string {
  return createHash("sha256").update(imageDataUrl).digest("hex").slice(0, 32);
}

/** Consecutive failures for one photo before it is refused for a while. */
export const MAX_PHOTO_FAILURES = 3;
/** How long a repeatedly-failing photo is refused before one more try. */
export const PHOTO_BLOCK_MS = 30 * 60 * 1_000;

/** Server-side failures within one scope that trip its global brake. */
export const MAX_GLOBAL_FAILURES = 8;
/** Sliding window the global failures are counted in. */
export const GLOBAL_WINDOW_MS = 2 * 60 * 1_000;
/** How long scanning in that scope is refused once the global brake trips. */
export const GLOBAL_BLOCK_MS = 2 * 60 * 1_000;

/**
 * Aborted attempts for one photo before it is paused. An abort means the client
 * hung up (tab reload after the camera, dropped mobile connection) - the AI call
 * still ran and still cost money, so these have to be bounded too. The
 * allowance is deliberately more generous than for real failures, and the pause
 * much shorter, because a dropped connection is normal outdoors and must not
 * cost the user their photo.
 */
export const MAX_PHOTO_ABORTS = 6;
/** How long a repeatedly-aborted photo is paused. */
export const ABORT_BLOCK_MS = 5 * 60 * 1_000;

/** Cap on tracked photos so a long uptime cannot grow this map unboundedly. */
const MAX_TRACKED_PHOTOS = 1_000;

interface PhotoEntry {
  failures: number;
  lastFailureAt: number;
  aborts: number;
  lastAbortAt: number;
}

const emptyPhotoEntry: PhotoEntry = {
  failures: 0,
  lastFailureAt: 0,
  aborts: 0,
  lastAbortAt: 0,
};

/** Newest activity for a photo, used for pruning. */
function lastSeenAt(entry: PhotoEntry): number {
  return Math.max(entry.lastFailureAt, entry.lastAbortAt);
}

interface ScopeState {
  failureTimes: number[];
  blockedUntil: number;
}

const photoFailures = new Map<string, PhotoEntry>();
const scopes = new Map<ScanScope, ScopeState>();

function scopeState(scope: ScanScope): ScopeState {
  let state = scopes.get(scope);
  if (!state) {
    state = { failureTimes: [], blockedUntil: 0 };
    scopes.set(scope, state);
  }
  return state;
}

/**
 * Drop entries that can no longer block anything. Called on every write so the
 * map stays small without a timer.
 */
function pruneStaleEntries(now: number): void {
  for (const [key, entry] of photoFailures) {
    if (now - lastSeenAt(entry) >= PHOTO_BLOCK_MS) photoFailures.delete(key);
  }
  // Hard cap as a last resort: evict the entries closest to expiring.
  if (photoFailures.size > MAX_TRACKED_PHOTOS) {
    const byAge = [...photoFailures.entries()].sort(
      (a, b) => lastSeenAt(a[1]) - lastSeenAt(b[1]),
    );
    for (const [key] of byAge.slice(0, photoFailures.size - MAX_TRACKED_PHOTOS)) {
      photoFailures.delete(key);
    }
  }
}

export type ScanBlock =
  | { blocked: false }
  | { blocked: true; reason: "photo" | "aborts" | "global"; retryAfterMs: number };

/**
 * Whether this scan attempt should be refused before spending an AI call.
 * `photoKey` identifies the captured photo (the client's localImageId, or a
 * content hash when the client is too old to send one).
 */
export function checkScanBrake(
  scope: ScanScope,
  photoKey: string | null,
  now: number = Date.now(),
): ScanBlock {
  const state = scopeState(scope);
  if (state.blockedUntil > now) {
    return { blocked: true, reason: "global", retryAfterMs: state.blockedUntil - now };
  }
  if (photoKey) {
    const entry = photoFailures.get(photoKey);
    if (entry && entry.failures >= MAX_PHOTO_FAILURES) {
      const elapsed = now - entry.lastFailureAt;
      if (elapsed < PHOTO_BLOCK_MS) {
        return { blocked: true, reason: "photo", retryAfterMs: PHOTO_BLOCK_MS - elapsed };
      }
      // The block has been served. Forget the photo so the next attempt gets a
      // full fresh set of tries rather than being refused forever.
      photoFailures.delete(photoKey);
    } else if (entry && entry.aborts >= MAX_PHOTO_ABORTS) {
      const elapsed = now - entry.lastAbortAt;
      if (elapsed < ABORT_BLOCK_MS) {
        return { blocked: true, reason: "aborts", retryAfterMs: ABORT_BLOCK_MS - elapsed };
      }
      photoFailures.set(photoKey, { ...entry, aborts: 0, lastAbortAt: 0 });
    }
  }
  return { blocked: false };
}

/**
 * Record a server-side failure (5xx) for this scan. 4xx responses are the
 * client's problem (bad image, quota, auth) and deliberately do not count.
 */
export function recordScanFailure(
  scope: ScanScope,
  photoKey: string | null,
  now: number = Date.now(),
): void {
  if (photoKey) {
    const entry = photoFailures.get(photoKey) ?? emptyPhotoEntry;
    photoFailures.set(photoKey, {
      ...entry,
      failures: entry.failures + 1,
      lastFailureAt: now,
    });
  }

  const state = scopeState(scope);
  state.failureTimes = state.failureTimes.filter((t) => now - t < GLOBAL_WINDOW_MS);
  state.failureTimes.push(now);
  if (state.failureTimes.length >= MAX_GLOBAL_FAILURES) {
    state.blockedUntil = now + GLOBAL_BLOCK_MS;
    // Start a fresh window, otherwise the brake would immediately re-trip on
    // the first failure after the block expires.
    state.failureTimes = [];
  }

  pruneStaleEntries(now);
}

/**
 * Record an attempt the client hung up on before the response was sent. The AI
 * call still cost money, so it counts - but only against this one photo, never
 * against the global brake: phones abort scan requests routinely (a tab reload
 * right after the camera closes, a dropped connection in the garden), and
 * letting that pause scanning for everyone would be worse than the spend.
 */
export function recordScanAbort(photoKey: string | null, now: number = Date.now()): void {
  if (!photoKey) return;
  const entry = photoFailures.get(photoKey) ?? emptyPhotoEntry;
  photoFailures.set(photoKey, {
    ...entry,
    aborts: entry.aborts + 1,
    lastAbortAt: now,
  });
  pruneStaleEntries(now);
}

/**
 * A successful scan clears this photo's history and this scope's global brake.
 * Scoped on purpose: a working insect scan says nothing about whether plant
 * scans have recovered, so it must not cancel their pause.
 */
export function recordScanSuccess(scope: ScanScope, photoKey: string | null): void {
  if (photoKey) photoFailures.delete(photoKey);
  const state = scopeState(scope);
  state.failureTimes = [];
  state.blockedUntil = 0;
}

/** Test-only: drop all state so cases cannot leak into each other. */
export function resetScanBrake(): void {
  photoFailures.clear();
  scopes.clear();
}
