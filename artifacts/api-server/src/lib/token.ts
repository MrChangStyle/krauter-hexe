/**
 * Signed session tokens (JWT, HS256).
 *
 * The token carries nothing but the user id and its own lifetime: everything
 * that can change (approval, ownership, username, leaf count) is read from the
 * database on every request, so revoking or unapproving an account takes effect
 * immediately instead of at the next login.
 */

import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'kraeuterhexe';
const AUDIENCE = 'kraeuterhexe-app';

/** 30 days, rolled forward on activity – active users stay signed in. */
export const TOKEN_TTL_S = 30 * 24 * 60 * 60;

/** Anything shorter is too easy to brute-force offline. */
const MIN_SECRET_LENGTH = 16;

let cachedSecret: Uint8Array | null = null;

/**
 * Fails loudly rather than falling back to a default: a guessable signing key
 * would let anyone mint a token for any account.
 */
export function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const raw = process.env['JWT_SECRET'];
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. ` +
        'Set it to a long random string – it signs every sign-in token, and ' +
        'changing it signs everybody out.',
    );
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

/** Called at boot so a misconfigured host fails immediately, not on first login. */
export function assertAuthConfigured(): void {
  getJwtSecret();
}

export async function createAuthToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(getJwtSecret());
}

export interface AuthTokenPayload {
  userId: string;
  /** Unix seconds; used to decide when to roll the token forward. */
  issuedAt: number;
}

/** Returns null for anything not currently valid – expired, tampered, foreign. */
export async function verifyAuthToken(
  token: string,
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }
    return {
      userId: payload.sub,
      issuedAt: typeof payload.iat === 'number' ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}
