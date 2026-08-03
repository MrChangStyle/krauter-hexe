/**
 * "Mit Google anmelden" (OAuth 2.0 authorization code flow with PKCE).
 *
 *   GET /api/auth/google           → sends the browser to Google
 *   GET /api/auth/google/callback  → Google sends it back here
 *
 * Google is a convenience on top of the app's own accounts, not a replacement:
 * the account row, the approval flag and the session cookie are exactly the
 * same as after an email + password login, so nothing else in the app has to
 * know which way somebody signed in. With no GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET configured the routes stay silent and the frontend does
 * not offer the button.
 */

import { db, usersTable } from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { Router, type IRouter, type Request, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, createHash } from 'node:crypto';

import { promoteFirstOwner, publicUserColumns } from '../lib/accounts';
import { setAuthCookie } from '../lib/auth';
import {
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_TTL_MS,
  appendErrorParam,
  decodePendingSignIn,
  encodePendingSignIn,
  getGoogleCredentials,
  isGoogleAuthConfigured,
  readIdentity,
  resolveCallbackUrl,
  sanitizeReturnPath,
} from '../lib/googleOAuth';
import { logger } from '../lib/logger';
import { createAuthToken } from '../lib/token';

const router: IRouter = Router();

/** Everything the app needs to know about the account; nothing more. */
const SCOPES = ['openid', 'email', 'profile'];

function setPendingCookie(res: Response, value: string): void {
  res.cookie(GOOGLE_OAUTH_COOKIE, value, {
    httpOnly: true,
    secure: true,
    // "lax" is required: the callback arrives as a top-level navigation from
    // google.com, and "strict" would withhold the cookie exactly then.
    sameSite: 'lax',
    path: '/',
    maxAge: GOOGLE_OAUTH_TTL_MS,
  });
}

function clearPendingCookie(res: Response): void {
  res.clearCookie(GOOGLE_OAUTH_COOKIE, { path: '/' });
}

/** PKCE S256 challenge for a verifier. */
function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ── GET /auth/providers ───────────────────────────────────────────────────────
// Lets the login screen decide whether to offer the Google button at all,
// instead of showing one that can only fail.

router.get('/auth/providers', (_req: Request, res: Response) => {
  res.json({ google: isGoogleAuthConfigured() });
});

// ── GET /auth/google ──────────────────────────────────────────────────────────

router.get('/auth/google', async (req: Request, res: Response): Promise<void> => {
  const returnPath = sanitizeReturnPath(req.query['redirect']);
  const credentials = getGoogleCredentials();

  if (!credentials) {
    res.redirect(appendErrorParam(returnPath, 'google-nicht-konfiguriert'));
    return;
  }

  const state = randomBytes(24).toString('base64url');
  const codeVerifier = randomBytes(48).toString('base64url');

  setPendingCookie(
    res,
    encodePendingSignIn({ state, codeVerifier, returnPath, createdAt: Date.now() }),
  );

  const client = new OAuth2Client({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    redirectUri: resolveCallbackUrl(req),
  });

  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: SCOPES,
    state,
    code_challenge_method: 'S256' as never,
    code_challenge: codeChallengeFor(codeVerifier),
    // Several family members share devices – always let them pick which
    // Google account to use instead of silently reusing the last one.
    prompt: 'select_account',
  });

  res.redirect(url);
});

// ── GET /auth/google/callback ─────────────────────────────────────────────────

router.get(
  '/auth/google/callback',
  async (req: Request, res: Response): Promise<void> => {
    const pending = decodePendingSignIn(
      req.cookies?.[GOOGLE_OAUTH_COOKIE],
      Date.now(),
    );
    clearPendingCookie(res);

    const returnPath = pending?.returnPath ?? '/';

    const fail = (code: string, reason: string, err?: unknown): void => {
      logger.warn({ err, reason }, 'Google sign-in failed');
      res.redirect(appendErrorParam(returnPath, code));
    };

    if (typeof req.query['error'] === 'string') {
      // access_denied = the user pressed "Abbrechen" in Google's dialog.
      fail(
        req.query['error'] === 'access_denied'
          ? 'google-abgebrochen'
          : 'google-fehlgeschlagen',
        `google returned ${String(req.query['error'])}`,
      );
      return;
    }

    const credentials = getGoogleCredentials();
    if (!credentials) {
      fail('google-nicht-konfiguriert', 'credentials missing');
      return;
    }

    const code = req.query['code'];
    const state = req.query['state'];

    // No pending cookie, or a state that does not match it: either the sign-in
    // took too long, or this callback was not started by this browser.
    if (
      !pending ||
      typeof code !== 'string' ||
      typeof state !== 'string' ||
      state !== pending.state
    ) {
      fail('google-abgelaufen', 'missing or mismatched state');
      return;
    }

    const client = new OAuth2Client({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: resolveCallbackUrl(req),
    });

    let idToken: string | undefined;
    try {
      const { tokens } = await client.getToken({
        code,
        codeVerifier: pending.codeVerifier,
      });
      idToken = tokens.id_token ?? undefined;
    } catch (err) {
      fail('google-fehlgeschlagen', 'token exchange failed', err);
      return;
    }

    if (!idToken) {
      fail('google-fehlgeschlagen', 'no id_token in token response');
      return;
    }

    let identity;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: credentials.clientId,
      });
      identity = readIdentity(ticket.getPayload() ?? {});
    } catch (err) {
      fail('google-fehlgeschlagen', 'id_token verification failed', err);
      return;
    }

    if (!identity) {
      fail('google-email-unbestaetigt', 'unverified or missing email');
      return;
    }

    const [existing] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${identity.email}`);

    let userId: string;

    if (existing) {
      userId = existing.id;
      // Fill in what the account is still missing, but never overwrite a name
      // or picture the user has set inside the app.
      const patch: Record<string, string> = {};
      if (!existing.firstName && identity.firstName) patch['firstName'] = identity.firstName;
      if (!existing.lastName && identity.lastName) patch['lastName'] = identity.lastName;
      if (!existing.profileImageUrl && identity.profileImageUrl) {
        patch['profileImageUrl'] = identity.profileImageUrl;
      }
      if (Object.keys(patch).length > 0) {
        await db.update(usersTable).set(patch).where(eq(usersTable.id, userId));
      }
    } else {
      // An invitation code being configured means "no self-service accounts".
      // A Google redirect has nowhere to type that code, so an unknown address
      // is turned away instead of quietly creating a row – otherwise anyone
      // with a Google account could sign up on a URL that is meant to be
      // closed.
      if (process.env['REGISTRATION_CODE']) {
        fail('google-konto-unbekannt', 'unknown email and registration is code-gated');
        return;
      }

      const [created] = await db
        .insert(usersTable)
        .values({
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          profileImageUrl: identity.profileImageUrl,
        })
        .returning(publicUserColumns);

      userId = created.id;
      // Same rule as for the email + password registration: the very first
      // account is the owner, everyone after that waits for approval.
      await promoteFirstOwner(userId);
    }

    setAuthCookie(res, await createAuthToken(userId));
    res.redirect(returnPath);
  },
);

export default router;
