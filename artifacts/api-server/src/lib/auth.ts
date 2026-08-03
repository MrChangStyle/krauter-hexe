/**
 * Sign-in cookie handling.
 *
 * The app used to authenticate against Replit's OIDC provider with the repl's
 * own id as the client id, which only worked while it was hosted there. It now
 * keeps its own accounts (email + password) and hands out a signed token, so it
 * runs unchanged on any host.
 */

import { type Request, type Response } from 'express';

import { TOKEN_TTL_S } from './token';

export const AUTH_COOKIE = 'auth';

/** Cookie written by the previous Replit Auth integration. */
const LEGACY_SESSION_COOKIE = 'sid';

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_TTL_S * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  // Also drop the old session cookie, otherwise browsers that signed in before
  // the switch keep sending a cookie that can never be valid again.
  res.clearCookie(LEGACY_SESSION_COOKIE, { path: '/' });
}

/**
 * Reads the token from the cookie, or from an Authorization header – the
 * header form is what makes the API testable with curl.
 */
export function getAuthToken(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return req.cookies?.[AUTH_COOKIE];
}
