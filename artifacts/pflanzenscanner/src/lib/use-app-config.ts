import { useEffect, useState } from "react";

export interface AppConfig {
  /** The one public address (from PUBLIC_BASE_URL); null = no move. */
  canonicalOrigin: string | null;
  /** Old addresses the new one accepts device data from. */
  legacyOrigins: string[];
}

const NONE: AppConfig = { canonicalOrigin: null, legacyOrigins: [] };

export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const res = await fetch(`${base}/api/app-config`, { cache: "no-store" });
    if (!res.ok) return NONE;
    const data = (await res.json()) as Partial<AppConfig>;
    return {
      canonicalOrigin: typeof data.canonicalOrigin === "string" ? data.canonicalOrigin : null,
      legacyOrigins: Array.isArray(data.legacyOrigins)
        ? data.legacyOrigins.filter((o): o is string => typeof o === "string")
        : [],
    };
  } catch {
    // Offline or old server: behave as before (no move).
    return NONE;
  }
}

/** null while loading; the app is shown meanwhile (it must work offline). */
export function useAppConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchAppConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}

/**
 * True when this page runs under an old address and the app has moved.
 * localhost is never moved away from (development).
 */
export function isOldAddress(config: AppConfig | null, origin: string, hostname: string): boolean {
  if (!config?.canonicalOrigin) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return false;
  return origin !== config.canonicalOrigin;
}
