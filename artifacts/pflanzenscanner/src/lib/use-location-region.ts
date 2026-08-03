/**
 * Hook for the one-time-per-session location permission flow.
 *
 * Usage:
 *   const loc = useLocationRegion();
 *   // In an async handler, before submitting a scan:
 *   const region = await loc.askForLocation();
 *   // Render the card overlay:
 *   {loc.cardState !== "hidden" && <LocationCard loc={loc} />}
 */

import { useCallback, useRef, useState } from "react";

const SESSION_KEY = "pf_geo_decision";

export type GeoCardState = "hidden" | "asking" | "locating" | "manual";

function readSession(): { decided: boolean; region: string | null } {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { decided: false, region: null };
    return JSON.parse(raw) as { decided: boolean; region: string | null };
  } catch {
    return { decided: false, region: null };
  }
}

function writeSession(region: string | null): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ decided: true, region }));
  } catch {
    // private browsing or quota — silently skip
  }
}

export interface UseLocationRegionReturn {
  cardState: GeoCardState;
  geoError: string | null;
  manualRegion: string;
  setManualRegion: (v: string) => void;
  /**
   * Call once before submitting a scan. If the user already decided this
   * session, resolves immediately with the cached region (may be null).
   * Otherwise shows the permission card and resolves after the user acts.
   */
  askForLocation: () => Promise<string | null>;
  /** User tapped "Ja, erlauben" — requests GPS then reverse-geocodes. */
  onGrant: () => void;
  /** User tapped "Nein danke" — skips location for the whole session. */
  onDeny: () => void;
  /** User submitted the manual text field (or tapped "Überspringen"). */
  onManualSubmit: () => void;
}

export function useLocationRegion(): UseLocationRegionReturn {
  const [cardState, setCardState] = useState<GeoCardState>("hidden");
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualRegion, setManualRegion] = useState("");
  const resolveRef = useRef<((r: string | null) => void) | null>(null);

  const finish = useCallback((region: string | null) => {
    writeSession(region);
    resolveRef.current?.(region);
    resolveRef.current = null;
    setCardState("hidden");
    setGeoError(null);
    setManualRegion("");
  }, []);

  const askForLocation = useCallback((): Promise<string | null> => {
    const session = readSession();
    if (session.decided) return Promise.resolve(session.region);

    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
      setCardState("asking");
    });
  }, []);

  const onGrant = useCallback(() => {
    setCardState("locating");
    setGeoError(null);

    if (!navigator.geolocation) {
      setGeoError("Standortbestimmung nicht verfügbar.");
      setCardState("manual");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const base = import.meta.env.BASE_URL ?? "/";
          const url = `${base.endsWith("/") ? base : base + "/"}api/geo/reverse`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
            }),
          });
          if (!resp.ok) throw new Error("Server error");
          const { region } = (await resp.json()) as { region: string };
          finish(region);
        } catch {
          setGeoError("Standort konnte nicht ermittelt werden.");
          setCardState("manual");
        }
      },
      () => {
        setGeoError("Standortzugriff verweigert oder nicht verfügbar.");
        setCardState("manual");
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, [finish]);

  const onDeny = useCallback(() => {
    finish(null);
  }, [finish]);

  const onManualSubmit = useCallback(() => {
    finish(manualRegion.trim().slice(0, 80) || null);
  }, [finish, manualRegion]);

  return {
    cardState,
    geoError,
    manualRegion,
    setManualRegion,
    askForLocation,
    onGrant,
    onDeny,
    onManualSubmit,
  };
}
