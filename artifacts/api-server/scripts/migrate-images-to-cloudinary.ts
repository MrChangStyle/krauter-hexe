/**
 * One-off migration: move the photos that still live in Replit Object Storage
 * over to Cloudinary.
 *
 * Rows written before the storage switch hold an internal path such as
 * `/objects/uploads/<uuid>` in image_url. That path can only be resolved from
 * inside a Replit container (the bucket is reached through a sidecar process on
 * localhost), so it stops working the moment the app is hosted elsewhere. This
 * script downloads every such photo, keeps a copy on disk, uploads it to
 * Cloudinary and rewrites the database row to the public https URL.
 *
 *   MUST be run on Replit – the download half needs the sidecar.
 *
 * Usage (from the repository root):
 *   node artifacts/api-server/scripts/migrate-images-to-cloudinary.ts
 *   node artifacts/api-server/scripts/migrate-images-to-cloudinary.ts --download-only
 *   node artifacts/api-server/scripts/migrate-images-to-cloudinary.ts --limit 5
 *
 * Flags:
 *   --download-only   Only save the files locally; the database is not touched.
 *                     Use this to secure a backup before anything else.
 *   --limit N         Process at most N images (a dry run on a few rows).
 *   --out <dir>       Where to keep the local copies.
 *                     Default: migration/image-backup
 *
 * Safe to run repeatedly: rows that already point at an https URL are skipped,
 * and a photo that fails leaves its row untouched for the next run.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Storage } from '@google-cloud/storage';
import { db, insectsTable, plantsTable } from '@workspace/db';
import { eq, like, or } from 'drizzle-orm';

import { uploadImageBuffer } from '../src/lib/imageStorage';

// ── Arguments ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const downloadOnly = argv.includes('--download-only');

function argValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const limitRaw = argValue('--limit');
const limit = limitRaw ? Number(limitRaw) : Infinity;
if (Number.isNaN(limit) || limit <= 0) {
  console.error('❌  --limit must be a positive number');
  process.exit(1);
}

// Default to <repo>/migration/image-backup regardless of the working
// directory the script was started from.
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const outDir = argValue('--out')
  ? path.resolve(argValue('--out')!)
  : path.join(REPO_ROOT, 'migration/image-backup');

// ── Replit Object Storage (read side) ─────────────────────────────────────────

const SIDECAR = 'http://127.0.0.1:1106';

const gcs = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${SIDECAR}/token`,
    type: 'external_account',
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
} as ConstructorParameters<typeof Storage>[0]);

/**
 * Maps the stored `/objects/<rest>` path onto the actual bucket object, the
 * same way the old serving route did.
 */
function resolveObject(storedPath: string) {
  const privateDir = process.env['PRIVATE_OBJECT_DIR'];
  if (!privateDir) {
    throw new Error(
      'PRIVATE_OBJECT_DIR is not set – run this script inside the Replit workspace.',
    );
  }
  const entityId = storedPath.replace(/^\/objects\//, '');
  const full = `${privateDir.replace(/\/$/, '')}/${entityId}`;
  const parts = full.startsWith('/') ? full.split('/') : `/${full}`.split('/');
  const bucketName = parts[1];
  const objectName = parts.slice(2).join('/');
  return gcs.bucket(bucketName).file(objectName);
}

async function download(
  storedPath: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const file = resolveObject(storedPath);
  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();
  return {
    buffer,
    contentType:
      typeof metadata.contentType === 'string' && metadata.contentType.startsWith('image/')
        ? metadata.contentType
        : 'image/jpeg',
  };
}

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

// ── Migration ─────────────────────────────────────────────────────────────────

const LEGACY_PREFIX = '/objects/%';

type Job = {
  label: string;
  storedPath: string;
  /** Writes the new URL back to the row this photo belongs to. */
  persist: (url: string) => Promise<void>;
};

/** Cloudinary rejects with a plain object, which stringifies to "[object Object]". */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') {
      const status = (err as { http_code?: unknown }).http_code;
      return status ? `${message} (HTTP ${String(status)})` : message;
    }
    return JSON.stringify(err);
  }
  return String(err);
}

