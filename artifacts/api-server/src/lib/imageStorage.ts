/**
 * Image storage on Cloudinary.
 *
 * Replaces the previous Replit Object Storage integration, which authenticated
 * through a sidecar process on localhost and therefore only worked while the
 * app was hosted on Replit. Cloudinary is reached over plain HTTPS with a
 * credential from the environment, so the same code runs anywhere.
 *
 * What ends up in the database is the full `https://res.cloudinary.com/...`
 * URL, not a path that needs a serving route on our side. Images are delivered
 * by Cloudinary's CDN directly, which also means our own server is no longer in
 * the path of every photo view.
 *
 * The SDK is imported lazily: it parses CLOUDINARY_URL at import time and
 * throws if the value looks wrong, which would otherwise take the whole server
 * down at boot over a mistyped credential. Loading it on first use keeps that
 * failure contained to image uploads, which are already non-fatal.
 */

/** Groups all uploads of this app inside the Cloudinary account. */
const FOLDER = process.env['CLOUDINARY_FOLDER'] ?? 'kraeuterhexe';

/** Cap so a slow upload never blocks a scan request indefinitely. */
const DEFAULT_TIMEOUT_MS = 15_000;

const DATA_URL_RE = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/is;

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Canonical `cloudinary://key:secret@cloud` form. */
  url: string;
}

/**
 * Accepts what people actually paste. The Cloudinary dashboard shows the
 * credential as a `CLOUDINARY_URL=cloudinary://...` line, often next to further
 * `KEY=value` pairs, and pasting that whole block into one environment variable
 * is the common mistake. Rather than failing with an unhelpful protocol error,
 * the first `cloudinary://` token in the value wins; assignment prefixes,
 * quotes and trailing extras are ignored.
 */
export function parseCloudinaryUrl(
  raw: string | undefined,
): CloudinaryCredentials | null {
  if (!raw) return null;

  const match = /cloudinary:\/\/[^\s"']+/i.exec(raw);
  if (!match) return null;
  // A trailing quote/semicolon from a copied shell line is not part of the URL.
  const value = match[0].replace(/[;,]+$/, '');

  if (!value.startsWith('cloudinary://')) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const cloudName = parsed.hostname;
  const apiKey = decodeURIComponent(parsed.username);
  const apiSecret = decodeURIComponent(parsed.password);
  if (!cloudName || !apiKey || !apiSecret) return null;

  return { cloudName, apiKey, apiSecret, url: value };
}

/**
 * True when a usable credential is present. Callers use this to skip the
 * upload entirely instead of failing a scan: photos also live in the device's
 * IndexedDB, so a missing credential degrades to "photo only on this device"
 * rather than a lost scan.
 */
export function isImageStorageConfigured(): boolean {
  return parseCloudinaryUrl(process.env['CLOUDINARY_URL']) !== null;
}

type CloudinaryApi = typeof import('cloudinary')['v2'];

let cloudinaryPromise: Promise<CloudinaryApi> | null = null;

async function getCloudinary(): Promise<CloudinaryApi> {
  if (cloudinaryPromise) return cloudinaryPromise;

  cloudinaryPromise = (async () => {
    const credentials = parseCloudinaryUrl(process.env['CLOUDINARY_URL']);
    if (!credentials) {
      throw new Error(
        'CLOUDINARY_URL is missing or malformed - expected ' +
          'cloudinary://<api_key>:<api_secret>@<cloud_name> (copy the value ' +
          'after the "=" from the Cloudinary dashboard). Image uploads are ' +
          'disabled until it is set.',
      );
    }

    // Hand the SDK the cleaned value as well: it re-reads the environment
    // variable itself while loading and refuses to start on a malformed one.
    process.env['CLOUDINARY_URL'] = credentials.url;

    const { v2 } = await import('cloudinary');
    v2.config({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      secure: true,
    });
    return v2;
  })();

  try {
    return await cloudinaryPromise;
  } catch (err) {
    // Don't cache the failure: the credential may be fixed without a restart.
    cloudinaryPromise = null;
    throw err;
  }
}

async function uploadWithTimeout(
  payload: string,
  timeoutMs: number,
): Promise<string> {
  const cloudinary = await getCloudinary();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const upload = cloudinary.uploader.upload(payload, {
      folder: FOLDER,
      resource_type: 'image',
      // Cloudinary derives a unique public_id itself; overwriting is never
      // wanted here because every scan is a new photo.
      unique_filename: true,
      timeout: timeoutMs,
    });

    const result = await Promise.race([
      upload,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Cloudinary upload timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);

    if (!result.secure_url) {
      throw new Error('Cloudinary upload returned no secure_url');
    }
    return result.secure_url;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Uploads a base64 data URL and returns the public https URL to store in the
 * database. Throws when the credential is missing, the input is not an image
 * data URL, or the upload fails - callers decide whether that is fatal.
 */
export async function uploadImage(
  dataUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  if (!DATA_URL_RE.test(dataUrl)) {
    throw new Error('Invalid data URL - expected data:image/<type>;base64,<payload>');
  }
  return uploadWithTimeout(dataUrl, timeoutMs);
}

/**
 * Uploads raw bytes (used by the one-off migration of images that still live
 * in the old Replit bucket).
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  contentType: string = 'image/jpeg',
  timeoutMs: number = 60_000,
): Promise<string> {
  const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg';
  return uploadWithTimeout(
    `data:${mime};base64,${buffer.toString('base64')}`,
    timeoutMs,
  );
}

/**
 * True for values that can be rendered directly by the browser. Rows written
 * before the Cloudinary switch hold a bucket path like `/objects/uploads/<id>`
 * instead, which is only resolvable while the old Replit storage is reachable.
 */
export function isServableImageUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}
