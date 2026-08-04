/**
 * "Mit Google anmelden" – configuration and the small pure helpers around it.
 *
 * The sign-in flow itself lives in routes/google-auth.ts; everything that can
 * be reasoned about without a request (is it configured, which callback URL do
 * we hand to Google, is this return path safe) is kept here so it can be
 * tested on its own.
 *
 * Google is an *optional* second way in: the app keeps its own accounts, so it
 * still runs on any host with no Google project at all. Without both
 * credentials the button is simply not offered.
 */

import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { getJwtSecret } from './token';

/** Must match the URI registered in the Google Cloud console, exactly. */
export const GOOGLE_CALLBACK_PATH = '/api/auth/google/callback';

/**
 * Cookie holding the one-time state of an in-flight sign-in.
 *
 * The `__Host-` prefix is enforced by the browser: the cookie is only accepted
 * when it is Secure, has path "/" and no Domain attribute. That makes it
 * impossible for a sibling host (or a network attacker on a look-alike
 * subdomain) to plant a cookie of this name for us.
 */
export const GOOGLE_OAUTH_COOKIE = '__Host-google_oauth';

/** A sign-in that is not finished within this window has to be restarted. */
export const GOOGLE_OAUTH_TTL_MS = 10 * 60 * 1000;

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

/** Null unless BOTH values are configured – half a configuration is useless. */
export function getGoogleCredentials(): GoogleCredentials | null {
  const clientId = process.env['GOOGLE_CLIENT_ID']?.trim();
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleAuthConfigured(): boolean {
  return getGoogleCredentials() !== null;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  // Proxy chains append: "https,http" – only the first hop is ours.
  return raw?.split(',')[0]?.trim() || undefined;
}

/**
 * The absolute URL Google sends the browser back to.
 *
 * Prefers PUBLIC_BASE_URL, because forwarded headers can be set by whoever
 * sends the request: without the override a crafted Host header would build a
 * callback URL pointing somewhere else. Google rejects any URL that is not
 * registered, so this is belt and braces – but it also keeps the URL stable
 * when the app is reachable under more than one hostname.
 */
export function resolveCallbackUrl(req: Request): string {
  const configured = process.env['PUBLIC_BASE_URL']?.trim();
  if (configured) {
    return `${configured.replace(/\/+$/, '')}${GOOGLE_CALLBACK_PATH}`;
  }

  const proto =
    firstHeaderValue(req.headers['x-forwarded-proto']) ?? req.protocol ?? 'https';
  const host =
    firstHeaderValue(req.headers['x-forwarded-host']) ??
    firstHeaderValue(req.headers['host']) ??
    'localhost';

  return `${proto}://${host}${GOOGLE_CALLBACK_PATH}`;
}

/**
 * Where the browser goes after the round trip.
 *
 * Only same-origin paths are allowed. Anything else – an absolute URL, a
 * protocol-relative "//evil.example", a backslash variant Windows browsers
 * used to normalise – would turn the callback into an open redirect that can
 * be linked from a phishing mail.
 */
export function sanitizeReturnPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (value.length > 512) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.includes('\\') || /[\x00-\x1f]/.test(value)) return fallback;
  return value;
}

/** Adds ?fehler=… to a path that may already carry a query string or hash. */
export function appendErrorParam(returnPath: string, code: string): string {
  const [pathAndQuery = '', hash] = returnPath.split('#', 2);
  const separator = pathAndQuery.includes('?') ? '&' : '?';
  const withError = `${pathAndQuery}${separator}anmeldung=${encodeURIComponent(code)}`;
  return hash ? `${withError}#${hash}` : withError;
}

export interface PendingGoogleSignIn {
  /** Random value echoed back by Google; guards against forged callbacks. */
  state: string;
  /** PKCE verifier, so an intercepted code cannot be redeemed by anyone else. */
  codeVerifier: string;
  /** Same-origin path to return to. */
  returnPath: string;
  /** The redirect URI handed to Google; the token exchange must repeat it. */
  callbackUrl: string;
  /** Unix ms; anything older than GOOGLE_OAUTH_TTL_MS is refused. */
  createdAt: number;
}

/**
 * The cookie is signed, not just encoded.
 *
 * Without a signature the whole state check is worthless: anyone able to plant
 * a cookie in the victim's browser could put in *their own* state and PKCE
 * verifier, hand the victim a matching callback link, and have the victim's
 * browser finish the sign-in as the attacker's Google account (login CSRF).
 * Comparing two values the attacker chose proves nothing – so the server signs
 * the payload with the same secret that signs session tokens and refuses
 * anything it did not issue itself.
 */
function signPayload(payload: string): string {
  return createHmac('sha256', getJwtSecret()).update(payload).digest('base64url');
}

function signatureMatches(payload: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(payload), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function encodePendingSignIn(pending: PendingGoogleSignIn): string {
  const payload = Buffer.from(JSON.stringify(pending), 'utf8').toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

/** Returns null for anything unreadable, unsigned, tampered with, or stale. */
export function decodePendingSignIn(
  raw: unknown,
  now: number,
): PendingGoogleSignIn | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0 || separator === raw.length - 1) return null;

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!signatureMatches(payload, signature)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<PendingGoogleSignIn>;

    if (
      typeof parsed.state !== 'string' ||
      parsed.state.length < 16 ||
      typeof parsed.codeVerifier !== 'string' ||
      parsed.codeVerifier.length < 16 ||
      typeof parsed.callbackUrl !== 'string' ||
      !parsed.callbackUrl.startsWith('http') ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }
    if (now - parsed.createdAt > GOOGLE_OAUTH_TTL_MS || now < parsed.createdAt) {
      return null;
    }

    return {
      state: parsed.state,
      codeVerifier: parsed.codeVerifier,
      returnPath: sanitizeReturnPath(parsed.returnPath),
      callbackUrl: parsed.callbackUrl,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Names of the things Google tells us about the account. Only a verified
 * address may be used to find or create an account: an unverified one is just
 * a string somebody typed, and matching it against an existing account would
 * hand that account to whoever typed it.
 */
export interface GoogleIdentity {
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export function readIdentity(payload: {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
}): GoogleIdentity | null {
  const email = payload.email?.trim().toLowerCase();
  if (!email || payload.email_verified !== true) return null;
  return {
    email,
    firstName: payload.given_name?.trim() || null,
    lastName: payload.family_name?.trim() || null,
    profileImageUrl: payload.picture?.trim() || null,
  };
}
