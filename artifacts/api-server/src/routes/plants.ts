import { createHash, timingSafeEqual } from "node:crypto";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { eq, desc, sql, getTableColumns, isNull, and, inArray, gte } from "drizzle-orm";
import {
  db,
  plantsTable,
  favoritesTable,
  plantScansTable,
  usersTable,
  PLANT_CATEGORIES,
  ANIMAL_KINDS,
  HEAL_TARGET_KINDS,
  type AnimalsMap,
  type SymptomsMap,
  type SymptomApplicationsMap,
  type HealTargetKind,
} from "@workspace/db";
import {
  ScanPlantBody,
  ScanPlantResponse,
  ListPlantsQueryParams,
  ListPlantsResponse,
  GetPlantParams,
  GetPlantResponse,
  GetPlantImageParams,
  GetPlantSideImageParams,
  DeletePlantParams,
  DeletePlantBody,
  UpdatePlantParams,
  UpdatePlantBody,
  UpdatePlantResponse,
  GetCategorySummaryResponse,
  BackfillPlantAnimalsResponse,
  BackfillPlantSymptomsResponse,
  BackfillPlantToxicityResponse,
  BackfillPlantFruitsResponse,
  BackfillPlantPreparationResponse,
  BackfillPlantSymptomApplicationsResponse,
  BackfillPlantMedicinalReviewResponse,
  BackfillEdibleMedicinalResponse,
  BackfillPlantSymptomCasingResponse,
  CheckPlantHealthBody,
  CheckPlantHealthResponse,
} from "@workspace/api-zod";
import {
  identifyPlant,
  generateAnimalsForPlant,
  generateSymptomsForPlant,
  generateSymptomApplicationsForPlant,
  generateToxicityForPlant,
  generateFruitsForPlant,
  generatePreparationForPlant,
  reviewMedicinalPlant,
  reviewEdibleForMedicinal,
  checkPlantHealth,
  normalizeSymptomTag,
  UNKNOWN_BOTANICAL_NAME,
} from "../lib/plantIdentification";
import { requireApproved, requireOwner } from "../middlewares/requireApproved";
import { checkAndRecordScanAttempt, refundScanAttempt } from "../lib/scanRateLimit";
import {
  checkScanBrake,
  photoFingerprint,
  recordScanAbort,
  recordScanFailure,
  recordScanSuccess,
} from "../lib/scanFailureBreaker";
import { isServableImageUrl, uploadImage } from "../lib/imageStorage";


const router: IRouter = Router();

// JSON responses exclude the (multi-hundred-KB) photo payload; photos are
// served separately via GET /plants/:id/image as real images. This keeps the
// archive/category lists at a few KB regardless of how many plants exist and
// lets browsers cache pictures independently of the data.
const {
  imageData: _imageData,
  imageDataSide: _imageDataSide,
  ...plantPublicColumns
} = getTableColumns(plantsTable);

// German warning shown when an edible-looking mushroom lacks the verified
// two-photo evidence (side view). The scan pipeline writes its own variant at
// identification time (see plantIdentification.ts); this one is prepended at
// read time for rows that predate the rule or were altered by maintenance.
const MUSHROOM_UNVERIFIED_PREFIX =
  "⚠️ Nicht als essbar bestätigt: Für die Essbar-Einstufung eines Pilzes sind zwei Fotos nötig (von oben und von der Seite). Bitte scanne den Pilz erneut mit dem Pilz-Scan (2 Fotos). Zur Sicherheit wird dieser Pilz bis dahin wie ein giftiger Pilz behandelt.\n\n";

// An "edible" mushroom row without a verified side view. Covers both:
//   - Legacy rows: imageDataSide was the durable marker (stored bytes)
//   - New local-first rows: hasSideImage boolean is the durable marker
// A row is "unverified" only when NEITHER marker is set.
const unverifiedEdibleMushroom = sql`(${plantsTable.category} = 'mushroom' and ${plantsTable.humanStatus} = 'edible' and ${plantsTable.hasSideImage} is not true and ${plantsTable.imageDataSide} is null)`;

// Public selection: every column except the image payloads, plus derived fields.
//
// Read-time mushroom safety gate (backstop): humanStatus/edibilityDetails are
// served through a CASE so an unverified "edible" mushroom row is ALWAYS
// presented as poisonous with an explanatory warning - regardless of how the
// row came to be (legacy single-photo scans, password-gated maintenance
// PATCHes that re-bucket the category, older app versions). New scans already
// enforce this at write time in identifyPlant; stored data is deliberately
// not mutated here. A two-photo rescan upgrades the row properly.
const plantSelection = {
  ...plantPublicColumns,
  humanStatus: sql<
    "edible" | "poisonous"
  >`case when ${unverifiedEdibleMushroom} then 'poisonous' else ${plantsTable.humanStatus} end`,
  edibilityDetails: sql<string>`case when ${unverifiedEdibleMushroom} then ${MUSHROOM_UNVERIFIED_PREFIX} || ${plantsTable.edibilityDetails} else ${plantsTable.edibilityDetails} end`,
  // True for both old rows (stored imageDataSide bytes) and new rows (hasSideImage flag).
  hasSideImage: sql<boolean>`(${plantsTable.hasSideImage} is true or ${plantsTable.imageDataSide} is not null)`,
};

// MIME types we are willing to reflect from stored data URLs. Anything else
// (only reachable via direct API calls, never the app UI) is served as an
// opaque download so a hostile stored payload can never execute as
// same-origin HTML.
const SERVABLE_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// Constant-time comparison (over digests, so lengths always match) to avoid
// leaking the password through response timing.
function passwordMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Brute-force brake for the password-gated routes (PATCH/DELETE): after too
// many wrong passwords within the window, further attempts are rejected with
// 429 until the window slides past. Global + in-memory is enough here — the
// app runs as a single instance and a restart merely resets the counter.
const PASSWORD_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_FAILURE_LIMIT = 10;
let passwordFailureTimes: number[] = [];

function passwordAttemptsBlocked(): boolean {
  const cutoff = Date.now() - PASSWORD_FAILURE_WINDOW_MS;
  passwordFailureTimes = passwordFailureTimes.filter((t) => t > cutoff);
  return passwordFailureTimes.length >= PASSWORD_FAILURE_LIMIT;
}

function recordPasswordFailure(): void {
  passwordFailureTimes.push(Date.now());
}

router.post("/plants/health-check", requireApproved, async (req, res): Promise<void> => {
  const parsed = CheckPlantHealthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!/^data:image\/[a-z0-9.+-]+;base64,.+/is.test(parsed.data.image)) {
    res.status(400).json({ error: "image muss eine Bild-Daten-URL sein." });
    return;
  }

  let result;
  try {
    result = await checkPlantHealth(parsed.data.image);
  } catch (err) {
    req.log.error({ err }, "Plant health check failed");
    res.status(503).json({ error: "KI-Analyse fehlgeschlagen. Bitte versuche es erneut." });
    return;
  }

  res.json(CheckPlantHealthResponse.parse(result));
});