function isLegacyPath(value: string | null): value is string {
  return typeof value === 'string' && value.startsWith('/objects/');
}

async function collectJobs(): Promise<Job[]> {
  const jobs: Job[] = [];

  const plants = await db
    .select({
      id: plantsTable.id,
      imageUrl: plantsTable.imageUrl,
      imageUrlSide: plantsTable.imageUrlSide,
    })
    .from(plantsTable)
    .where(
      or(
        like(plantsTable.imageUrl, LEGACY_PREFIX),
        like(plantsTable.imageUrlSide, LEGACY_PREFIX),
      ),
    );

  for (const row of plants) {
    if (isLegacyPath(row.imageUrl)) {
      jobs.push({
        label: `plant ${row.id} (Hauptfoto)`,
        storedPath: row.imageUrl,
        persist: async (url) => {
          await db
            .update(plantsTable)
            .set({ imageUrl: url })
            .where(eq(plantsTable.id, row.id));
        },
      });
    }
    if (isLegacyPath(row.imageUrlSide)) {
      jobs.push({
        label: `plant ${row.id} (Seitenfoto)`,
        storedPath: row.imageUrlSide,
        persist: async (url) => {
          await db
            .update(plantsTable)
            .set({ imageUrlSide: url })
            .where(eq(plantsTable.id, row.id));
        },
      });
    }
  }

  const insects = await db
    .select({ id: insectsTable.id, imageUrl: insectsTable.imageUrl })
    .from(insectsTable)
    .where(like(insectsTable.imageUrl, LEGACY_PREFIX));

  for (const row of insects) {
    if (isLegacyPath(row.imageUrl)) {
      jobs.push({
        label: `insect ${row.id}`,
        storedPath: row.imageUrl,
        persist: async (url) => {
          await db
            .update(insectsTable)
            .set({ imageUrl: url })
            .where(eq(insectsTable.id, row.id));
        },
      });
    }
  }

  return jobs;
}

async function main() {
  if (!downloadOnly && !process.env['CLOUDINARY_URL']) {
    console.error('❌  CLOUDINARY_URL is not set (needed for the upload half).');
    process.exit(1);
  }

  const allJobs = await collectJobs();
  const jobs = allJobs.slice(0, Number.isFinite(limit) ? limit : undefined);

  console.log(
    `\n📦  ${allJobs.length} Bild(er) liegen noch im alten Replit-Speicher` +
      (jobs.length !== allJobs.length ? ` – bearbeite ${jobs.length}` : '') +
      (downloadOnly ? ' (nur Download, keine Datenbank-Änderung)' : ''),
  );

  if (jobs.length === 0) {
    console.log('✅  Nichts zu tun.\n');
    return;
  }

  await mkdir(outDir, { recursive: true });

  let migrated = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const { buffer, contentType } = await download(job.storedPath);

      // Always keep a local copy first: once the row is rewritten, the old
      // path is the only way back to the original file.
      const fileName = `${job.storedPath.split('/').pop()}.${extensionFor(contentType)}`;
      await writeFile(path.join(outDir, fileName), buffer);

      if (downloadOnly) {
        console.log(`  💾  ${job.label} → ${fileName} (${Math.round(buffer.length / 1024)} kB)`);
        migrated++;
        continue;
      }

      const url = await uploadImageBuffer(buffer, contentType);
      await job.persist(url);
      console.log(`  ✅  ${job.label} → ${url}`);
      migrated++;
    } catch (err) {
      failed++;
      console.error(`  ❌  ${job.label}: ${describeError(err)}`);
    }
  }

  console.log(
    `\n${failed === 0 ? '✅' : '⚠️ '}  fertig: ${migrated} erfolgreich, ${failed} fehlgeschlagen.` +
      `\n    Lokale Kopien: ${outDir}\n`,
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
