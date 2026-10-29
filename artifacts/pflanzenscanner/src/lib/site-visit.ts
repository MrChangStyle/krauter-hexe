/**
 * Besucher der Homepage (docs/analyse.md): tells the server that a public
 * page was opened – the page, a campaign name from the address (utm_source or
 * ref) and the referring page. No cookie, nothing stored on the device; the
 * server keeps only day, page, origin and a count. Nothing is sent when the
 * browser asks not to be tracked.
 */

type Nav = Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };

export function trackingRefused(nav: Nav | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  return !nav || nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

/** The campaign name from the address: utm_source, else ref. */
export function campaignOf(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("utm_source") ?? params.get("ref");
}

// The referrer only counts for the first page of a visit; later pages are "intern".
let first = true;

export function sendSiteVisit(path: string): void {
  if (trackingRefused() || typeof navigator.sendBeacon !== "function") return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const body = JSON.stringify({
    path: path.startsWith(base) ? path.slice(base.length) || "/" : path,
    campaign: first ? campaignOf(window.location.search) : null,
    referrer: first ? document.referrer || null : window.location.origin,
  });
  first = false;
  try {
    navigator.sendBeacon(`${base}/api/site/visit`, new Blob([body], { type: "application/json" }));
  } catch {
    // Counting must never disturb the page.
  }
}
