import type { Pasture, PastureBoundary } from "@workspace/api-client-react";

/**
 * Weidekarte (docs/weide.md): measuring an outline while it is drawn, the map
 * colours and the place the map opens. The server computes the stored area with
 * the same formula (api-server lib/pasture.ts).
 */

const EARTH_RADIUS_M = 6_378_137;

/** The area of an outline in hectares, on the sphere; 0 below three corners. */
export function boundaryAreaHa(boundary: PastureBoundary): number {
  if (boundary.length < 3) return 0;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < boundary.length; i++) {
    const [lat1, lng1] = boundary[i]!;
    const [lat2, lng2] = boundary[(i + 1) % boundary.length]!;
    sum += (lng2! - lng1!) * rad * (2 + Math.sin(lat1! * rad) + Math.sin(lat2! * rad));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) / 10_000;
}

/** Like the status line on the cards: grazed lime, resting amber, ready green. */
export const STATUS_COLORS: Record<Pasture["status"], string> = {
  grazed: "#65a30d",
  resting: "#d97706",
  ready: "#417056",
};

/** The colour for an archived pasture and for the others while drawing. */
export const MUTED_COLOR = "#78716c";

export type View = { bounds: [[number, number], [number, number]] } | { center: [number, number]; zoom: number };

// Roughly the middle of Germany, for a farm without a location.
const FALLBACK: View = { center: [51.2, 10.4], zoom: 6 };

/** Where the map opens: around the given outlines, else at the farm, else over Germany. */
export function initialView(outlines: PastureBoundary[], farm: { latitude: number; longitude: number } | null): View {
  const points = outlines.flat();
  if (points.length > 0) {
    const lats = points.map((p) => p[0]!);
    const lngs = points.map((p) => p[1]!);
    return {
      bounds: [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
    };
  }
  return farm ? { center: [farm.latitude, farm.longitude], zoom: 17 } : FALLBACK;
}

const CONSENT_KEY = "lf-osm-ok";

/** The map tiles come from OpenStreetMap – shown only after a tap, remembered on this device. */
export function mapAllowed(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function allowMap(): void {
  try {
    localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // Private mode: ask again next time.
  }
}
