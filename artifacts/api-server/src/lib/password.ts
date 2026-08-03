/**
 * Password hashing with scrypt from Node's own crypto module.
 *
 * scrypt is deliberately memory-hard, which is what makes a stolen hash
 * expensive to attack. Using the built-in implementation avoids a native
 * dependency (bcrypt/argon2 need a compiler on the host), so the app installs
 * cleanly on any platform.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>`. The
 * parameters travel with the hash, so they can be raised later without
 * invalidating existing passwords.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;

/** Unicode-normalise so the same typed password always yields the same bytes. */
function prepare(password: string): string {
  return password.normalize('NFKC');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(prepare(password), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

/**
 * Hash of a value nobody knows, used to spend the same time on a login attempt
 * for an unknown email as for a known one. Without it, "no such account"
 * answers noticeably faster than "wrong password" and the login endpoint
 * becomes an email-address oracle.
 */
let dummyHash: Promise<string> | null = null;

export async function spendVerificationTime(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(24).toString('base64'));
  await verifyPassword(password, await dummyHash);
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scryptAsync(prepare(password), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: MAX_MEM,
    });
  } catch {
    return false;
  }

  // Constant-time comparison so response timing cannot reveal how much of the
  // hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
