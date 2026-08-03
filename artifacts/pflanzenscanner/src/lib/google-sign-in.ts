/**
 * "Mit Google anmelden" – the client side of the redirect flow.
 *
 * The sign-in itself is a plain browser navigation (not fetch): the server
 * sends the browser to Google and Google sends it back to
 * /api/auth/google/callback, which sets the session cookie and returns it to
 * the page it started from. Anything that went wrong on the way comes back as
 * ?anmeldung=<code>, which is translated here.
 */

const ERROR_MESSAGES: Record<string, string> = {
  'google-nicht-konfiguriert':
    'Die Anmeldung mit Google ist auf diesem Server nicht eingerichtet. Bitte melde dich mit E-Mail und Passwort an.',
  'google-abgebrochen': 'Die Anmeldung mit Google wurde abgebrochen.',
  'google-abgelaufen':
    'Die Anmeldung mit Google hat zu lange gedauert. Bitte versuche es noch einmal.',
  'google-fehlgeschlagen':
    'Die Anmeldung mit Google hat nicht geklappt. Bitte versuche es noch einmal oder melde dich mit E-Mail und Passwort an.',
  'google-email-unbestaetigt':
    'Google hat die E-Mail-Adresse dieses Kontos nicht bestätigt. Bitte melde dich mit E-Mail und Passwort an.',
  'google-konto-unbekannt':
    'Zu dieser Google-Adresse gibt es hier noch kein Konto. Lege zuerst eines mit E-Mail, Passwort und Einladungscode an – danach klappt auch die Anmeldung mit Google.',
};

/** The query parameter the server uses to report a failed sign-in. */
export const SIGN_IN_ERROR_PARAM = 'anmeldung';

/**
 * German text for a code from the server, or a generic message for a code we
 * do not know (an older build of the frontend must not fail silently).
 */
export function describeSignInError(code: string | null | undefined): string | null {
  if (!code) return null;
  return (
    ERROR_MESSAGES[code] ??
    'Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.'
  );
}

/**
 * Where to send the browser to start the sign-in. The current path is passed
 * along so the callback returns to the same place – in the workspace the app
 * lives under a path prefix, on the published host at the root.
 */
export function buildGoogleSignInUrl(returnPath: string): string {
  return `/api/auth/google?redirect=${encodeURIComponent(returnPath || '/')}`;
}

/** Removes the error parameter so a reload does not show the message again. */
export function stripSignInParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SIGN_IN_ERROR_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** Reads the error code out of a query string. */
export function readSignInError(search: string): string | null {
  return new URLSearchParams(search).get(SIGN_IN_ERROR_PARAM);
}
