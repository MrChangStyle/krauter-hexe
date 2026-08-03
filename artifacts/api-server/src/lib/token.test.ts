import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'ein-sehr-langes-test-geheimnis-1234567890';
const ORIGINAL = process.env['JWT_SECRET'];

/**
 * The secret is cached after the first use, so every test imports a fresh copy
 * of the module to control which secret is in play.
 */
async function loadTokenModule() {
  vi.resetModules();
  return import('./token');
}

beforeEach(() => {
  process.env['JWT_SECRET'] = SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['JWT_SECRET'];
  else process.env['JWT_SECRET'] = ORIGINAL;
});

describe('auth tokens', () => {
  it('round-trips the user id', async () => {
    const { createAuthToken, verifyAuthToken } = await loadTokenModule();
    const token = await createAuthToken('user-42');
    const payload = await verifyAuthToken(token);
    expect(payload?.userId).toBe('user-42');
    expect(payload?.issuedAt).toBeGreaterThan(0);
  });

  it('rejects a tampered token', async () => {
    const { createAuthToken, verifyAuthToken } = await loadTokenModule();
    const token = await createAuthToken('user-42');
    // Flip the payload segment: the signature no longer matches.
    const [header, , signature] = token.split('.');
    const forged = `${header}.${Buffer.from(
      JSON.stringify({ sub: 'someone-else' }),
    ).toString('base64url')}.${signature}`;
    await expect(verifyAuthToken(forged)).resolves.toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const first = await loadTokenModule();
    const token = await first.createAuthToken('user-42');

    process.env['JWT_SECRET'] = 'ein-ganz-anderes-geheimnis-0987654321';
    const second = await loadTokenModule();
    await expect(second.verifyAuthToken(token)).resolves.toBeNull();
  });

  it.each([
    ['empty', ''],
    ['not a jwt', 'einfach-nur-text'],
    ['old session id', 'a'.repeat(64)],
  ])('rejects a %s token', async (_label, value) => {
    const { verifyAuthToken } = await loadTokenModule();
    await expect(verifyAuthToken(value)).resolves.toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['too short', 'kurz'],
  ])('refuses to start when the secret is %s', async (_label, value) => {
    if (value === undefined) delete process.env['JWT_SECRET'];
    else process.env['JWT_SECRET'] = value;

    const { assertAuthConfigured } = await loadTokenModule();
    expect(() => assertAuthConfigured()).toThrow(/JWT_SECRET/);
  });
});
