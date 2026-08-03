import { describe, expect, it } from 'vitest';

import {
  buildGoogleSignInUrl,
  describeSignInError,
  readSignInError,
  stripSignInParam,
} from './google-sign-in';

describe('describeSignInError', () => {
  it('has German wording for the codes the server sends', () => {
    expect(describeSignInError('google-abgebrochen')).toMatch(/abgebrochen/i);
    expect(describeSignInError('google-konto-unbekannt')).toMatch(/Einladungscode/i);
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(describeSignInError('irgendwas-neues')).toMatch(/nicht geklappt/i);
  });

  it('is silent when there is no code', () => {
    expect(describeSignInError(null)).toBeNull();
    expect(describeSignInError('')).toBeNull();
    expect(describeSignInError(undefined)).toBeNull();
  });
});

describe('buildGoogleSignInUrl', () => {
  it('passes the current path along, encoded', () => {
    expect(buildGoogleSignInUrl('/pflanzenscanner/')).toBe(
      '/api/auth/google?redirect=%2Fpflanzenscanner%2F',
    );
  });

  it('defaults to the root for an empty path', () => {
    expect(buildGoogleSignInUrl('')).toBe('/api/auth/google?redirect=%2F');
  });
});

describe('stripSignInParam', () => {
  it('removes only the sign-in parameter', () => {
    expect(stripSignInParam('?anmeldung=google-abgebrochen')).toBe('');
    expect(stripSignInParam('?filter=essbar&anmeldung=google-abgebrochen')).toBe(
      '?filter=essbar',
    );
  });

  it('leaves an unrelated query string alone', () => {
    expect(stripSignInParam('?filter=essbar')).toBe('?filter=essbar');
    expect(stripSignInParam('')).toBe('');
  });
});

describe('readSignInError', () => {
  it('finds the code', () => {
    expect(readSignInError('?anmeldung=google-abgelaufen')).toBe('google-abgelaufen');
    expect(readSignInError('?filter=essbar')).toBeNull();
  });
});