router.post("/plants/scan", requireApproved, async (req, res): Promise<void> => {
  const parsed = ScanPlantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // The app always sends canvas-produced image data URLs; reject anything
  // else early so no non-image payload can ever be stored and later served.
  if (!/^data:image\/[a-z0-9.+-]+;base64,.+/is.test(parsed.data.image)) {
    res.status(400).json({ error: "image muss eine Bild-Daten-URL sein." });
    return;
  }

  // Optional side view of the two-photo mushroom scan - same format rules.
  const imageSide = parsed.data.imageSide;
  if (
    typeof imageSide === "string" &&
    !/^data:image\/[a-z0-9.+-]+;base64,.+/is.test(imageSide)
  ) {
    res.status(400).json({ error: "imageSide muss eine Bild-Daten-URL sein." });
    return;
  }

  // Cost brake. A scan pays for an AI call before anything is written, so a
  // photo that fails for a non-healing reason (broken schema, bad deploy) would
  // otherwise burn money on every queue retry. Checked before the rate limit and
  // before the AI call, so a refused attempt costs neither quota nor money.
  // Fall back to a content hash so a client too old to send localImageId is
  // still covered per-photo, not only by the global brake.
  const photoKey = parsed.data.localImageId ?? photoFingerprint(parsed.data.image);
  const brake = checkScanBrake("plant", photoKey);
  if (brake.blocked) {
    const retryAfterSeconds = Math.ceil(brake.retryAfterMs / 1_000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    if (brake.reason === "photo") {
      req.log.warn({ photoKey }, "Scan refused: this photo failed repeatedly");
      // 4xx marks the item permanently failed on the client, which stops the
      // automatic retries. The user can still retry by hand once the block ends.
      res.status(422).json({
        code: "WIEDERHOLT_FEHLGESCHLAGEN",
        error:
          "Dieses Foto konnte mehrmals nicht gespeichert werden. Bitte versuche es später noch einmal oder mache ein neues Foto.",
      });
    } else {
      req.log.warn({ retryAfterSeconds, reason: brake.reason }, "Scan refused by cost brake");
      // 5xx keeps the item auto-retryable: this is a temporary problem, and the
      // client's back-off will pick it up again on its own.
      res.status(503).json({
        error:
          "Das Speichern ist gerade gestört. Deine Fotos bleiben erhalten und werden automatisch nachgeholt.",
      });
    }
    return;
  }

  // Record the outcome once the response is on the wire. Hooking "finish"
  // rather than each branch means every failure counts — including an exception
  // that skips this handler entirely and is turned into a 500 further up.
  res.on("finish", () => {
    if (res.statusCode >= 500) recordScanFailure("plant", photoKey);
    else if (res.statusCode < 400) recordScanSuccess("plant", photoKey);
  });

  // A connection the client hangs up on emits "close" without "finish" (phones
  // reload the tab right after the camera closes, and mobile connections drop).
  // The AI call still ran and still cost money, so it is counted — but only
  // against this one photo, never against the global brake, because that would
  // let routine mobile behaviour pause scanning for everyone.
  res.on("close", () => {
    if (!res.writableEnded) {
      req.log.warn({ photoKey }, "Scan connection aborted before the response was sent");
      recordScanAbort(photoKey);
    }
  });

  // Per-user daily rate limit: 15 plant scan attempts per Berlin day.
  // checkAndRecordScanAttempt atomically checks the count and records the
  // attempt in one transaction, preventing concurrent requests from overshooting
  // the cap. Every AI call — new species AND duplicates — counts.
  // Kept in scope beyond the check so a later failure can refund this exact row.
  let scanAttemptId: number | null = null;
  if (req.user) {
    const rateLimit = await checkAndRecordScanAttempt(req.user.id, "plant", {
      unlimited: req.user.isOwner,
    });
    if (!rateLimit.allowed) {
      // `limit` lets the UI name the exact number the user hit instead of
      // hard-coding a copy that would silently drift out of sync.
      res.status(429).json({
        error: "SCAN_LIMIT_REACHED",
        resetsAt: rateLimit.resetsAt,
        limit: rateLimit.limit,
      });
      return;
    }
    scanAttemptId = rateLimit.attemptId;
  }

  // Start the image uploads in parallel with AI identification so we don't pay
  // the latency twice. Failures are tolerated – the scan still works via
  // IndexedDB, the photo is then just missing on other devices.
  const uploadMainPromise = uploadImage(parsed.data.image).catch((e: unknown) => {
    req.log.warn({ err: e }, "Plant image upload failed");
    return null as null;
  });
  const uploadSidePromise = typeof imageSide === "string"
    ? uploadImage(imageSide).catch(() => null as null)
    : Promise.resolve(null as null);

  let identification;
  try {
    identification = await identifyPlant(parsed.data.image, imageSide);
  } catch (err) {
    req.log.error({ err }, "Plant identification failed");
    // No identification was produced, so this attempt must not count against
    // the user's daily quota — the queue will retry it automatically.
    await refundScanAttempt(scanAttemptId);
    res.status(502).json({ error: "AI-Identifizierung fehlgeschlagen" });
    return;
  }

  // Await the uploads (likely already finished since AI takes longer).
  const [imageUrl, imageUrlSide] = await Promise.all([uploadMainPromise, uploadSidePromise]);

  // Not a plant: reject without archiving.
  if (!identification.istPflanze) {
    res.status(422).json({
      code: "KEIN_PFLANZEN_FOTO",
      error:
        "Das Foto zeigt keine Pflanze. Bitte fotografiere eine Pflanze, ein Kraut, einen Pilz oder einen Baum.",
    });
    return;
  }

  // Duplicate check by localImageId (new scans) and botanical name.
  // The old image-bytes dedup is no longer performed because new rows do not
  // store image bytes in the database. Botanical name dedup is the reliable
  // path; localImageId dedup catches queue retries of the same captured photo.
  const localImageId = parsed.data.localImageId ?? null;

  const botanicalKey = identification.botanicalName.trim().toLowerCase();
  const hasBotanicalKey =
    botanicalKey.length > 0 &&
    botanicalKey !== UNKNOWN_BOTANICAL_NAME.toLowerCase();

  // localImageId dedup: a retry of the same queued scan would carry the same
  // UUID, so we can return the already-created row without re-inserting.
  const localIdMatch = localImageId
    ? (
        await db
          .select(plantSelection)
          .from(plantsTable)
          .where(eq(plantsTable.localImageId, localImageId))
          .orderBy(desc(plantsTable.createdAt))
          .limit(1)
      )[0]
    : undefined;

  if (localIdMatch || hasBotanicalKey) {
    const existing =
      localIdMatch ??
      (
        await db
          .select(plantSelection)
          .from(plantsTable)
          .where(sql`lower(${plantsTable.botanicalName}) = ${botanicalKey}`)
          .orderBy(desc(plantsTable.createdAt))
          .limit(1)
      )[0];

    if (existing) {
      // Two-photo mushroom rescan of an archived single-photo entry: refresh
      // the entry with the verified scan (both photos + fresh fact sheet) so
      // a mushroom can be upgraded to "essbar bestätigt" without creating a
      // duplicate. Entries that already have a side view are never
      // overwritten - no silent downgrade by a later, worse scan.
      const upgradesMushroom =
        identification.category === "mushroom" &&
        typeof imageSide === "string" &&
        !existing.hasSideImage;
      if (upgradesMushroom) {
        const [updated] = await db
          .update(plantsTable)
          .set({
            // Update image references: GCS URLs take priority; also set
            // hasSideImage flag and refresh localImageId for IndexedDB fallback.
            ...(imageUrl ? { imageUrl } : {}),
            ...(imageUrlSide ? { imageUrlSide } : {}),
            hasSideImage: true,
            ...(localImageId ? { localImageId } : {}),
            germanName: identification.germanName,
            botanicalName: identification.botanicalName,
            category: identification.category,
            humanStatus: identification.humanStatus,
            poultryStatus: identification.poultryStatus,
            edibilityDetails: identification.edibilityDetails,
            animalToxicityDetails: identification.animalToxicityDetails,
            activeIngredients: identification.activeIngredients,
            humanBenefits: identification.humanBenefits,
            poultryBenefits: identification.poultryBenefits,
            habitat: identification.habitat,
            siteConditions: identification.siteConditions,
            otherUses: identification.otherUses,
            fertilizerTips: identification.fertilizerTips,
            preparation: identification.preparation,
            animals: identification.animals,
            symptoms: identification.symptoms,
            symptomApplications: identification.symptomApplications,
            humanToxicityLevel: identification.humanToxicityLevel ?? null,
          })
          .where(eq(plantsTable.id, existing.id))
          .returning(plantSelection);

        // Record this scan for the current user so it appears in "Meine Scans".
        // Use returning() to detect whether the row was actually inserted (new
        // to this user) vs. conflicted (user already had it in their archive).
        const [upgradeScanRow] = await db
          .insert(plantScansTable)
          .values({ userId: req.user!.id, plantId: existing.id })
          .onConflictDoNothing()
          .returning({ id: plantScansTable.id });

        const upgradeIsNew = !!upgradeScanRow;
        if (upgradeIsNew) {
          await db
            .update(usersTable)
            .set({ leavesCount: sql`${usersTable.leavesCount} + 1` })
            .where(eq(usersTable.id, req.user!.id));
        }

        // Same background symptomApplications generation as for new plants.
        void generateSymptomApplicationsForPlant({
          germanName: identification.germanName,
          botanicalName: identification.botanicalName,
          benefits: {
            human: identification.humanBenefits,
            poultry: identification.poultryBenefits,
            rabbit: identification.animals.rabbit?.benefits,
            guineaPig: identification.animals.guineaPig?.benefits,
            cat: identification.animals.cat?.benefits,
            horse: identification.animals.horse?.benefits,
          },
          symptoms: identification.symptoms,
        }).then((symptomApplications) =>
          db
            .update(plantsTable)
            .set({ symptomApplications })
            .where(eq(plantsTable.id, existing.id)),
        ).catch((err: unknown) => {
          req.log.warn({ err, plantId: existing.id }, "Background symptomApplications generation (upgrade) failed");
        });

        res
          .status(201)
          .json(
            ScanPlantResponse.parse({ plant: updated, alreadyInArchive: !upgradeIsNew }),
          );
        return;
      }

      // Duplicate scan (non-upgrade): record it so the existing plant appears
      // in the current user's "Meine Scans", then return without modifications.
      //
      // Smart Merge: if the existing entry has no image yet (imageUrl is null)
      // but this new scan produced a GCS URL or a new localImageId, attach the
      // photo now. This handles the "re-install" scenario where the user lost
      // their local photos and rescans a known plant to restore the image.
      let returnedPlant = existing;
      let imageMerged = false;
      const needsImageAttach =
        (!existing.imageUrl && imageUrl) ||
        (!existing.imageUrlSide && imageUrlSide) ||
        (localImageId && localImageId !== existing.localImageId);

      if (needsImageAttach) {
        const updateSet: Record<string, unknown> = {};
        if (localImageId && localImageId !== existing.localImageId) {
          updateSet.localImageId = localImageId;
        }
        if (!existing.imageUrl && imageUrl) {
          updateSet.imageUrl = imageUrl;
          imageMerged = true; // a real GCS photo was newly attached
        }
        if (!existing.imageUrlSide && imageUrlSide) {
          updateSet.imageUrlSide = imageUrlSide;
        }
        const [healed] = await db
          .update(plantsTable)
          .set(updateSet)
          .where(eq(plantsTable.id, existing.id))
          .returning(plantSelection);
        if (healed) returnedPlant = healed;
      }

      const [dupScanRow] = await db
        .insert(plantScansTable)
        .values({ userId: req.user!.id, plantId: existing.id })
        .onConflictDoNothing()
        .returning({ id: plantScansTable.id });

      const dupIsNew = !!dupScanRow;
      if (dupIsNew) {
        await db
          .update(usersTable)
          .set({ leavesCount: sql`${usersTable.leavesCount} + 1` })
          .where(eq(usersTable.id, req.user!.id));
      }

      res
        .status(201)
        .json(ScanPlantResponse.parse({ plant: returnedPlant, alreadyInArchive: !dupIsNew, imageMerged: imageMerged || null }));
      return;
    }
  }

  const [plant] = await db
    .insert(plantsTable)
    .values({
      // GCS URL is the primary image reference; localImageId kept for offline
      // fallback on the scanning device (IndexedDB). imageData is never stored.
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageUrlSide ? { imageUrlSide } : {}),
      ...(localImageId
        ? { localImageId, hasSideImage: typeof imageSide === "string" }
        : { hasSideImage: typeof imageSide === "string" }),
      germanName: identification.germanName,
      botanicalName: identification.botanicalName,
      category: identification.category,
      humanStatus: identification.humanStatus,
      poultryStatus: identification.poultryStatus,
      edibilityDetails: identification.edibilityDetails,
      animalToxicityDetails: identification.animalToxicityDetails,
      activeIngredients: identification.activeIngredients,
      humanBenefits: identification.humanBenefits,
      poultryBenefits: identification.poultryBenefits,
      habitat: identification.habitat,
      siteConditions: identification.siteConditions,
      otherUses: identification.otherUses,
      fertilizerTips: identification.fertilizerTips,
      preparation: identification.preparation,
      animals: identification.animals,
      symptoms: identification.symptoms,
      symptomApplications: identification.symptomApplications,
      humanToxicityLevel: identification.humanToxicityLevel ?? null,
      scannedByUserId: req.user!.id,
      ...(parsed.data.locationRegion
        ? { locationRegion: parsed.data.locationRegion.slice(0, 80) }
        : {}),
    })
    .returning(plantSelection);

  // Record the scan so this plant appears in the user's "Meine Scans".
  await db
    .insert(plantScansTable)
    .values({ userId: req.user!.id, plantId: plant.id })
    .onConflictDoNothing();

  // Award one leaf for discovering a new species.
  await db
    .update(usersTable)
    .set({ leavesCount: sql`${usersTable.leavesCount} + 1` })
    .where(eq(usersTable.id, req.user!.id));

  // symptomApplications was intentionally omitted from the main scan prompt to
  // keep the AI response short (faster scan). Generate it now in the background
  // so it is ready by the time the user opens the Pflanzendoc detail page.
  // Fire-and-forget: the response has already been sent, errors are logged only.
  void generateSymptomApplicationsForPlant({
    germanName: identification.germanName,
    botanicalName: identification.botanicalName,
    benefits: {
      human: identification.humanBenefits,
      poultry: identification.poultryBenefits,
      rabbit: identification.animals.rabbit?.benefits,
      guineaPig: identification.animals.guineaPig?.benefits,
      cat: identification.animals.cat?.benefits,
      horse: identification.animals.horse?.benefits,
    },
    symptoms: identification.symptoms,
  }).then((symptomApplications) =>
    db
      .update(plantsTable)
      .set({ symptomApplications })
      .where(eq(plantsTable.id, plant.id)),
  ).catch((err: unknown) => {
    req.log.warn({ err, plantId: plant.id }, "Background symptomApplications generation failed");
  });

  res.status(201).json(ScanPlantResponse.parse({ plant, alreadyInArchive: false }));
});

