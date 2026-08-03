/**
 * Migration routes: one-time transfer of legacy server-stored images to each
 * user's local IndexedDB. After the client confirms a successful download the
 * image bytes are deleted from the database column to free storage.
 *
 * Three endpoints:
 *   GET  /migration/legacy-images          – list entries with image_data
 *   POST /migration/assign-anonymous       – admin: adopt orphaned scans
 *   DELETE /migration/legacy-image/:t/:id  – clear image_data after download
 */

import { Router, type IRouter } from "express";
import { eq, isNull, and, isNotNull, sql } from "drizzle-orm";
import { db, plantsTable, insectsTable } from "@workspace/db";
import { requireApproved, requireOwner } from "../middlewares/requireApproved";

const router: IRouter = Router();

// ── GET /migration/legacy-images ─────────────────────────────────────────────
// Returns every plant and insect that still has server-stored image bytes
// (image_data IS NOT NULL) and belongs to the authenticated user.

router.get(
  "/migration/legacy-images",
  requireApproved,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;

    const [plants, insects] = await Promise.all([
      db
        .select({
          id: plantsTable.id,
          localImageId: plantsTable.localImageId,
          hasSideImage: sql<boolean>`(${plantsTable.hasSideImage} is true or ${plantsTable.imageDataSide} is not null)`,
        })
        .from(plantsTable)
        .where(
          and(
            eq(plantsTable.scannedByUserId, userId),
            isNotNull(plantsTable.imageData),
          ),
        ),
      db
        .select({
          id: insectsTable.id,
          localImageId: insectsTable.localImageId,
        })
        .from(insectsTable)
        .where(
          and(
            eq(insectsTable.scannedByUserId, userId),
            isNotNull(insectsTable.imageData),
          ),
        ),
    ]);

    res.json({
      plants: plants.map((p) => ({
        id: p.id,
        localImageId: p.localImageId ?? null,
        hasSideImage: Boolean(p.hasSideImage),
      })),
      insects: insects.map((i) => ({
        id: i.id,
        localImageId: i.localImageId ?? null,
      })),
    });
  },
);

// ── POST /migration/assign-anonymous ─────────────────────────────────────────
// Admin only. Assigns all scans without an owner (scanned_by_user_id IS NULL)
// to the admin account so they appear in the admin's legacy-image list.
// Idempotent — safe to call multiple times.

router.post(
  "/migration/assign-anonymous",
  requireOwner,
  async (req, res): Promise<void> => {
    const adminId = req.user!.id;

    await Promise.all([
      db
        .update(plantsTable)
        .set({ scannedByUserId: adminId })
        .where(isNull(plantsTable.scannedByUserId)),
      db
        .update(insectsTable)
        .set({ scannedByUserId: adminId })
        .where(isNull(insectsTable.scannedByUserId)),
    ]);

    res.json({ ok: true });
  },
);

// ── DELETE /migration/legacy-image/:type/:id ──────────────────────────────────
// Called by the client after successfully storing the image in IndexedDB.
// Clears image_data (and image_data_side for plants) from the DB row and
// optionally writes local_image_id when the row didn't have one yet.
// Only the scan owner or the admin may call this endpoint.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.delete(
  "/migration/legacy-image/:type/:id",
  requireApproved,
  async (req, res): Promise<void> => {
    const { type, id: idStr } = req.params as Record<string, string>;

    if (type !== "plant" && type !== "insect") {
      res.status(400).json({ error: "type muss 'plant' oder 'insect' sein." });
      return;
    }

    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Ungültige ID." });
      return;
    }

    const rawBody = req.body as Record<string, unknown> | undefined;
    const localImageId =
      typeof rawBody?.localImageId === "string" &&
      UUID_RE.test(rawBody.localImageId)
        ? rawBody.localImageId
        : undefined;

    if (
      rawBody?.localImageId !== undefined &&
      rawBody.localImageId !== null &&
      localImageId === undefined
    ) {
      res.status(400).json({ error: "localImageId muss eine gültige UUID sein." });
      return;
    }

    const userId = req.user!.id;
    const isAdmin = req.user!.isOwner;

    if (type === "plant") {
      const [row] = await db
        .select({ scannedByUserId: plantsTable.scannedByUserId })
        .from(plantsTable)
        .where(eq(plantsTable.id, id));

      if (!row) {
        res.status(404).json({ error: "Pflanze nicht gefunden." });
        return;
      }
      if (row.scannedByUserId !== userId && !isAdmin) {
        res.status(403).json({ error: "Kein Zugriff." });
        return;
      }

      // Read current row to decide whether to set hasSideImage. Legacy mushroom
      // rows used imageDataSide IS NOT NULL as the "verified two-photo scan"
      // proof. Clearing imageDataSide without setting the boolean flag would
      // re-trigger the unverified-mushroom safety gate and show a confirmed
      // edible mushroom as poisonous after migration.
      const [current] = await db
        .select({ imageDataSide: plantsTable.imageDataSide })
        .from(plantsTable)
        .where(eq(plantsTable.id, id));

      const hadSideImage = current?.imageDataSide != null;

      await db
        .update(plantsTable)
        .set({
          imageData: null,
          imageDataSide: null,
          // Preserve the two-photo proof: if the row used imageDataSide as its
          // marker, promote it to the boolean flag before clearing the bytes.
          ...(hadSideImage ? { hasSideImage: true } : {}),
          // Persist the new localImageId only when provided. We never overwrite
          // an existing value with null here because the row may already have
          // one from an earlier local-first scan.
          ...(localImageId ? { localImageId } : {}),
        })
        .where(eq(plantsTable.id, id));
    } else {
      const [row] = await db
        .select({ scannedByUserId: insectsTable.scannedByUserId })
        .from(insectsTable)
        .where(eq(insectsTable.id, id));

      if (!row) {
        res.status(404).json({ error: "Insekt nicht gefunden." });
        return;
      }
      if (row.scannedByUserId !== userId && !isAdmin) {
        res.status(403).json({ error: "Kein Zugriff." });
        return;
      }

      await db
        .update(insectsTable)
        .set({
          imageData: null,
          ...(localImageId ? { localImageId } : {}),
        })
        .where(eq(insectsTable.id, id));
    }

    res.json({ ok: true });
  },
);

export default router;
