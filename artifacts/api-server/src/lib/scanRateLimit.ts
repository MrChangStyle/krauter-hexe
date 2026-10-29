/**
 * Per-user daily scan rate limit (Berlin timezone).
 *
 * Uses a dedicated `scan_attempts` table (no unique constraint) that records
 * every AI scan invocation, so re-scanning a known species still increments
 * the counter. The check and the insert are wrapped in a single transaction
 * to prevent concurrent requests from overshooting the cap.
 *
 * Limit: 15 attempts per scan type (plants, insects and the farm AI features
 * tracked separately) per Berlin calendar day; 45 for the universal scan's
 * first look at the photo ("classify").
 */

import { gte, and, eq, lt, ne, sql } from "drizzle-orm";
import { db, scanAttemptsTable } from "@workspace/db";
import { bumpUsage } from "./monitoring";

/**
 * Photos per user, per scan type, per Berlin day.
 *
 * Exported so the 429 response can tell the client the exact number that was
 * enforced. The UI must never hard-code it: a copy in the frontend would keep
 * showing the old number after this one changes.
 */
export const DAILY_SCAN_LIMIT = 15;

/**
 * The universal scan first asks the AI what is on the photo ("classify"),
 * then runs the plant or insect scan, which counts on its own. Photos without
 * a plant or insect stop after the first call – without their own counter
 * they would cost AI without limit. Three times the scan limit leaves room
 * for retakes.
 */
export const DAILY_CLASSIFY_LIMIT = 3 * DAILY_SCAN_LIMIT;

export type ScanType = "plant" | "insect" | "farm" | "garden" | "grow" | "classify";

export function dailyLimitFor(scanType: ScanType): number {
  return scanType === "classify" ? DAILY_CLASSIFY_LIMIT : DAILY_SCAN_LIMIT;
}

/** The German answer for a refused AI request (429). */
export function limitMessage(result: Pick<RateLimitResult, "reason" | "limit">): string {
  return result.reason === "budget"
    ? "Die KI ist für heute ausgelastet. Bitte versuche es morgen wieder."
    : `Du hast heute schon ${result.limit} KI-Anfragen gestellt. Morgen geht es weiter.`;
}

/**
 * Optional cap on AI scans for the whole app per Berlin day (all users, both
 * scan types, owner excluded), from SCAN_DAILY_BUDGET. Every scan is paid from
 * the owner's Gemini key; with open registration the per-user limit alone does
 * not bound the bill, because anyone can create more accounts. Unset or
 * invalid = no app-wide cap (the family setup).
 */
export function scanDailyBudget(): number | null {
  const raw = Number(process.env["SCAN_DAILY_BUDGET"]);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
}

