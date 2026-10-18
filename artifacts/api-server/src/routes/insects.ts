import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { eq, desc, sql, getTableColumns } from "drizzle-orm";
import { db, insectsTable, insectScansTable, usersTable } from "@workspace/db";
import {
  ScanInsectBody,
  ScanInsectResponse,
  ListInsectsResponse,
  ListMyInsectsResponse,
  GetInsectResponse,
  GetInsectParams,
  GetInsectImageParams,
  SetInsectImageLockParams,
  SetInsectImageLockBody,
  SetInsectImageLockResponse,
} from "@workspace/api-zod";
import {
  identifyInsect,
  parseDataUrl,
  UNKNOWN_SCIENTIFIC_NAME,
} from "../lib/insectIdentification";
import { requireApproved, requireOwner } from "../middlewares/requireApproved";
import { checkAndRecordScanAttempt, refundScanAttempt } from "../lib/scanRateLimit";
import {
  checkScanBrake,
  photoFingerprint,
  recordScanAbort,
  recordScanFailure,
  recordScanSuccess,
} from "../lib/scanFailureBreaker";
import { deleteImageByUrl, isServableImageUrl, uploadImage } from "../lib/imageStorage";
import { shouldReplaceSharedImage } from "../lib/imageQualityPolicy";


const router: IRouter = Router();

// JSON responses never embed the photo payload; images are served separately
// via GET /insects/:id/image so archives stay small and browsers can cache
// pictures independently.
const { imageData: _imageData, ...insectPublicColumns } =
  getTableColumns(insectsTable);

const SERVABLE_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// ── POST /insects/scan ────────────────────────────────────────────────────────

router.post("/insects/scan", requireApproved, (req: Request, res: Response) =>
  handleInsectScan(req, res),
);

