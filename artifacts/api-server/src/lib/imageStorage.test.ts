/**
 * Tests for the Cloudinary credential parsing. The upload itself is not
 * exercised here (it would need a live account); what matters is that a
 * credential pasted in any of the usual shapes is accepted, and that an
 * unusable one is reported as "not configured" instead of crashing.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { isImageStorageConfigured, parseCloudinaryUrl } from './imageStorage';

const ORIGINAL = process.env['CLOUDINARY_URL'];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['CLOUDINARY_URL'];
  else process.env['CLOUDINARY_URL'] = ORIGINAL;
});

describe('parseCloudinaryUrl', () => {
  it('parses the canonical form', () => {
    expect(parseCloudinaryUrl('cloudinary://123456789:abcSECRET@demo-cloud')).toEqual({
      cloudName: 'demo-cloud',
      apiKey: '123456789',
      apiSecret: 'abcSECRET',
      url: 'cloudinary://123456789:abcSECRET@demo-cloud',
    });
  });

  it('tolerates the whole dashboard line being pasted', () => {
    const parsed = parseCloudinaryUrl(
      'CLOUDINARY_URL=cloudinary://123456789:abcSECRET@demo-cloud',
    );
    expect(parsed?.cloudName).toBe('demo-cloud');
    expect(parsed?.url).toBe('cloudinary://123456789:abcSECRET@demo-cloud');
  });

  it('tolerates export prefix, quotes and surrounding whitespace', () => {
    const parsed = parseCloudinaryUrl(
      '  export CLOUDINARY_URL="cloudinary://123456789:abcSECRET@demo-cloud"  ',
    );
    expect(parsed?.apiKey).toBe('123456789');
    expect(parsed?.apiSecret).toBe('abcSECRET');
  });

  it('decodes percent-escaped credentials', () => {
    const parsed = parseCloudinaryUrl(
      'cloudinary://key:se%40cret%2Fvalue@demo-cloud',
    );
    expect(parsed?.apiSecret).toBe('se@cret/value');
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['wrong protocol', 'https://res.cloudinary.com/demo'],
    ['missing secret', 'cloudinary://onlykey@demo-cloud'],
    ['missing cloud name', 'cloudinary://key:secret@'],
    ['placeholder text', 'your-cloudinary-url-here'],
  ])('rejects %s', (_label, value) => {
    expect(parseCloudinaryUrl(value as string | undefined)).toBeNull();
  });
});

describe('isImageStorageConfigured', () => {
  it('is false without a credential', () => {
    delete process.env['CLOUDINARY_URL'];
    expect(isImageStorageConfigured()).toBe(false);
  });

  it('is false for an unusable credential', () => {
    process.env['CLOUDINARY_URL'] = 'not-a-cloudinary-url';
    expect(isImageStorageConfigured()).toBe(false);
  });

  it('is true for a usable credential', () => {
    process.env['CLOUDINARY_URL'] = 'cloudinary://key:secret@cloud';
    expect(isImageStorageConfigured()).toBe(true);
  });
});
