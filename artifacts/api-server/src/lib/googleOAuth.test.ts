import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import type { Request } from 'express';

import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_OAUTH_TTL_MS,
  appendErrorParam,
  decodePendingSignIn,
  encodePendingSignIn,
  getGoogleCredentials,
  isGoogleAuthConfigured,
  readIdentity,
  resolveCallbackUrl,
  sanitizeReturnPath,
} from './googleOAuth';

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_BASE_URL'] as const;
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

// The pending-sign-in cookie is signed with the same secret as session tokens.
process.env['JWT_SECRET'] ??= 'test-geheimnis-mindestens-16-zeichen';

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function fakeRequest(headers: Record<string, string | string[]>): Request {
  return { headers, protocol: 'http' } as unknown as Request;
}

describe('getGoogleCredentials', () => {
  it('is not configured while either value is missing', () => {
    expect(isGoogleAuthConfigured()).toBe(false);

    process.env['GOOGLE_CLIENT_ID'] = 'id.apps.googleusercontent.com';
    expect(isGoogleAuthConfigured()).toBe(false);

    process.env['GOOGLE_CLIENT_SECRET'] = '   ';
    expect(isGoogleAuthConfigured()).toBe(false);
  });

  it('trims both values once they are set', () => {
    process.env['GOOGLE_CLIENT_ID'] = ' id.apps.googleusercontent.com ';
    process.env['GOOGLE_CLIENT_SECRET'] = ' geheim ';
    expect(getGoogleCredentials()).toEqual({
      clientId: 'id.apps.googleusercontent.com',
      clientSecret: 'geheim',
    });
  });
});

describe('resolveCallbackUrl', () => {
  it('prefers PUBLIC_BASE_URL over anything the request claims', () => {
    process.env['PUBLIC_BASE_URL'] = 'https://kraeuter-hexe.onrender.com/';
    const url = resolveCallbackUrl(fakeRequest({ host: 'boese.example' }));
    expect(url).toBe(`https://kraeuter-hexe.onrender.com${GOOGLE_CALLBACK_PATH}`);
  });

  it('falls back to the forwarded protocol and host', () => {
    const url = resolveCallbackUrl(
      fakeRequest({ 'x-forwarded-proto': 'https', host: 'meine-app.example' }),
    );
    expect(url).toBe(`https://meine-app.example${GOOGLE_CALLBACK_PATH}`);
  });

  it('uses only the first hop of a proxy chain', () => {
    const url = resolveCallbackUrl(
      fakeRequest({
        'x-forwarded-proto': 'https,http',
        'x-forwarded-host': 'aussen.example, innen.example',
      }),
    );
    expect(url).toBe(`https://aussen.example${GOOGLE_CALLBACK_PATH}`);
  });
});

describe('sanitizeReturnPath', () => {
  it('keeps same-origin paths', () => {
    expect(sanitizeReturnPath('/pflanzenscanner/')).toBe('/pflanzenscanner/');
    expect(sanitizeReturnPath('/archiv?filter=essbar')).toBe('/archiv?filter=essbar');
  });

  it('refuses anything that could leave the app', () => {
    for (const value of [
      'https://boese.example',
      '//boese.example',
      '/\\boese.example',
      '/pfad\\mit\\backslash',
      'pflanzen',
      '',
      undefined,
      42,
    ]) {
      expect(sanitizeReturnPath(value)).toBe('/');
    }
  });
});

describe('appendErrorParam', () => {
  it('adds the first query parameter', () => {
    expect(appendErrorParam('/', 'google-abgebrochen')).toBe('/?anmeldung=google-abgebrochen');
  });

  it('appends to an existing query string and keeps the hash last', () => {
    expect(appendErrorParam('/app?a=1#top', 'google-fehlgeschlagen')).toBe(
      '/app?a=1&anmeldung=google-fehlgeschlagen#top',
    );
  });
});

describe('pending sign-in cookie', () => {
  const pending = {
    state: 'a'.repeat(32),
    codeVerifier: 'b'.repeat(43),
    returnPath: '/pflanzenscanner/',
    callbackUrl: 'https://kraeuter-hexe.onrender.com/api/auth/google/callback',
    createdAt: 1_000_000,
  };

  it('round-trips', () => {
    expect(decodePendingSignIn(encodePendingSignIn(pending), pending.createdAt + 1)).toEqual(
      pending,
    );
  });

  it('refuses a stale cookie', () => {
    const encoded = encodePendingSignIn(pending);
    expect(
      decodePendingSignIn(encoded, pending.createdAt + GOOGLE_OAUTH_TTL_MS + 1),
    ).toBeNull();
  });

  it('refuses garbage, an unsigned cookie and a too-short state', () => {
    expect(decodePendingSignIn('nicht-base64!', Date.now())).toBeNull();
    expect(decodePendingSignIn(undefined, Date.now())).toBeNull();
    // Correctly shaped payload, but nobody signed it.
    expect(
      decodePendingSignIn(
        `${Buffer.from(JSON.stringify(pending)).toString('base64url')}.unterschrift`,
        pending.createdAt + 1,
      ),
    ).toBeNull();
    expect(
      decodePendingSignIn(encodePendingSignIn({ ...pending, state: 'kurz' }), pending.createdAt + 1),
    ).toBeNull();
  });

  it('refuses a payload that was changed after signing', () => {
    const encoded = encodePendingSignIn(pending);
    const signature = encoded.slice(encoded.lastIndexOf('.'));
    const tampered =
      Buffer.from(JSON.stringify({ ...pending, state: 'c'.repeat(32) })).toString('base64url') +
      signature;
    expect(decodePendingSignIn(tampered, pending.createdAt + 1)).toBeNull();
  });

  it('re-sanitises the return path on the way out', () => {
    const encoded = encodePendingSignIn({ ...pending, returnPath: 'https://boese.example' });
    expect(decodePendingSignIn(encoded, pending.createdAt + 1)?.returnPath).toBe('/');
  });
});

describe('readIdentity', () => {
  it('accepts a verified address and normalises it', () => {
    expect(
      readIdentity({
        email: ' Oma@Beispiel.DE ',
        email_verified: true,
        given_name: 'Oma',
        family_name: 'Hexe',
        picture: 'https://lh3.example/foto.jpg',
      }),
    ).toEqual({
      email: 'oma@beispiel.de',
      firstName: 'Oma',
      lastName: 'Hexe',
      profileImageUrl: 'https://lh3.example/foto.jpg',
    });
  });

  it('refuses an unverified or missing address', () => {
    expect(readIdentity({ email: 'oma@beispiel.de', email_verified: false })).toBeNull();
    expect(readIdentity({ email: 'oma@beispiel.de' })).toBeNull();
    expect(readIdentity({ email_verified: true })).toBeNull();
  });

  it('leaves optional profile fields null instead of empty strings', () => {
    expect(
      readIdentity({ email: 'oma@beispiel.de', email_verified: true, given_name: '  ' }),
    ).toEqual({
      email: 'oma@beispiel.de',
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    });
  });
});