/** Insect scan. Also used by the universal scan (POST /scan). */
export async function handleInsectScan(req: Request, res: Response): Promise<void> {
  const parsed = ScanInsectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!/^data:image\/[a-z0-9.+-]+;base64,.+/is.test(parsed.data.image)) {
    res.status(400).json({ error: "image muss eine Bild-Daten-URL sein." });
    return;
  }

  // Cost brake — same reasoning as the plant scan: refuse a photo that keeps
  // failing, and pause all scanning while the backend fails systematically,
  // before either the quota or the AI call is spent.
  const photoKey = parsed.data.localImageId ?? photoFingerprint(parsed.data.image);
  const brake = checkScanBrake("insect", photoKey);
  if (brake.blocked) {
    const retryAfterSeconds = Math.ceil(brake.retryAfterMs / 1_000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    if (brake.reason === "photo") {
      req.log.warn({ photoKey }, "Insect scan refused: this photo failed repeatedly");
      res.status(422).json({
        code: "WIEDERHOLT_FEHLGESCHLAGEN",
        error:
          "Dieses Foto konnte mehrmals nicht gespeichert werden. Bitte versuche es später noch einmal oder mache ein neues Foto.",
      });
    } else {
      req.log.warn(
        { retryAfterSeconds, reason: brake.reason },
        "Insect scan refused by cost brake",
      );
      res.status(503).json({
        error:
          "Das Speichern ist gerade gestört. Deine Fotos bleiben erhalten und werden automatisch nachgeholt.",
      });
    }
    return;
  }

  res.on("finish", () => {
    if (res.statusCode >= 500) recordScanFailure("insect", photoKey);
    else if (res.statusCode < 400) recordScanSuccess("insect", photoKey);
  });

  // Aborted connection — counted per photo only, see the plant scan route.
  res.on("close", () => {
    if (!res.writableEnded) {
      req.log.warn({ photoKey }, "Insect scan connection aborted before the response was sent");
      recordScanAbort(photoKey);
    }
  });

  // Per-user daily rate limit: 15 insect scan attempts per Berlin day.
  // Atomically checks the count and records the attempt in one transaction.
  // Kept in scope beyond the check so a later failure can refund this exact row.
  let scanAttemptId: number | null = null;
  if (req.user) {
    const rateLimit = await checkAndRecordScanAttempt(req.user.id, "insect", {
      unlimited: req.user.isOwner,
    });
    if (!rateLimit.allowed) {
      // `limit` lets the UI name the exact number the user hit instead of
      // hard-coding a copy that would silently drift out of sync.
      res.status(429).json({
        error: rateLimit.reason === "budget" ? "SCAN_BUDGET_REACHED" : "SCAN_LIMIT_REACHED",
        resetsAt: rateLimit.resetsAt,
        limit: rateLimit.limit,
      });
      return;
    }
    scanAttemptId = rateLimit.attemptId;
  }

  // The photo is uploaded only when it is needed (new species, or a known
  // species without a shared photo). Uploading every scan up front stored
  // an unused copy for every duplicate.
  const uploadPhoto = () =>
    uploadImage(parsed.data.image).catch((e: unknown) => {
      req.log.warn({ err: e }, "Insect image upload failed");
      return null as null;
    });

  const scanStartedAt = Date.now();
  let identification;
  try {
    identification = await identifyInsect(parsed.data.image, req.log);
  } catch (err) {
    req.log.error({ err }, "Insect identification failed");
    // Same reasoning as the plant scan: a failed AI call must not consume the
    // user's daily quota, since the client retries automatically.
    await refundScanAttempt(scanAttemptId);
    res.status(502).json({ error: "AI-Identifizierung fehlgeschlagen" });
    return;
  }

  if (!identification.istInsekt) {
    res.status(422).json({
      code: "KEIN_INSEKTEN_FOTO",
      error:
        "Das Foto zeigt kein Insekt. Bitte fotografiere ein Insekt, eine Spinne oder ein anderes Gliedertier.",
    });
    return;
  }

  // Deduplicate by scientific name (case-insensitive), same pattern as plants.
  const scientificKey = identification.scientificName.trim().toLowerCase();
  const canDedup =
    scientificKey.length > 0 &&
    scientificKey !== UNKNOWN_SCIENTIFIC_NAME.toLowerCase();

  if (canDedup) {
    const [existing] = await db
      .select(insectPublicColumns)
      .from(insectsTable)
      .where(sql`lower(${insectsTable.scientificName}) = ${scientificKey}`)
      .orderBy(desc(insectsTable.createdAt))
      .limit(1);

    if (existing) {
      // Image heal: if the client successfully stored a new photo locally,
      // refresh localImageId so this device/session can display the image.
      // Image heal: give the shared entry a photo if it has none yet, and a
      // local photo key only if it has none (the first scanner's key stays,
      // so that device can still back its photo up later).
      const localImageId = parsed.data.localImageId ?? null;
      let returnedInsect = existing;
      const hasImage = isServableImageUrl(existing.imageUrl);
      // Better photo: a clearly better rated scan replaces the shared
      // photo, unless the admin locked it.
      const replaceBetter =
        hasImage &&
        shouldReplaceSharedImage({
          locked: existing.imageLocked,
          current: existing.imageQuality,
          candidate: identification.imageQuality,
        });
      const newImageUrl = !hasImage || replaceBetter ? await uploadPhoto() : null;
      const adoptLocalId = !!localImageId && !existing.localImageId;
      let imageImproved = false;
      if (newImageUrl || adoptLocalId) {
        const [healed] = await db
          .update(insectsTable)
          .set({
            ...(newImageUrl
              ? { imageUrl: newImageUrl, imageQuality: identification.imageQuality }
              : {}),
            ...(adoptLocalId ? { localImageId } : {}),
          })
          .where(eq(insectsTable.id, existing.id))
          .returning(insectPublicColumns);
        if (healed) returnedInsect = healed;
        if (healed && newImageUrl && replaceBetter) {
          imageImproved = true;
          req.log.info(
            { insectId: existing.id, from: existing.imageQuality, to: identification.imageQuality },
            "Shared insect photo replaced by a better one",
          );
          void deleteImageByUrl(existing.imageUrl).catch(() => false);
        }
      }

      let insectIsNewToUser = false;
      if (req.user) {
        const [existingScanRow] = await db
          .insert(insectScansTable)
          .values({ userId: req.user.id, insectId: existing.id })
          .onConflictDoNothing()
          .returning({ id: insectScansTable.id });

        insectIsNewToUser = !!existingScanRow;
        if (insectIsNewToUser) {
          await db
            .update(usersTable)
            .set({ leavesCount: sql`${usersTable.leavesCount} + 1` })
            .where(eq(usersTable.id, req.user.id));
        }
      }

      res
        .status(201)
        .json(
          ScanInsectResponse.parse({
            insect: returnedInsect,
            alreadyInArchive: !insectIsNewToUser,
            imageImproved: imageImproved || null,
          }),
        );
      req.log.info({ totalMs: Date.now() - scanStartedAt, newSpecies: false }, "Insect scan done");
      return;
    }
  }

  // New species — insert then record the scan. The photo is uploaded to the
  // CDN after the response has been sent: the scanning device already has it
  // locally (localImageId), so the user does not have to wait for the upload.
  const localImageId = parsed.data.localImageId ?? null;
  const [newInsect] = await db
    .insert(insectsTable)
    .values({
      ...(localImageId ? { localImageId } : {}),
      imageQuality: identification.imageQuality,
      germanName: identification.germanName,
      scientificName: identification.scientificName,
      category: identification.category,
      relationStatus: identification.relationStatus,
      affectedPlants: identification.affectedPlants,
      description: identification.description,
      treatmentTips: identification.treatmentTips,
      plantContext: identification.plantContext ?? undefined,
      scannedByUserId: req.user?.id,
      ...(parsed.data.locationRegion
        ? { locationRegion: parsed.data.locationRegion.slice(0, 80) }
        : {}),
    })
    .returning(insectPublicColumns);

  if (!newInsect) {
    res.status(500).json({ error: "Datenbankfehler beim Speichern." });
    return;
  }

  if (req.user) {
    await db
      .insert(insectScansTable)
      .values({ userId: req.user.id, insectId: newInsect.id })
      .onConflictDoNothing();

    // Award one leaf for discovering a new insect species.
    await db
      .update(usersTable)
      .set({ leavesCount: sql`${usersTable.leavesCount} + 1` })
      .where(eq(usersTable.id, req.user.id));
  }

  res
    .status(201)
    .json(
      ScanInsectResponse.parse({ insect: newInsect, alreadyInArchive: false }),
    );
  req.log.info({ totalMs: Date.now() - scanStartedAt, newSpecies: true }, "Insect scan done");

  // Background upload (see above). Failures only mean the entry has no CDN
  // photo yet; the next scan of the same species heals it.
  void (async () => {
    const imageUrl = await uploadPhoto();
    if (!imageUrl) return;
    try {
      await db
        .update(insectsTable)
        .set({ imageUrl })
        .where(eq(insectsTable.id, newInsect.id));
    } catch (err) {
      req.log.warn({ err }, "Saving background insect image URL failed");
    }
  })();
}

