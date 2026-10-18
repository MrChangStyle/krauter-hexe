/**
 * Where the app lives, for the move to a new domain.
 *
 * canonicalOrigin comes from PUBLIC_BASE_URL – the one public address. When
 * the app is opened under any other address, the client shows the move
 * helper instead of the app (see pflanzenscanner/src/components/move-screen).
 * legacyOrigins (LEGACY_ORIGINS, comma separated) are the old addresses the
 * new one accepts device data from; nothing else may send it data.
 */

function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export interface AppConfig {
  canonicalOrigin: string | null;
  legacyOrigins: string[];
}

export function getAppConfig(): AppConfig {
  const canonicalOrigin = originOf(process.env['PUBLIC_BASE_URL']);
  const legacyOrigins = (process.env['LEGACY_ORIGINS'] ?? '')
    .split(',')
    .map((entry) => originOf(entry))
    .filter((origin): origin is string => !!origin && origin !== canonicalOrigin);
  return { canonicalOrigin, legacyOrigins: [...new Set(legacyOrigins)] };
}
