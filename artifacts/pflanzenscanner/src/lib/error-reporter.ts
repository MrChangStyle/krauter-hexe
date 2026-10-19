/**
 * Sends errors the app runs into to the server's error monitor
 * (POST /api/client-errors) – message, stack and the page path, nothing
 * about the person. A few per session, each kind once.
 */

const MAX_PER_SESSION = 10;
const sent = new Set<string>();
const release: string | null = (import.meta.env.VITE_RELEASE as string | undefined) ?? null;

/** Browser noise that says nothing about our code. */
export function isNoise(message: string): boolean {
  return /^Script error\.?$|ResizeObserver loop|Non-Error promise rejection captured|AbortError|The user aborted a request|Load failed$|NetworkError when attempting|Failed to fetch$/i.test(
    message.trim(),
  );
}

export function reportError(error: unknown, extra?: string): void {
  try {
    const e = error instanceof Error ? error : null;
    const message = `${extra ? `${extra}: ` : ""}${e?.message ?? String(error)}`.slice(0, 1000);
    if (!message || isNoise(e?.message ?? message)) return;
    const key = `${message}|${e?.stack?.split("\n")[1] ?? ""}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    void fetch(`${base}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ message, stack: e?.stack?.slice(0, 8000) ?? null, path: window.location.pathname, release }),
    }).catch(() => {});
  } catch {
    /* reporting must never cause an error itself */
  }
}

let installed = false;

/** Catches what no code handles: uncaught errors and rejected promises. */
export function installErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => reportError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "Unhandled rejection"));
}
