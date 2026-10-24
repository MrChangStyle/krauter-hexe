/**
 * Darstellung: hell, dunkel oder wie das Gerät. Kept per device
 * (localStorage "lf-theme"); index.html applies it before the first paint so
 * nothing flashes. The dark colours are the `.dark` variables in index.css.
 */

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "lf-theme";
const THEME_COLOR = { light: "#2F5B44", dark: "#13201A" } as const;

export function readTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/** What the choice means right now. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): "light" | "dark" {
  return choice === "system" ? (systemDark ? "dark" : "light") : choice;
}

function systemDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(choice: ThemeChoice = readTheme()): void {
  if (typeof document === "undefined") return;
  const mode = resolveTheme(choice, systemDark());
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[mode]);
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage blocked: still applies for this visit */
  }
  applyTheme(choice);
}

/** Follows the device while the choice is "Wie das Gerät". */
export function watchSystemTheme(): () => void {
  const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;
  if (!media) return () => undefined;
  const onChange = () => {
    if (readTheme() === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
