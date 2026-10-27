/**
 * Which build of the app is running, and a note across the reload of an
 * update so the new version can say "App aktualisiert" (docs/benachrichtigungen.md).
 */

declare const __APP_BUILT_AT__: string | undefined;

const UPDATED_KEY = "lf-just-updated";

/** When this build was made (ISO), or null outside a real build. */
export function appBuiltAt(): string | null {
  return typeof __APP_BUILT_AT__ === "string" ? __APP_BUILT_AT__ : null;
}

/** "27.10.2026, 19:28" in Berlin time. */
export function formatBuild(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Called right before an update reloads the app. */
export function markUpdating(storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(UPDATED_KEY, "1");
  } catch {
    // Without storage there is simply no "App aktualisiert" message.
  }
}

/** True once after an update reload; clears the note. */
export function takeUpdated(storage: Pick<Storage, "getItem" | "removeItem"> | null = safeStorage()): boolean {
  try {
    if (storage?.getItem(UPDATED_KEY) !== "1") return false;
    storage.removeItem(UPDATED_KEY);
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
