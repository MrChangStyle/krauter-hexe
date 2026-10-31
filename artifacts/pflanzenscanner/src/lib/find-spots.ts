/**
 * Fundorte (docs/fundorte.md), the app side: the position is rounded to the
 * centre of a ~2 km cell here, on the phone, before anything is sent – the
 * exact position never leaves the device. Same grid as the server
 * (api-server/src/lib/findSpots.ts), which rounds again.
 */

export const CELL_KM = 2;
const KM_PER_DEGREE = 111.32;

export interface FindSpot {
  lat: number;
  lon: number;
}

/** Centre of the ~2 km cell a position lies in. */
export function roundToCell(lat: number, lon: number, km = CELL_KM): FindSpot {
  const latStep = km / KM_PER_DEGREE;
  const row = Math.floor(lat / latStep);
  const centreLat = (row + 0.5) * latStep;
  const lonStep = latStep / Math.max(Math.cos((centreLat * Math.PI) / 180), 0.05);
  const col = Math.floor(lon / lonStep);
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return { lat: r(centreLat), lon: r((col + 0.5) * lonStep) };
}

/**
 * The cell of the current position – only when the account agreed to the
 * shared map and the browser already allows the location (the scan page asks
 * for it). Never shows a permission prompt of its own; null otherwise.
 */
export async function currentFindSpot(consent: boolean | null | undefined, nav: Navigator = navigator): Promise<FindSpot | null> {
  if (consent !== true || !nav.geolocation) return null;
  try {
    const state = await nav.permissions?.query({ name: "geolocation" as PermissionName });
    if (state && state.state !== "granted") return null;
  } catch {
    // Permissions API missing (older Safari): the scan page asked already.
  }
  return new Promise((resolve) => {
    nav.geolocation.getCurrentPosition(
      (pos) => resolve(roundToCell(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { timeout: 4000, maximumAge: 300_000 },
    );
  });
}
