/**
 * One-time migration: downloads legacy server-stored images (base64 in DB)
 * into the local IndexedDB, then asks the server to clear the DB column.
 *
 * Called once per device/browser after login. Tracked via a localStorage flag
 * so it never re-runs once all images are migrated. If some downloads fail the
 * flag is NOT set and the migration retries the remaining items next login.
 *
 * Side images (two-photo mushroom scans) are stored under the naming
 * convention `${localImageId}-side`, matching the lookup in plant-detail.tsx.
 */

import { putImage, getImage } from "@/lib/image-store";
import { downscaleDataUrl } from "@/lib/image";

// Bump this key to force a re-run after a schema change.
export const MIGRATION_FLAG = "legacy-image-migration-done-v1";

const BASE = () => (import.meta.env.BASE_URL as string).replace(/\/$/, "");

// ── Types returned by GET /migration/legacy-images ───────────────────────────

interface LegacyPlant {
  id: number;
  localImageId: string | null;
  hasSideImage: boolean;
}

interface LegacyInsect {
  id: number;
  localImageId: string | null;
}

interface LegacyList {
  plants: LegacyPlant[];
  insects: LegacyInsect[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE()}${path}`, { credentials: "include", ...init });
}

/**
 * Fetches an image from the server and converts it to a compressed data URL.
 * Returns null when the request fails or the blob can't be decoded.
 */
async function downloadImage(url: string): Promise<string | null> {
  try {
    const res = await apiFetch(url);
    if (!res.ok) return null;

    const blob = await res.blob();

    // Read as data URL then downscale (same pipeline as scan capture).
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(blob);
    });

    return await downscaleDataUrl(raw);
  } catch {
    return null;
  }
}

// ── Main migration function ───────────────────────────────────────────────────

/**
 * Runs the legacy-image migration for the given user.
 *
 * - isOwner: if true, calls assign-anonymous before fetching the list so
 *   orphaned scans are claimed by the admin before being downloaded.
 *
 * Returns true when the migration completed without any failures and the caller
 * should set the localStorage flag.
 */
export async function runLegacyImageMigration(isOwner: boolean): Promise<boolean> {
  // Admin: adopt all anonymous scans first so they appear in the list.
  if (isOwner) {
    try {
      await apiFetch("/api/migration/assign-anonymous", { method: "POST" });
    } catch {
      // Non-fatal: we can still migrate what we can see; retry next login.
    }
  }

  // Fetch the list of entries with server-stored image bytes for this user.
  let list: LegacyList;
  try {
    const res = await apiFetch("/api/migration/legacy-images");
    if (!res.ok) return false;
    list = (await res.json()) as LegacyList;
  } catch {
    return false;
  }

  const { plants, insects } = list;
  if (plants.length === 0 && insects.length === 0) {
    // Nothing left to migrate – mark done.
    return true;
  }

  let failCount = 0;

  // ── Plants ──────────────────────────────────────────────────────────────────
  for (const plant of plants) {
    try {
      // Reuse the existing localImageId or generate a new one.
      const mainId = plant.localImageId ?? crypto.randomUUID();

      // Only download when we don't already have this image locally.
      const alreadyStored = plant.localImageId
        ? await getImage(plant.localImageId)
        : null;

      if (!alreadyStored) {
        const dataUrl = await downloadImage(`/api/plants/${plant.id}/image`);
        if (!dataUrl) {
          failCount++;
          continue; // Leave image_data on server; retry next login.
        }
        await putImage(mainId, dataUrl);
      }

      // Side image (two-photo mushroom scan) stored under `{mainId}-side`.
      // IMPORTANT: if the side download fails we must NOT proceed to DELETE,
      // because the server's DELETE endpoint clears both image_data AND
      // image_data_side. Deleting before both images are local would
      // permanently lose the side-image bytes. Retry on next login instead.
      if (plant.hasSideImage) {
        const sideId = `${mainId}-side`;
        const alreadySide = await getImage(sideId);
        if (!alreadySide) {
          const sideUrl = await downloadImage(`/api/plants/${plant.id}/image/side`);
          if (!sideUrl) {
            // Side still on server — leave everything intact, retry next login.
            failCount++;
            continue;
          }
          await putImage(sideId, sideUrl);
        }
      }

      // Ask the server to clear image_data now that we have the bytes locally.
      // Pass localImageId only when we generated a new one so the server
      // persists the pointer. Skip if the row already had one.
      const deleteRes = await apiFetch(
        `/api/migration/legacy-image/plant/${plant.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            plant.localImageId ? {} : { localImageId: mainId },
          ),
        },
      );
      if (!deleteRes.ok) {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }

  // ── Insects ─────────────────────────────────────────────────────────────────
  for (const insect of insects) {
    try {
      const mainId = insect.localImageId ?? crypto.randomUUID();

      const alreadyStored = insect.localImageId
        ? await getImage(insect.localImageId)
        : null;

      if (!alreadyStored) {
        const dataUrl = await downloadImage(`/api/insects/${insect.id}/image`);
        if (!dataUrl) {
          failCount++;
          continue;
        }
        await putImage(mainId, dataUrl);
      }

      const deleteRes = await apiFetch(
        `/api/migration/legacy-image/insect/${insect.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            insect.localImageId ? {} : { localImageId: mainId },
          ),
        },
      );
      if (!deleteRes.ok) {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }

  return failCount === 0;
}