router.get("/plants", requireApproved, async (req, res): Promise<void> => {
  const query = ListPlantsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = query.data.category
    ? await db
        .select(plantSelection)
        .from(plantsTable)
        .where(eq(plantsTable.category, query.data.category))
        .orderBy(desc(plantsTable.createdAt))
    : await db
        .select(plantSelection)
        .from(plantsTable)
        .orderBy(desc(plantsTable.createdAt));

  res.json(ListPlantsResponse.parse(rows));
});

router.get(
  "/plants/categories/summary",
  requireApproved,
  async (_req, res): Promise<void> => {
    // Aggregate in SQL - loading whole rows (with photos) just to count them
    // made this endpoint scale with total image bytes instead of row count.
    // The per-humanStatus split lets the UI divide a category into poisonous
    // and edible sub-groups (used for Pilze) without loading rows.
    const rows = await db
      .select({
        category: plantsTable.category,
        count: sql<number>`count(*)::int`,
        // Same read-time mushroom safety gate as plantSelection: unverified
        // "edible" mushrooms count as poisonous, so tab counts always match
        // the rows the list endpoint serves.
        poisonousCount: sql<number>`(count(*) filter (where ${plantsTable.humanStatus} = 'poisonous' or ${unverifiedEdibleMushroom}))::int`,
        edibleCount: sql<number>`(count(*) filter (where ${plantsTable.humanStatus} = 'edible' and not ${unverifiedEdibleMushroom}))::int`,
      })
      .from(plantsTable)
      .groupBy(plantsTable.category);

    const byCategory = new Map(rows.map((r) => [r.category as string, r]));

    const summary = PLANT_CATEGORIES.map((category) => {
      const row = byCategory.get(category);
      return {
        category,
        count: row?.count ?? 0,
        poisonousCount: row?.poisonousCount ?? 0,
        edibleCount: row?.edibleCount ?? 0,
      };
    });

    res.json(GetCategorySummaryResponse.parse(summary));
  },
);

