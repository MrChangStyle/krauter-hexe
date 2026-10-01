/**
 * One-off: shrink photos that were stored on Cloudinary at full size.
 *
 * Measured on 2026-09-29: ~193 MB for ~135 photos, about 1.4 MB each, because
 * the migration from the old bucket uploaded originals. New uploads are now
 * limited by an incoming transformation (1280 px, quality auto), so running
 * this once brings the old ones in line.
 *
 * For every plant/insect photo on Cloudinary that is larger than the
 * threshold, it
 *   1. downloads the photo and ALWAYS writes a local backup copy first,
 *   2. uploads it again (the upload applies the size limit),
 *   3. points the database row at the new URL,
 *   4. deletes the old file on Cloudinary.
 * A failure in any step leaves the row on its old, still-working URL.
 *
 * Usage (needs NEON_DATABASE_URL / DATABASE_URL and CLOUDINARY_URL):
 *   pnpm --filter @workspace/api-server run recompress:images -- --dry-run
 *   pnpm --filter @workspace/api-server run recompress:images -- --limit 5
 *   pnpm --filter @workspace/api-server run recompress:images
 * Options: --dry-run (only report), --limit N, --min-kb N (default 400),
 *          --out <dir> (backup folder, default <repo>/migration/recompress-backup)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { db, insectsTable, plantsTable } from '@workspace/db';
import { eq, like, or } from 'drizzle-orm';

import { cloudinaryPublicId, deleteImageByUrl, uploadImageBuffer } from '../src/lib/imageStorage';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
function argValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
const limit = argValue('--limit') ? Number(argValue('--limit')) : Infinity;
const minBytes = (argValue('--min-kb') ? Number(argValue('--min-kb')) : 400) * 1024;
if (Number.isNaN(limit) || limit <= 0 || Number.isNaN(minBytes)) {
  console.error('❌  --limit and --min-kb must be positive numbers');
  process.exit(1);
}
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const outDir = argValue('--out')
  ? path.resolve(argValue('--out')!)
  : path.join(REPO_ROOT, 'migration/recompress-backup');

type Job = {
  table: 'plants' | 'insects';
  id: number;
  column: 'imageUrl' | 'imageUrlSide';
  url: string;
};

async function collectJobs(): Promise<Job[]> {
  const cdn = 'https://res.cloudinary.com/%';
  const plants = await db
    .select({ id: plantsTable.id, imageUrl: plantsTable.imageUrl, imageUrlSide: plantsTable.imageUrlSide })
    .from(plantsTable)
    .where(or(like(plantsTable.imageUrl, cdn), like(plantsTable.imageUrlSide, cdn)));
  const insects = await db
    .select({ id: insectsTable.id, imageUrl: insectsTable.imageUrl })
    .from(insectsTable)
    .where(like(insectsTable.imageUrl, cdn));

  const jobs: Job[] = [];
  for (const p of plants) {
    if (cloudinaryPublicId(p.imageUrl)) jobs.push({ table: 'plants', id: p.id, column: 'imageUrl', url: p.imageUrl! });
    if (cloudinaryPublicId(p.imageUrlSide))
      jobs.push({ table: 'plants', id: p.id, column: 'imageUrlSide', url: p.imageUrlSide! });
  }
  for (const i of insects) {
    if (cloudinaryPublicId(i.imageUrl)) jobs.push({ table: 'insects', id: i.id, column: 'imageUrl', url: i.imageUrl! });
  }
  return jobs;
}

async function updateRow(job: Job, newUrl: string): Promise<void> {
  if (job.table === 'insects') {
    await db.update(insectsTable).set({ imageUrl: newUrl }).where(eq(insectsTable.id, job.id));
  } else if (job.column === 'imageUrlSide') {
    await db.update(plantsTable).set({ imageUrlSide: newUrl }).where(eq(plantsTable.id, job.id));
  } else {
    await db.update(plantsTable).set({ imageUrl: newUrl }).where(eq(plantsTable.id, job.id));
  }
}

async function main(): Promise<void> {
  const jobs = await collectJobs();
  console.log(`🔎  ${jobs.length} Cloudinary-Fotos in der Datenbank gefunden.`);
  if (!dryRun) await mkdir(outDir, { recursive: true });

  let checked = 0;
  let shrunk = 0;
  let savedBytes = 0;
  let failed = 0;

  for (const job of jobs) {
    if (shrunk >= limit) break;
    checked += 1;
    const label = `${job.table}#${job.id} ${job.column}`;
    try {
      const res = await fetch(job.url);
      if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < minBytes) continue;

      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (dryRun) {
        console.log(`•  ${label}: ${(buffer.length / 1024).toFixed(0)} KB würde verkleinert`);
        shrunk += 1;
        savedBytes += buffer.length;
        continue;
      }

      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      await writeFile(path.join(outDir, `${job.table}-${job.id}-${job.column}.${ext}`), buffer);

      const newUrl = await uploadImageBuffer(buffer, contentType);
      const after = await fetch(newUrl);
      const newSize = after.ok ? Number(after.headers.get('content-length') ?? 0) : 0;

      await updateRow(job, newUrl);
      const deleted = await deleteImageByUrl(job.url);
      shrunk += 1;
      if (newSize > 0) savedBytes += buffer.length - newSize;
      console.log(
        `✅  ${label}: ${(buffer.length / 1024).toFixed(0)} KB → ${newSize ? (newSize / 1024).toFixed(0) + ' KB' : '?'}` +
          (deleted ? '' : ' (altes Foto konnte nicht gelöscht werden)'),
      );
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(`❌  ${label}: ${message}`);
    }
  }

  console.log(
    `\n${dryRun ? 'Probelauf' : 'Fertig'}: ${checked} geprüft, ${shrunk} ${dryRun ? 'zu groß' : 'verkleinert'}, ` +
      `${failed} Fehler, ${dryRun ? 'betroffen' : 'gespart'} ca. ${(savedBytes / 1024 / 1024).toFixed(1)} MB.`,
  );
  if (!dryRun) console.log(`Sicherungskopien: ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