// ── PUT /insects/:id/image-lock (admin) ───────────────────────────────────────

router.put("/insects/:id/image-lock", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const params = SetInsectImageLockParams.safeParse(req.params);
  const body = SetInsectImageLockBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Ungültige Anfrage." });
    return;
  }
  const [insect] = await db
    .update(insectsTable)
    .set({ imageLocked: body.data.locked })
    .where(eq(insectsTable.id, params.data.id))
    .returning(insectPublicColumns);
  if (!insect) {
    res.status(404).json({ error: "Insekt nicht gefunden" });
    return;
  }
  res.json(SetInsectImageLockResponse.parse(insect));
});

// ── GET /insects ──────────────────────────────────────────────────────────────

router.get(
  "/insects",
  requireApproved,
  async (_req: Request, res: Response): Promise<void> => {
    const insects = await db
      .select(insectPublicColumns)
      .from(insectsTable)
      .orderBy(desc(insectsTable.createdAt));

    res.json(ListInsectsResponse.parse(insects));
  },
);

// ── GET /insects/my-scans ─────────────────────────────────────────────────────
// Must be declared before /:id to avoid "my-scans" being matched as an id.

router.get(
  "/insects/my-scans",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Nicht angemeldet." });
      return;
    }

    const insects = await db
      .select(insectPublicColumns)
      .from(insectsTable)
      .innerJoin(
        insectScansTable,
        eq(insectsTable.id, insectScansTable.insectId),
      )
      .where(eq(insectScansTable.userId, req.user.id))
      .orderBy(desc(insectScansTable.scannedAt));

    res.json(ListMyInsectsResponse.parse(insects));
  },
);