const EDIBLE_MEDICINAL_BATCH_SIZE = 3;

// Promotes edible plants to "medicinal" where current phytotherapy supports it.
// Uses medicinalVerifiedAt as an idempotent marker (NULL = not yet reviewed).
// Promoted plants have symptoms/symptomApplications reset to {} so the existing
// backfills re-run them under the new category. Owner-only.
router.post(
  "/plants/edible-medicinal/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const allEdible = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        humanStatus: plantsTable.humanStatus,
      })
      .from(plantsTable)
      .where(
        and(
          eq(plantsTable.category, "edible"),
          isNull(plantsTable.medicinalVerifiedAt),
        ),
      )
      .orderBy(desc(plantsTable.createdAt));

    const batch = allEdible.slice(0, EDIBLE_MEDICINAL_BATCH_SIZE);
    let processed = 0;
    let promoted = 0;

    for (const plant of batch) {
      try {
        const { promoteMedicinal } = await reviewEdibleForMedicinal(
          plant.germanName,
          plant.botanicalName,
        );
        if (promoteMedicinal) {
          await db
            .update(plantsTable)
            .set({
              category: "medicinal",
              // Reset so symptom + symptomApplications backfills re-run
              // them fresh under the new "medicinal" category.
              symptoms: {},
              symptomApplications: {},
              medicinalVerifiedAt: new Date(),
            })
            .where(eq(plantsTable.id, plant.id));
          promoted++;
        } else {
          // Confirmed edible — mark as reviewed so we don't re-check it.
          await db
            .update(plantsTable)
            .set({ medicinalVerifiedAt: new Date() })
            .where(eq(plantsTable.id, plant.id));
        }
        processed++;
      } catch (err) {
        req.log.error(
          { err, plantId: plant.id },
          "Edible-to-medicinal backfill failed",
        );
      }
    }

    const remaining = allEdible.length - processed;
    res.json(
      BackfillEdibleMedicinalResponse.parse({
        processed,
        promoted,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

const MEDICINAL_REVIEW_BATCH_SIZE = 3;

// Re-evaluates stored "medicinal" plants against current phytotherapy standards.
// Plants that are no longer recommended are reclassified to "poisonous" or
// "edible" (based on their humanStatus). Idempotent: uses medicinalVerifiedAt
// as a processed marker so each plant is reviewed exactly once. Owner-only.
router.post(
  "/plants/medicinal-review/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const allMedicinal = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        humanStatus: plantsTable.humanStatus,
      })
      .from(plantsTable)
      .where(
        and(
          eq(plantsTable.category, "medicinal"),
          isNull(plantsTable.medicinalVerifiedAt),
        ),
      )
      .orderBy(desc(plantsTable.createdAt));

    const batch = allMedicinal.slice(0, MEDICINAL_REVIEW_BATCH_SIZE);
    let processed = 0;
    let reclassified = 0;

    for (const plant of batch) {
      try {
        const { keepMedicinal } = await reviewMedicinalPlant(
          plant.germanName,
          plant.botanicalName,
        );
        if (!keepMedicinal) {
          // Reclassify: use human toxicity status to pick the right category.
          const newCategory =
            plant.humanStatus === "poisonous" ? "poisonous" : "edible";
          await db
            .update(plantsTable)
            .set({
              category: newCategory,
              // Reset derived fields so the existing backfills re-evaluate them
              // under the new category (medicinal symptoms no longer apply).
              symptoms: {},
              symptomApplications: {},
              medicinalVerifiedAt: new Date(),
            })
            .where(eq(plantsTable.id, plant.id));
          reclassified++;
        } else {
          await db
            .update(plantsTable)
            .set({ medicinalVerifiedAt: new Date() })
            .where(eq(plantsTable.id, plant.id));
        }
        processed++;
      } catch (err) {
        req.log.error(
          { err, plantId: plant.id },
          "Medicinal review backfill failed",
        );
      }
    }

    const remaining = allMedicinal.length - processed;
    res.json(
      BackfillPlantMedicinalReviewResponse.parse({
        processed,
        reclassified,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

// Small batch size so a single request stays well under the autoscale request
// timeout even when every plant needs a fresh (text-only) AI generation.
const SYMPTOM_APPLICATIONS_BACKFILL_BATCH_SIZE = 3;

// One-time (idempotent) backfill of per-symptom application instructions for
// plants scanned before the feature existed. The client calls repeatedly until
// `done` is true. Owner-only: triggers AI generation + DB writes.
router.post(
  "/plants/symptom-applications/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        humanBenefits: plantsTable.humanBenefits,
        poultryBenefits: plantsTable.poultryBenefits,
        animals: plantsTable.animals,
        symptoms: plantsTable.symptoms,
        symptomApplications: plantsTable.symptomApplications,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    // A plant needs backfill if its symptomApplications has no keys at all
    // (= not yet processed). After backfill every target key is present.
    const needsBackfill = rows.filter(
      (r) =>
        Object.keys((r.symptomApplications as SymptomApplicationsMap) ?? {})
          .length === 0,
    );

    // Only process plants whose symptom tags are already filled in; otherwise
    // we'd persist empty instructions and mark the row done permanently.
    const ready = needsBackfill.filter((r) =>
      HEAL_TARGET_KINDS.every((t) => (r.symptoms as SymptomsMap)?.[t] !== undefined),
    );

    const batch = ready.slice(0, SYMPTOM_APPLICATIONS_BACKFILL_BATCH_SIZE);
    let processed = 0;
    for (const plant of batch) {
      try {
        const animals = (plant.animals as AnimalsMap) ?? {};
        const benefits: Partial<Record<HealTargetKind, string>> = {
          human: plant.humanBenefits,
          poultry: animals.poultry?.benefits ?? plant.poultryBenefits,
          rabbit: animals.rabbit?.benefits,
          guineaPig: animals.guineaPig?.benefits,
          cat: animals.cat?.benefits,
          horse: animals.horse?.benefits,
        };
        const symptomApplications = await generateSymptomApplicationsForPlant({
          germanName: plant.germanName,
          botanicalName: plant.botanicalName,
          benefits,
          symptoms: (plant.symptoms as SymptomsMap) ?? {},
        });
        await db
          .update(plantsTable)
          .set({ symptomApplications })
          .where(eq(plantsTable.id, plant.id));
        processed++;
      } catch (err) {
        req.log.error(
          { err, plantId: plant.id },
          "Symptom applications backfill failed",
        );
      }
    }

    const remaining = needsBackfill.length - processed;
    res.json(
      BackfillPlantSymptomApplicationsResponse.parse({
        processed,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

const ANIMAL_BACKFILL_BATCH_SIZE = 3;

// One-time (idempotent) backfill of the per-animal fact sheets for plants that
// were scanned before the "Status Tiere" feature existed. The client calls this
// repeatedly until `done` is true. Owner-only: it triggers AI generation and
// writes to the DB, so it must never be reachable by ordinary accounts.
router.post(
  "/plants/animals/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    // Load the lightweight fields (never the photo) needed to decide what is
    // missing and to drive text-only generation.
    const rows = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        animals: plantsTable.animals,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    // A plant needs backfill if it is missing a fact sheet for any animal kind
    // (legacy rows have animals = {}); partially filled rows are also caught.
    const needsBackfill = rows.filter((r) =>
      ANIMAL_KINDS.some((kind) => !(r.animals as AnimalsMap)?.[kind]),
    );

    const batch = needsBackfill.slice(0, ANIMAL_BACKFILL_BATCH_SIZE);
    let processed = 0;
    for (const plant of batch) {
      try {
        const animals = await generateAnimalsForPlant(
          plant.germanName,
          plant.botanicalName,
        );
        const poultry = animals.poultry!;
        await db
          .update(plantsTable)
          .set({
            animals,
            // Keep the legacy poultry columns in sync with animals.poultry.
            poultryStatus: poultry.status,
            animalToxicityDetails: poultry.toxicityDetails,
            poultryBenefits: poultry.benefits,
          })
          .where(eq(plantsTable.id, plant.id));
        processed++;
      } catch (err) {
        // Skip this plant and keep going, so one row that keeps failing to
        // generate can never block the rest of the queue. It stays in the
        // "needs backfill" set and is retried on a later call; the operation is
        // idempotent, so nothing is lost.
        req.log.error({ err, plantId: plant.id }, "Animal backfill failed");
      }
    }

    const remaining = needsBackfill.length - processed;
    res.json(
      BackfillPlantAnimalsResponse.parse({
        processed,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

// Same small batch size and idempotent, owner-gated pattern as the animal
// backfill: one text-only AI generation per plant, well under the request
// timeout.
const SYMPTOM_BACKFILL_BATCH_SIZE = 3;

// One-time (idempotent) backfill of the treatable-symptom tags for plants that
// were scanned before the "Kräuter-Hexe" feature existed. The client calls this
// repeatedly until `done` is true. Owner-only: it triggers AI generation and
// writes to the DB, so it must never be reachable by ordinary accounts.
router.post(
  "/plants/symptoms/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    // Load the lightweight fields (never the photo) needed to decide what is
    // missing and to ground the text-only generation in the stored benefits.
    const rows = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        humanBenefits: plantsTable.humanBenefits,
        poultryBenefits: plantsTable.poultryBenefits,
        animals: plantsTable.animals,
        symptoms: plantsTable.symptoms,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    // A plant needs backfill if it is missing a symptom list for any target
    // (legacy rows have symptoms = {}); partially filled rows are also caught.
    // An empty array counts as "present" (nothing treatable for that target).
    const needsBackfill = rows.filter((r) =>
      HEAL_TARGET_KINDS.some(
        (target) => !(r.symptoms as SymptomsMap)?.[target],
      ),
    );

    // Symptom generation is grounded in each animal's benefit text, so only
    // process rows whose per-animal fact sheets are complete. Rows still missing
    // an animal (e.g. a newly added kind not yet backfilled) are deferred to a
    // later call - writing symptoms now would persist empty tags and mark the
    // row "done", so it would never be recomputed once the animal is filled.
    // Deferred rows stay counted in `remaining`, keeping `done` false meanwhile.
    const ready = needsBackfill.filter((r) =>
      ANIMAL_KINDS.every((kind) => (r.animals as AnimalsMap)?.[kind]),
    );

    const batch = ready.slice(0, SYMPTOM_BACKFILL_BATCH_SIZE);
    let processed = 0;
    for (const plant of batch) {
      try {
        const animals = (plant.animals as AnimalsMap) ?? {};
        // Ground the generation in whatever benefit text the plant already has.
        // Poultry falls back to the legacy column for plants scanned before the
        // per-animal fact sheets existed.
        const benefits: Partial<Record<HealTargetKind, string>> = {
          human: plant.humanBenefits,
          poultry: animals.poultry?.benefits ?? plant.poultryBenefits,
          rabbit: animals.rabbit?.benefits,
          guineaPig: animals.guineaPig?.benefits,
          cat: animals.cat?.benefits,
          horse: animals.horse?.benefits,
        };
        const symptoms = await generateSymptomsForPlant({
          germanName: plant.germanName,
          botanicalName: plant.botanicalName,
          benefits,
        });
        await db
          .update(plantsTable)
          .set({ symptoms })
          .where(eq(plantsTable.id, plant.id));
        processed++;
      } catch (err) {
        // Skip this plant and keep going, so one row that keeps failing to
        // generate can never block the rest of the queue. It stays in the
        // "needs backfill" set and is retried on a later call; the operation is
        // idempotent, so nothing is lost.
        req.log.error({ err, plantId: plant.id }, "Symptom backfill failed");
      }
    }

    const remaining = needsBackfill.length - processed;
    res.json(
      BackfillPlantSymptomsResponse.parse({
        processed,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

// One-time (idempotent) normalisation of symptom tag casing for rows that were
// written before write-time sentence-casing was added. Processes every plant in
// one DB round-trip (no AI generation needed) and re-keys symptomApplications
// to match. Plants whose tags are already correctly cased are left untouched.
// Owner-only.
router.post(
  "/plants/symptoms/casing/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: plantsTable.id,
        symptoms: plantsTable.symptoms,
        symptomApplications: plantsTable.symptomApplications,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    let processed = 0;
    let updated = 0;

    for (const row of rows) {
      processed++;
      const rawSymptoms = (row.symptoms as SymptomsMap) ?? {};
      const rawApps = (row.symptomApplications as SymptomApplicationsMap) ?? {};

      const newSymptoms: SymptomsMap = {};
      const newApps: SymptomApplicationsMap = {};
      let changed = false;

      for (const target of HEAL_TARGET_KINDS) {
        const tags = rawSymptoms[target] ?? [];
        const seen = new Set<string>();
        const normalizedTags: string[] = [];

        for (const tag of tags) {
          const normalised = normalizeSymptomTag(tag);
          const key = normalised.toLocaleLowerCase("de-DE");
          if (seen.has(key)) {
            // Dedup: normalisation collapsed two variants into one
            changed = true;
            continue;
          }
          seen.add(key);
          normalizedTags.push(normalised);
          if (normalised !== tag) changed = true;
        }

        newSymptoms[target] = normalizedTags;

        // Re-key symptomApplications: old tag → new tag.
        const appObj = (rawApps[target] ?? {}) as Record<string, string>;
        const newAppObj: Record<string, string> = {};
        for (let i = 0; i < tags.length && i < normalizedTags.length; i++) {
          const oldTag = tags[i];
          const newTag = normalizedTags[i];
          const instruction = appObj[oldTag] ?? appObj[newTag] ?? "";
          if (instruction) newAppObj[newTag] = instruction;
        }
        // Also carry over any keys that already match the normalised form.
        for (const [k, v] of Object.entries(appObj)) {
          const normalised = normalizeSymptomTag(k);
          if (!(normalised in newAppObj) && v) newAppObj[normalised] = v;
        }
        newApps[target] = newAppObj;
      }

      if (changed) {
        await db
          .update(plantsTable)
          .set({ symptoms: newSymptoms, symptomApplications: newApps })
          .where(eq(plantsTable.id, row.id));
        updated++;
      }
    }

    res.json(
      BackfillPlantSymptomCasingResponse.parse({
        processed,
        updated,
        done: true,
      }),
    );
  },
);

const FRUITS_BACKFILL_BATCH_SIZE = 3;

// One-time (idempotent) backfill of the edible-fruits flag for plants that
// were scanned before this feature existed. Owner-only, batched.
router.post(
  "/plants/fruits/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        hasEdibleFruits: plantsTable.hasEdibleFruits,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    const needsBackfill = rows.filter((r) => r.hasEdibleFruits === null || r.hasEdibleFruits === undefined);
    const batch = needsBackfill.slice(0, FRUITS_BACKFILL_BATCH_SIZE);
    let processed = 0;
    for (const plant of batch) {
      try {
        const { hasEdibleFruits } = await generateFruitsForPlant({
          germanName: plant.germanName,
          botanicalName: plant.botanicalName,
        });
        await db
          .update(plantsTable)
          .set({ hasEdibleFruits })
          .where(eq(plantsTable.id, plant.id));
        processed++;
      } catch (err) {
        req.log.error({ err, plantId: plant.id }, "Fruits backfill failed");
      }
    }

    const remaining = needsBackfill.length - processed;
    res.json(
      BackfillPlantFruitsResponse.parse({
        processed,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

const TOXICITY_BACKFILL_BATCH_SIZE = 3;

// One-time (idempotent) backfill of the three-tier toxicity level
// (intolerant/poisonous/lethal) for plants scanned before the feature existed.
// Owner-only, batched: the client calls repeatedly until `done` is true.
router.post(
  "/plants/toxicity/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        humanStatus: plantsTable.humanStatus,
        humanToxicityLevel: plantsTable.humanToxicityLevel,
        edibilityDetails: plantsTable.edibilityDetails,
        animals: plantsTable.animals,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    const needsBackfill = rows.filter((r) => {
      // Human toxicity level missing for a poisonous plant?
      if (r.humanStatus === "poisonous" && !r.humanToxicityLevel) return true;
      // Any animal missing a toxicity level despite being poisonous?
      const animals = (r.animals as AnimalsMap) ?? {};
      return ANIMAL_KINDS.some(
        (kind) => animals[kind]?.status === "poisonous" && !animals[kind]?.toxicityLevel,
      );
    });

    const batch = needsBackfill.slice(0, TOXICITY_BACKFILL_BATCH_SIZE);
    let processed = 0;
    for (const plant of batch) {
      try {
        const result = await generateToxicityForPlant({
          germanName: plant.germanName,
          botanicalName: plant.botanicalName,
          humanStatus: plant.humanStatus,
          edibilityDetails: plant.edibilityDetails,
          animals: (plant.animals as AnimalsMap) ?? {},
        });
        await db
          .update(plantsTable)
          .set({
            humanToxicityLevel: result.humanToxicityLevel ?? null,
            animals: result.animals,
          })
          .where(eq(plantsTable.id, plant.id));
        processed++;
      } catch (err) {
        req.log.error({ err, plantId: plant.id }, "Toxicity backfill failed");
      }
    }

    const remaining = needsBackfill.length - processed;
    res.json(
      BackfillPlantToxicityResponse.parse({
        processed,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

const PREPARATION_BACKFILL_BATCH_SIZE = 3;

// One-time (idempotent) backfill of the preparation description for edible
// plants scanned before this field existed. Owner-only, batched.
router.post(
  "/plants/preparation/backfill",
  requireApproved,
  requireOwner,
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: plantsTable.id,
        germanName: plantsTable.germanName,
        botanicalName: plantsTable.botanicalName,
        humanStatus: plantsTable.humanStatus,
        category: plantsTable.category,
        preparation: plantsTable.preparation,
      })
      .from(plantsTable)
      .orderBy(desc(plantsTable.createdAt));

    // Only edible plants need preparation; also backfill rows where the field
    // is empty (default '') for plants that qualify.
    const needsBackfill = rows.filter(
      (r) =>
        r.humanStatus === "edible" &&
        (r.category === "edible" || r.category === "mushroom") &&
        (!r.preparation || r.preparation.trim() === ""),
    );
    const batch = needsBackfill.slice(0, PREPARATION_BACKFILL_BATCH_SIZE);
    let processed = 0;
    for (const plant of batch) {
      try {
        const { preparation } = await generatePreparationForPlant({
          germanName: plant.germanName,
          botanicalName: plant.botanicalName,
        });
        await db
          .update(plantsTable)
          .set({ preparation })
          .where(eq(plantsTable.id, plant.id));
        processed++;
      } catch (err) {
        req.log.error({ err, plantId: plant.id }, "Preparation backfill failed");
      }
    }

    const remaining = needsBackfill.length - processed;
    res.json(
      BackfillPlantPreparationResponse.parse({
        processed,
        remaining,
        done: remaining <= 0,
      }),
    );
  },
);

// Shared serving logic for stored data-URL photos (main and side view):
// strong ETag, allowlisted content types, private caching.
function serveStoredImage(
  req: Request,
  res: Response,
  dataUrl: string | null,
): void {
  const match = dataUrl ? /^data:([^;]+);base64,(.+)$/s.exec(dataUrl) : null;
  if (!match) {
    res.status(404).json({ error: "Kein Bild vorhanden" });
    return;
  }

  const buf = Buffer.from(match[2], "base64");
  // Strong ETag from the bytes: after a photo is recompressed the tag changes,
  // so clients revalidate cheaply (304) but never keep a stale image forever.
  const etag = `"${createHash("sha256").update(buf).digest("hex").slice(0, 32)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  const mime = match[1].toLowerCase();
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Type",
    SERVABLE_IMAGE_MIMES.has(mime) ? mime : "application/octet-stream",
  );
  res.setHeader("Content-Length", String(buf.length));
  // Session-protected images: private so shared proxies never cache them
  // for other clients; the browser of the signed-in user still caches.
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("ETag", etag);
  res.end(buf);
}

router.get(
  "/plants/:id/image",
  requireApproved,
  async (req, res): Promise<void> => {
    const params = GetPlantImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [row] = await db
      .select({ imageData: plantsTable.imageData, imageUrl: plantsTable.imageUrl })
      .from(plantsTable)
      .where(eq(plantsTable.id, params.data.id));

    if (!row) {
      res.status(404).json({ error: "Pflanze nicht gefunden" });
      return;
    }

    // Photos now live on the CDN; only pre-Cloudinary rows still carry bytes in
    // the database. Redirecting instead of 404-ing keeps this endpoint working
    // for everything that asks the server for a photo (PDF export, older
    // clients) without proxying image traffic through us.
    if (!row.imageData && isServableImageUrl(row.imageUrl)) {
      res.redirect(302, row.imageUrl!);
      return;
    }

    serveStoredImage(req, res, row.imageData);
  },
);

router.get(
  "/plants/:id/image/side",
  requireApproved,
  async (req, res): Promise<void> => {
    const params = GetPlantSideImageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [row] = await db
      .select({
        imageDataSide: plantsTable.imageDataSide,
        imageUrlSide: plantsTable.imageUrlSide,
      })
      .from(plantsTable)
      .where(eq(plantsTable.id, params.data.id));

    if (!row) {
      res.status(404).json({ error: "Pflanze nicht gefunden" });
      return;
    }

    if (!row.imageDataSide && isServableImageUrl(row.imageUrlSide)) {
      res.redirect(302, row.imageUrlSide!);
      return;
    }

    serveStoredImage(req, res, row.imageDataSide);
  },
);

// ── Personal archive: plants scanned by the current user ────────────────────
// IMPORTANT: must be registered BEFORE /plants/:id so Express doesn't
// match "my-scans" as the :id segment and return 400.

router.get("/plants/my-scans", requireApproved, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  // Subquery: every plantId this user has ever scanned (new or duplicate).
  const scannedIds = db
    .selectDistinct({ plantId: plantScansTable.plantId })
    .from(plantScansTable)
    .where(eq(plantScansTable.userId, userId));

  const rows = await db
    .select(plantSelection)
    .from(plantsTable)
    .where(inArray(plantsTable.id, scannedIds))
    .orderBy(desc(plantsTable.createdAt));

  res.json(ListPlantsResponse.parse(rows));
});

router.get("/plants/:id", requireApproved, async (req, res): Promise<void> => {
  const params = GetPlantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [plant] = await db
    .select(plantSelection)
    .from(plantsTable)
    .where(eq(plantsTable.id, params.data.id));

  if (!plant) {
    res.status(404).json({ error: "Pflanze nicht gefunden" });
    return;
  }

  res.json(GetPlantResponse.parse(plant));
});

// Password-gated maintenance update: used to recompress stored photos, to
// backfill newly added fact-sheet fields (habitat/site conditions, weitere
// Nutzung, Düngetipps) and to re-bucket entries into categories added after
// they were scanned (e.g. tree/shrub/moss) - the production DB is read-only
// from the workspace, so such fixes can only go through the deployed app.
//
// Deliberately NOT behind requireApproved: this endpoint is called from
// maintenance scripts outside a browser session and is protected by the
// server-side archive password instead.
router.patch("/plants/:id", async (req, res): Promise<void> => {
  const params = UpdatePlantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdatePlantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const expectedPassword = process.env.DELETE_PASSWORD;
  if (!expectedPassword) {
    req.log.error("DELETE_PASSWORD is not configured; refusing to update");
    res.status(503).json({ error: "Bearbeiten ist derzeit nicht konfiguriert." });
    return;
  }

  if (passwordAttemptsBlocked()) {
    res.status(429).json({
      error: "Zu viele Fehlversuche. Bitte später erneut versuchen.",
    });
    return;
  }

  if (!passwordMatches(body.data.password, expectedPassword)) {
    recordPasswordFailure();
    res.status(403).json({ error: "Falsches Passwort." });
    return;
  }

  const patch: Partial<{
    imageData: string;
    habitat: string;
    siteConditions: string;
    otherUses: string;
    fertilizerTips: string;
    category: (typeof PLANT_CATEGORIES)[number];
  }> = {};
  if (typeof body.data.imageData === "string") {
    if (!/^data:image\/(jpeg|png|webp);base64,.+/is.test(body.data.imageData)) {
      res
        .status(400)
        .json({ error: "imageData muss eine JPEG/PNG/WebP-Daten-URL sein." });
      return;
    }
    patch.imageData = body.data.imageData;
  }
  if (typeof body.data.habitat === "string") {
    patch.habitat = body.data.habitat;
  }
  if (typeof body.data.siteConditions === "string") {
    patch.siteConditions = body.data.siteConditions;
  }
  if (typeof body.data.otherUses === "string") {
    patch.otherUses = body.data.otherUses;
  }
  if (typeof body.data.fertilizerTips === "string") {
    patch.fertilizerTips = body.data.fertilizerTips;
  }
  if (typeof body.data.category === "string") {
    patch.category = body.data.category;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Keine Felder zum Aktualisieren angegeben." });
    return;
  }

  const [plant] = await db
    .update(plantsTable)
    .set(patch)
    .where(eq(plantsTable.id, params.data.id))
    .returning(plantSelection);

  if (!plant) {
    res.status(404).json({ error: "Pflanze nicht gefunden" });
    return;
  }

  res.json(UpdatePlantResponse.parse(plant));
});

router.delete("/plants/:id", requireApproved, async (req, res): Promise<void> => {
  const params = DeletePlantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = DeletePlantBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Password-gated delete (on top of the login requirement). The expected
  // password is read from the environment and verified server-side so it
  // can't be bypassed by calling the API directly.
  const expectedPassword = process.env.DELETE_PASSWORD;
  if (!expectedPassword) {
    req.log.error("DELETE_PASSWORD is not configured; refusing to delete");
    res.status(503).json({ error: "Löschen ist derzeit nicht konfiguriert." });
    return;
  }

  if (passwordAttemptsBlocked()) {
    res.status(429).json({
      error: "Zu viele Fehlversuche. Bitte später erneut versuchen.",
    });
    return;
  }

  if (!passwordMatches(body.data.password, expectedPassword)) {
    recordPasswordFailure();
    res.status(403).json({ error: "Falsches Passwort." });
    return;
  }

  const [plant] = await db
    .delete(plantsTable)
    .where(eq(plantsTable.id, params.data.id))
    .returning({ id: plantsTable.id });

  if (!plant) {
    res.status(404).json({ error: "Pflanze nicht gefunden" });
    return;
  }

  res.sendStatus(204);
});

// ── Favourites ───────────────────────────────────────────────────────────────

// GET /api/favorites — returns the IDs of all plants the current user has
// marked as a favourite. Kept as a simple ID list so list views can do O(1)
// lookups without loading full plant records twice.
router.get("/favorites", requireApproved, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db
    .select({ plantId: favoritesTable.plantId })
    .from(favoritesTable)
    .where(eq(favoritesTable.userId, userId));

  res.json({ plantIds: rows.map((r) => r.plantId) });
});

// POST /api/favorites/:plantId — idempotent (do nothing if already favourite).
router.post("/favorites/:plantId", requireApproved, async (req, res): Promise<void> => {
  const plantId = Number(req.params.plantId);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    res.status(400).json({ error: "Ungültige Pflanzen-ID." });
    return;
  }

  // Confirm the plant exists before creating the favourite.
  const [exists] = await db
    .select({ id: plantsTable.id })
    .from(plantsTable)
    .where(eq(plantsTable.id, plantId))
    .limit(1);

  if (!exists) {
    res.status(404).json({ error: "Pflanze nicht gefunden." });
    return;
  }

  await db
    .insert(favoritesTable)
    .values({ userId: req.user!.id, plantId })
    .onConflictDoNothing();

  res.sendStatus(204);
});

// DELETE /api/favorites/:plantId — idempotent (no error if not a favourite).
router.delete("/favorites/:plantId", requireApproved, async (req, res): Promise<void> => {
  const plantId = Number(req.params.plantId);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    res.status(400).json({ error: "Ungültige Pflanzen-ID." });
    return;
  }

  await db
    .delete(favoritesTable)
    .where(
      and(
        eq(favoritesTable.userId, req.user!.id),
        eq(favoritesTable.plantId, plantId),
      ),
    );

  res.sendStatus(204);
});

// ── POST /plants/:id/image/backup ─────────────────────────────────────────────
// Uploads a locally-cached photo to GCS and stores the object path in imageUrl.
// Only the user who scanned the plant (or has a plant_scans entry) may call
// this. Idempotent: if imageUrl is already set, returns {stored:false}.

router.post(
  "/plants/:id/image/backup",
  requireApproved,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const plantId = parseInt(rawId, 10);
    if (isNaN(plantId) || plantId <= 0) {
      res.status(400).json({ error: "Ungültige Pflanzen-ID." });
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

    const [plant] = await db
      .select({
        id: plantsTable.id,
        imageUrl: plantsTable.imageUrl,
        scannedByUserId: plantsTable.scannedByUserId,
      })
      .from(plantsTable)
      .where(eq(plantsTable.id, plantId));

    if (!plant) {
      res.status(404).json({ error: "Pflanze nicht gefunden." });
      return;
    }

    // Only allow the scanner or anyone with a plant_scans entry.
    if (plant.scannedByUserId !== userId) {
      const [scan] = await db
        .select({ id: plantScansTable.id })
        .from(plantScansTable)
        .where(
          and(
            eq(plantScansTable.plantId, plantId),
            eq(plantScansTable.userId, userId),
          ),
        );
      if (!scan) {
        res.status(403).json({ error: "Kein Zugriff auf diese Pflanze." });
        return;
      }
    }

    // Idempotent: image URL already set.
    if (plant.imageUrl !== null) {
      res.json({ stored: false });
      return;
    }

    // Upload to the image host and store the URL (never store base64 in Neon).
    const newImageUrl = await uploadImage(imageData);
    await db
      .update(plantsTable)
      .set({ imageUrl: newImageUrl })
      .where(eq(plantsTable.id, plantId));

    res.json({ stored: true });
  },
);

export default router;