export interface RateLimitResult {
  allowed: boolean;
  /** ISO timestamp of the next Berlin midnight (when the limit resets). */
  resetsAt: string;
  /**
   * The cap that was applied, so a 429 can name the exact number the user hit
   * instead of the client guessing it.
   */
  limit: number;
  /**
   * Why a request was refused: the user's own daily limit, or the app-wide
   * budget. Undefined when allowed.
   */
  reason?: "user" | "budget";
  /**
   * Primary key of the `scan_attempts` row this call recorded, or null when the
   * request was rejected (nothing was written). Pass it to refundScanAttempt so
   * a failed scan gives back exactly its own attempt — identifying the row by
   * "newest attempt today" would, under concurrent scans, refund some other
   * request's attempt instead.
   */
  attemptId: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the UTC Date that corresponds to midnight in the Europe/Berlin
 * timezone for the given Berlin date string ("YYYY-MM-DD").
 *
 * Berlin is UTC+1 in winter (CET) and UTC+2 in summer (CEST). We determine
 * the correct offset by formatting the candidate back into the Berlin timezone
 * and checking it matches the input.
 */
function getBerlinMidnightUTC(berlinDateStr: string): Date {
  const [y, m, d] = berlinDateStr.split("-").map(Number);
  for (const offsetHours of [2, 1]) {
    const candidate = new Date(Date.UTC(y, m - 1, d) - offsetHours * 3600 * 1000);
    const check = new Intl.DateTimeFormat("sv", { timeZone: "Europe/Berlin" }).format(
      candidate,
    );
    if (check === berlinDateStr) return candidate;
  }
  return new Date(Date.UTC(y, m - 1, d) - 3600 * 1000);
}

function getTodayBerlinDate(): string {
  return new Intl.DateTimeFormat("sv", { timeZone: "Europe/Berlin" }).format(new Date());
}

function getNextBerlinMidnightUTC(): Date {
  const today = getTodayBerlinDate();
  const [y, m, d] = today.split("-").map(Number);
  const tomorrowBerlin = new Intl.DateTimeFormat("sv", {
    timeZone: "Europe/Berlin",
  }).format(new Date(Date.UTC(y, m - 1, d + 1)));
  return getBerlinMidnightUTC(tomorrowBerlin);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Atomically check whether `userId` may perform another scan of `scanType`
 * today and, if allowed, record the attempt in the same transaction.
 *
 * Returns `{ allowed: false }` when the daily cap is reached without writing
 * any new row, so callers only need a single DB round-trip.
 *
 * Pass `{ unlimited: true }` for accounts that are exempt from the cap (the
 * owner/admin). The exemption lives here rather than at the call sites so a new
 * rate-limited endpoint cannot accidentally forget to honour it.
 */
export async function checkAndRecordScanAttempt(
  userId: string,
  scanType: ScanType,
  options: { unlimited?: boolean } = {},
): Promise<RateLimitResult> {
  const resetsAt = getNextBerlinMidnightUTC().toISOString();
  const limit = dailyLimitFor(scanType);

  // Exempt accounts (the owner/admin) scan without any cap. We return before
  // touching the table at all: the daily counter exists purely to enforce the
  // limit, so recording rows for an account that can never hit it would only
  // grow the table. attemptId stays null, which makes a later refund a no-op.
  if (options.unlimited) {
    void bumpUsage("ai_actions");
    return { allowed: true, resetsAt, limit, attemptId: null };
  }

  const berlinMidnight = getBerlinMidnightUTC(getTodayBerlinDate());

  const result = await db.transaction(async (tx): Promise<RateLimitResult> => {
    // Acquire a PostgreSQL advisory lock keyed on this user+scanType pair for
    // the duration of the transaction. pg_advisory_xact_lock serializes
    // concurrent requests for the same user so that the count read and the
    // insert below are effectively atomic — no two requests can both read
    // count=14 and both insert. hashtext produces an int4; combining two int4s
    // (one per argument) lets Postgres distinguish keys without overflow.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${scanType}))`,
    );

    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(scanAttemptsTable)
      .where(
        and(
          eq(scanAttemptsTable.userId, userId),
          eq(scanAttemptsTable.scanType, scanType),
          gte(scanAttemptsTable.attemptedAt, berlinMidnight),
        ),
      );

    const count = row?.count ?? 0;
    if (count >= limit) {
      return {
        allowed: false,
        resetsAt,
        limit,
        reason: "user",
        attemptId: null,
      };
    }

    // The first look of the universal scan is not a scan of its own: it stays
    // out of the app-wide budget (the scan after it counts there).
    const budget = scanType === "classify" ? null : scanDailyBudget();
    if (budget !== null) {
      // One app-wide lock, taken after the per-user one (always in this order,
      // so two transactions can never wait on each other), serializes the
      // budget check so concurrent scans cannot overshoot it.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('scan-budget'), hashtext('all'))`,
      );
      const [total] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(scanAttemptsTable)
        .where(and(gte(scanAttemptsTable.attemptedAt, berlinMidnight), ne(scanAttemptsTable.scanType, "classify")));
      if ((total?.count ?? 0) >= budget) {
        return {
          allowed: false,
          resetsAt,
          limit,
          reason: "budget",
          attemptId: null,
        };
      }
    }

    const [inserted] = await tx
      .insert(scanAttemptsTable)
      .values({ userId, scanType })
      .returning({ id: scanAttemptsTable.id });
    return { allowed: true, resetsAt, limit, attemptId: inserted?.id ?? null };
  });
  // Daily total of AI actions for the owner's statistics (no user stored).
  if (result.allowed) void bumpUsage("ai_actions");
  return result;
}

/**
 * Give back one specific recorded attempt, identified by the `attemptId` that
 * checkAndRecordScanAttempt returned for this very request.
 *
 * The attempt is recorded *before* the AI runs (so concurrent requests can't
 * overshoot the cap), which means an attempt that never produced a result — the
 * AI provider erroring out, a transient upstream failure — would otherwise
 * silently consume part of the user's daily quota. Since the queue retries such
 * failures automatically, a handful of server-side hiccups could burn the whole
 * day's allowance and leave queued photos stuck at "waiting" until midnight.
 *
 * Deleting by primary key (rather than "the newest attempt today") is what makes
 * this safe under concurrency: two scans running in parallel each refund their
 * own row, so a failing request can never cancel out a successful one's attempt.
 *
 * Only call this for failures where no identification was returned. A
 * successful AI call that merely reported "not a plant" DID consume the
 * resource and must stay counted.
 *
 * Never throws: a failed refund must not turn into a second error response.
 */
export async function refundScanAttempt(attemptId: number | null): Promise<void> {
  if (attemptId === null) return;
  try {
    await db.delete(scanAttemptsTable).where(eq(scanAttemptsTable.id, attemptId));
  } catch {
    // Quota accounting is best-effort; the caller is already handling an error.
  }
}

// Attempts are only needed for today's count. Older rows are dead weight, and
// without cleanup the table grew by one row per scan forever. Keep a week for
// troubleshooting, then delete.
const ATTEMPT_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;

/**
 * Deletes scan attempts older than ATTEMPT_RETENTION_DAYS. Runs at most once
 * per hour per server process, so it can be called from a frequent job (the
 * minute-by-minute cron) without cost. Never throws.
 */
export async function cleanupOldScanAttempts(now: number = Date.now()): Promise<number> {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return 0;
  lastCleanupAt = now;
  try {
    const cutoff = new Date(now - ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(scanAttemptsTable)
      .where(lt(scanAttemptsTable.attemptedAt, cutoff))
      .returning({ id: scanAttemptsTable.id });
    return deleted.length;
  } catch {
    return 0;
  }
}
