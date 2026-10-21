/**
 * Vorschau-Schutz (docs/landingpage.md): an app shell from the offline cache
 * can run before the visitor has typed the site password. The server then
 * answers API calls with 401 and X-Site-Locked; this sends the browser to the
 * password page once, and back to the same page afterwards.
 */

export const GATE_PATH = "/api/site-access";

export function gateUrl(location: { pathname: string; search: string }): string {
  return `${GATE_PATH}?next=${encodeURIComponent(location.pathname + location.search)}`;
}

export function installSiteLockRedirect(): void {
  if (typeof window === "undefined" || !window.fetch) return;
  const original = window.fetch.bind(window);
  let sent = false;
  window.fetch = async (...args) => {
    const res = await original(...args);
    if (!sent && res.status === 401 && res.headers.get("x-site-locked") === "1") {
      sent = true;
      window.location.assign(gateUrl(window.location));
    }
    return res;
  };
}