// ── GET /insects/:id ──────────────────────────────────────────────────────────

router.get(
  "/insects/:id",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GetInsectParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungültige Insekten-ID." });
      return;
    }

    const [insect] = await db
      .select(insectPublicColumns)
      .from(insectsTable)
      .where(eq(insectsTable.id, parsed.data.id))
      .limit(1);

    if (!insect) {
      res.status(404).json({ error: "Insekt nicht gefunden." });
      return;
    }

    res.json(GetInsectResponse.parse(insect));
  },
);

// ── GET /insects/:id/image ────────────────────────────────────────────────────

router.get(
  "/insects/:id/image",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GetInsectImageParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungültige Insekten-ID." });
      return;
    }

    const [row] = await db
      .select({ imageData: insectsTable.imageData, imageUrl: insectsTable.imageUrl })
      .from(insectsTable)
      .where(eq(insectsTable.id, parsed.data.id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Insekt nicht gefunden." });
      return;
    }

    // Photos live on the CDN now; send anything asking the server for the
    // picture straight there instead of proxying it.
    if (!row.imageData && isServableImageUrl(row.imageUrl)) {
      res.redirect(302, row.imageUrl!);
      return;
    }

    // New local-first rows no longer store image bytes in the database.
    if (!row.imageData) {
      res.status(404).json({ error: "Kein Bild serverseitig gespeichert." });
      return;
    }

    const match = /^data:([^;]+);base64,(.+)$/s.exec(row.imageData);
    if (!match) {
      res.status(500).json({ error: "Ungültige Bilddaten gespeichert." });
      return;
    }

    const mimeType = match[1];
    const base64 = match[2];
    const contentType = SERVABLE_IMAGE_MIMES.has(mimeType)
      ? mimeType
      : "application/octet-stream";

    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buffer);
  },
);

// ── POST /insects/:id/image/backup ────────────────────────────────────────────
// Uploads a locally-cached insect photo to GCS and stores the object path.
// Only the user who scanned the insect may call this. Idempotent.

router.post(
  "/insects/:id/image/backup",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const insectId = parseInt(rawId, 10);
    if (isNaN(insectId) || insectId <= 0) {
      res.status(400).json({ error: "Ungültige Insekten-ID." });
      return;
    }

    const { imageData } = req.body as { imageData?: unknown };
    if (
      typeof imageData !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,.+/is.test(imageData)
    ) {
      res.status(400).json({ error: "imageData muss eine JPEG/PNG/WebP-Daten-URL sein." });
      return;
    }

    const userId = req.user!.id;

    const [insect] = await db
      .select({
        id: insectsTable.id,
        imageUrl: insectsTable.imageUrl,
        scannedByUserId: insectsTable.scannedByUserId,
      })
      .from(insectsTable)
      .where(eq(insectsTable.id, insectId));

    if (!insect) {
      res.status(404).json({ error: "Insekt nicht gefunden." });
      return;
    }

    if (insect.scannedByUserId !== userId) {
      res.status(403).json({ error: "Kein Zugriff auf dieses Insekt." });
      return;
    }

    // Idempotent: a usable image URL is already stored. Dead leftovers from the
    // old internal object storage ("/objects/...") do NOT count — nothing can
    // serve them any more, so such rows must stay repairable from a device that
    // still holds the photo.
    if (isServableImageUrl(insect.imageUrl)) {
      res.json({ stored: false });
      return;
    }

    // Upload to GCS and store the object path (never store base64 in Neon).
    const newImageUrl = await uploadImage(imageData);
    await db
      .update(insectsTable)
      .set({ imageUrl: newImageUrl })
      .where(eq(insectsTable.id, insectId));

    res.json({ stored: true });
  },
);

export default router;
