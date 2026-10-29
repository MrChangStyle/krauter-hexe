/**
 * Homepage or app (docs/landingpage.md, „Homepage und App unter einer
 * Adresse“): littlefarming.de in a browser tab shows the homepage – also when
 * signed in –, littlefarming.de/app opens the app. The installed app (started
 * from the home screen) and every app page (/farm, /aufgaben …) stay the app,
 * so nothing changes for existing users. Once a tab is in the app it stays
 * there, also on reload (sessionStorage).
 */

/** The entry to the app; replaced by "/" once the app runs. */
export const APP_PATH = "/app";
const FLAG = "lf-app";

export interface EntryInput {
  /** Path without the base path ("/", "/app", "/farm" …). */
  path: string;
  search: string;
  /** Started from the home screen (display-mode standalone). */
  standalone: boolean;
  /** This tab was in the app before. */
  inApp: boolean;
}

/** What "/" and "/app" show; every other path is the app (or a public page, decided elsewhere). */
export function entryFor({ path, search, standalone, inApp }: EntryInput): { show: "site" | "app"; replacePath?: string } {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === APP_PATH) return { show: "app", replacePath: "/" };
  if (p !== "/") return { show: "app" };
  // Links into the app carry parameters (?start=login, Google sign-in errors, …);
  // campaign parameters of marketing links (docs/analyse.md) do not.
  if (standalone || inApp || appParams(search)) return { show: "app" };
  return { show: "site" };
}

const CAMPAIGN_PARAM = /^(ref|utm_[a-z]+|fbclid|gclid|msclkid)$/;

/** True when the address carries a parameter other than a campaign's. */
function appParams(search: string): boolean {
  return [...new URLSearchParams(search).keys()].some((k) => !CAMPAIGN_PARAM.test(k));
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function tabIsInApp(): boolean {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

/** Remembers for this tab that it is in the app. */
export function markInApp(): void {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    // Private mode without storage: the tab falls back to the homepage on reload.
  }
}

/** Decides once per page load, and puts "/app" back to "/" so the app's routes work. */
export function resolveEntry(base: string): "site" | "app" {
  const { pathname, search, hash } = window.location;
  const path = pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
  const entry = entryFor({ path, search, standalone: isStandalone(), inApp: tabIsInApp() });
  if (entry.show === "app") markInApp();
  if (entry.replacePath) window.history.replaceState(null, "", `${base}${entry.replacePath}${search}${hash}`);
  return entry.show;
}
