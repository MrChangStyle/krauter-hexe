/**
 * Cloudflare Turnstile – bot check for the registration form.
 *
 * Optional, like Google sign-in: only when BOTH keys are set does the login
 * screen show the widget and the server demand a token. Without them the
 * check is skipped, so development and the family setup keep working.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export interface TurnstileConfig {
  siteKey: string;
  secretKey: string;
}

export function getTurnstileConfig(): TurnstileConfig | null {
  const siteKey = process.env['TURNSTILE_SITE_KEY']?.trim();
  const secretKey = process.env['TURNSTILE_SECRET_KEY']?.trim();
  if (!siteKey || !secretKey) return null;
  return { siteKey, secretKey };
}

/**
 * Asks Cloudflare whether the token from the widget is genuine.
 *
 * Fails closed: a missing token, a rejected token, a timeout or an unreachable
 * Cloudflare all count as "not verified". Registration is rare enough that an
 * occasional retry is a fair price for not letting bots through when the check
 * cannot run.
 */
export async function verifyTurnstileToken(
  config: TurnstileConfig,
  token: unknown,
  remoteIp: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return false;
  }

  const form = new URLSearchParams({ secret: config.secretKey, response: token });
  if (remoteIp) form.set('remoteip', remoteIp);

  try {
    const res = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    return false;
  }
}
