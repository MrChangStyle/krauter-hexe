/**
 * Real connectivity check.
 *
 * `navigator.onLine` only says whether the phone has *some* network. In a barn
 * or on a field with one bar of signal it reports "online" while no request
 * gets through, so a queue that trusts it starts a scan that just hangs.
 * This module asks the server itself (GET /api/healthz) with a short time
 * limit and remembers the answer briefly so frequent callers (the 5-second
 * queue interval) do not flood a weak connection with probes.
 */

const PROBE_TIMEOUT_MS = 15_000;
const CACHE_OK_MS = 30_000;
const CACHE_FAIL_MS = 10_000;

let lastResult: { ok: boolean; at: number } | null = null;
let inFlight: Promise<boolean> | null = null;

function healthUrl(): string {
  const base = (import.meta.env.BASE_URL as string).replace(/\/$/, "");
  return `${base}/api/healthz`;
}

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl(), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True when the server is actually reachable right now. Returns false at once
 * when the device reports no network at all.
 */
export async function hasRealConnection(now: number = Date.now()): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    lastResult = { ok: false, at: now };
    return false;
  }
  if (lastResult) {
    const maxAge = lastResult.ok ? CACHE_OK_MS : CACHE_FAIL_MS;
    if (now - lastResult.at < maxAge) return lastResult.ok;
  }
  if (!inFlight) {
    inFlight = probe()
      .then((ok) => {
        lastResult = { ok, at: Date.now() };
        return ok;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Forget the cached answer, e.g. when the browser fires `online`. */
export function resetConnectionCache(): void {
  lastResult = null;
}
