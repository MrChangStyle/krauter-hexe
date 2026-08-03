/**
 * URL state helpers for the Kräuter-Hexe page.
 *
 * Both functions are pure / side-effect free so they can be unit-tested
 * without a browser environment. `parseUrlState` accepts an optional
 * `search` string so callers can pass `window.location.search` and tests
 * can pass any string they like.
 */

import { HEAL_TARGETS, type HealTarget } from "@/lib/heal-targets";

export interface UrlState {
  target: HealTarget;
  symptoms: string[];
  query: string;
}

/**
 * Parse the Kräuter-Hexe URL state from a query string.
 *
 * Each symptom in the `symptoms` param is individually
 * `encodeURIComponent`-encoded and joined with ",", so commas *inside* a
 * symptom name (encoded as %2C) are not confused with the delimiter.
 *
 * @param search - A query string such as `window.location.search`.
 *                 Defaults to `""` so tests can call without a browser.
 */
export function parseUrlState(search: string = ""): UrlState {
  const p = new URLSearchParams(search);
  const rawTarget = p.get("target") ?? "";
  const target =
    (HEAL_TARGETS.find((h) => h.key === rawTarget)?.key as HealTarget) ??
    "human";
  // Each symptom is individually encodeURIComponent-encoded before being joined
  // with ",", so we split first and then decode each token separately. This
  // keeps commas *inside* a symptom name (encoded as %2C) from being confused
  // with the delimiter.
  const rawSymptoms = p.get("symptoms") ?? "";
  const symptoms = rawSymptoms
    ? rawSymptoms
        .split(",")
        .map((s) => {
          try {
            return decodeURIComponent(s.trim());
          } catch {
            return s.trim();
          }
        })
        .filter(Boolean)
    : [];
  const query = p.get("q") ?? "";
  return { target, symptoms, query };
}

/**
 * Reconcile URL-supplied symptoms against the available symptoms list using a
 * case-insensitive match.  This mirrors the canonicalisedRef useEffect in the
 * Kräuter-Hexe page and is extracted here so it can be unit-tested without a
 * browser/React environment.
 *
 * @param urlSymptoms   - Raw symptom strings that came from the URL.
 * @param available     - The authoritative symptom list (canonical casing from
 *                        the server / derived from plant data).
 * @returns An object with:
 *   - `canonical`  – URL symptoms remapped to their canonical casing, in the
 *                    same order as `urlSymptoms` (unrecognised ones omitted).
 *   - `notFound`   – URL symptoms that had no case-insensitive match at all.
 */
export function canonicaliseSymptoms(
  urlSymptoms: string[],
  available: string[],
): { canonical: string[]; notFound: string[] } {
  if (urlSymptoms.length === 0) return { canonical: [], notFound: [] };

  // Build a case-insensitive lookup: lowercase → canonical form
  const lowerToCanonical = new Map(
    available.map((s) => [s.toLowerCase(), s]),
  );

  const canonical: string[] = [];
  const notFound: string[] = [];
  for (const s of urlSymptoms) {
    const found = lowerToCanonical.get(s.toLowerCase());
    if (found !== undefined) {
      canonical.push(found);
    } else {
      notFound.push(s);
    }
  }
  return { canonical, notFound };
}

/**
 * Build the query string for the Kräuter-Hexe URL from the current UI state.
 *
 * Commas inside symptom names are preserved by encoding each symptom
 * individually with `encodeURIComponent` before joining them with ",".
 */
export function buildSearchString(
  target: HealTarget,
  symptoms: Set<string>,
  query: string,
): string {
  const p = new URLSearchParams();
  p.set("target", target);
  if (symptoms.size > 0) {
    // Individually encode each symptom so that commas inside names become %2C
    // and are not confused with the "," delimiter on the receiving end.
    p.set("symptoms", Array.from(symptoms).map(encodeURIComponent).join(","));
  }
  if (query.trim()) {
    p.set("q", query.trim());
  }
  return p.toString();
}
