import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, careGuidesTable, usersTable } from "@workspace/db";
import { createHash, timingSafeEqual } from "crypto";

function validDays(arr: number[]): number[] {
  return arr.filter((d) => Number.isInteger(d) && d >= 1 && d <= 30);
}

// Set-difference-based delta: counts genuinely added days minus genuinely removed days.
// Strictly more correct than length-difference: handles duplicate sends, type drift,
// and any edge case where old and new lengths match but content differs.
function leafDelta(oldDays: number[], newDays: number[]): number {
  const oldSet = new Set(oldDays);
  const newSet = new Set(newDays);
  const added   = [...newSet].filter((d) => !oldSet.has(d)).length;
  const removed = [...oldSet].filter((d) => !newSet.has(d)).length;
  return added - removed;
}

function passwordMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
import { requireApproved } from "../middlewares/requireApproved";
import { generateCareGuide } from "../lib/plantIdentification";

const router: IRouter = Router();

// ── Columns returned in list/detail (exclude heavy image blobs) ──────────────
const GUIDE_COLS = {
  id: careGuidesTable.id,
  userId: careGuidesTable.userId,
  plantId: careGuidesTable.plantId,
  plantName: careGuidesTable.plantName,
  targetHumidity: careGuidesTable.targetHumidity,
  startDate: careGuidesTable.startDate,
  endDate: careGuidesTable.endDate,
  status: careGuidesTable.status,
  dailyPlan: careGuidesTable.dailyPlan,
  hasImageDay1: careGuidesTable.imageDay1,   // remapped in serialise()
  hasImageDay30: careGuidesTable.imageDay30, // remapped in serialise()
  potSizeRecommendation: careGuidesTable.potSizeRecommendation,
  recommendedPotDiameter: careGuidesTable.recommendedPotDiameter,
  recommendedSoilType: careGuidesTable.recommendedSoilType,
  reminderEnabled: careGuidesTable.reminderEnabled,
  reminderTime: careGuidesTable.reminderTime,
  completedDays: careGuidesTable.completedDays,
  createdAt: careGuidesTable.createdAt,
};

// Convert the raw DB row into the API shape (images become boolean presence flags).
function serialiseGuide(row: typeof careGuidesTable.$inferSelect) {
  const { imageDay1, imageDay30, completedDays, ...rest } = row;
  return {
    ...rest,
    dailyPlan: JSON.parse(row.dailyPlan) as unknown[],
    completedDays: JSON.parse(completedDays) as number[],
    hasImageDay1: imageDay1 !== null && imageDay1 !== "",
    hasImageDay30: imageDay30 !== null && imageDay30 !== "",
  };
}

// ── GET /care-guides ──────────────────────────────────────────────────────────
router.get(
  "/care-guides",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(careGuidesTable)
      .where(eq(careGuidesTable.userId, req.user!.id))
      .orderBy(desc(careGuidesTable.createdAt));
    res.json(rows.map(serialiseGuide));
  },
);

// ── POST /care-guides ─────────────────────────────────────────────────────────
// Creates a new 30-day guide by calling the AI with the Pflanzendoc result.
router.post(
  "/care-guides",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const {
      plantId,
      plantName,
      imageDay1,
      healthScore,
      symptoms,
      duengeBiologisch,
      duegeChemisch,
    } = req.body as {
      plantId?: number | null;
      plantName: string;
      imageDay1?: string | null;
      healthScore: number;
      symptoms: string[];
      duengeBiologisch: string;
      duegeChemisch: string;
    };

    if (!plantName || typeof healthScore !== "number") {
      res.status(400).json({ error: "plantName und healthScore sind erforderlich." });
      return;
    }

    let generated: Awaited<ReturnType<typeof generateCareGuide>>;
    try {
      generated = await generateCareGuide({
        plantName,
        healthScore,
        symptoms: symptoms ?? [],
        duengeBiologisch: duengeBiologisch ?? "",
        duegeChemisch: duegeChemisch ?? "",
        imageDataUrl: imageDay1 ?? null,
      });
    } catch (err) {
      console.error("generateCareGuide failed:", err);
      res.status(503).json({ error: "Die KI-Generierung ist gerade nicht verfügbar. Bitte versuche es erneut." });
      return;
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    const [guide] = await db
      .insert(careGuidesTable)
      .values({
        userId: req.user!.id,
        plantId: plantId ?? null,
        plantName: plantName.trim(),
        targetHumidity: generated.targetHumidity,
        potSizeRecommendation: generated.potSizeRecommendation,
        recommendedPotDiameter: generated.recommendedPotDiameter,
        recommendedSoilType: generated.recommendedSoilType,
        startDate,
        endDate,
        status: "Aktiv",
        dailyPlan: JSON.stringify(generated.dailyPlan),
        imageDay1: imageDay1 ?? null,
        imageDay30: null,
      })
      .returning();

    res.status(201).json(serialiseGuide(guide));
  },
);

// ── GET /care-guides/:id ──────────────────────────────────────────────────────
router.get(
  "/care-guides/:id",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [guide] = await db
      .select()
      .from(careGuidesTable)
      .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)));
    if (!guide) {
      res.status(404).json({ error: "Pflegeguide nicht gefunden." });
      return;
    }
    res.json(serialiseGuide(guide));
  },
);

// ── GET /care-guides/:id/image/day1 ──────────────────────────────────────────
router.get(
  "/care-guides/:id/image/day1",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ imageDay1: careGuidesTable.imageDay1 })
      .from(careGuidesTable)
      .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)));
    if (!row?.imageDay1) {
      res.status(404).json({ error: "Kein Tag-1-Bild vorhanden." });
      return;
    }
    const dataUrl = row.imageDay1;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(500).json({ error: "Ungültiges Bildformat." });
      return;
    }
    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buffer);
  },
);

// ── GET /care-guides/:id/image/day30 ─────────────────────────────────────────
router.get(
  "/care-guides/:id/image/day30",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [row] = await db
      .select({ imageDay30: careGuidesTable.imageDay30 })
      .from(careGuidesTable)
      .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)));
    if (!row?.imageDay30) {
      res.status(404).json({ error: "Kein Tag-30-Bild vorhanden." });
      return;
    }
    const dataUrl = row.imageDay30;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(500).json({ error: "Ungültiges Bildformat." });
      return;
    }
    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buffer);
  },
);

// ── PATCH /care-guides/:id/day30-photo ───────────────────────────────────────
// Uploads the day-30 comparison photo and auto-completes the guide.
router.patch(
  "/care-guides/:id/day30-photo",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const { imageDay30 } = req.body as { imageDay30: string };
    if (!imageDay30) {
      res.status(400).json({ error: "imageDay30 ist erforderlich." });
      return;
    }
    const [guide] = await db
      .update(careGuidesTable)
      .set({ imageDay30, status: "Abgeschlossen" })
      .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)))
      .returning();
    if (!guide) {
      res.status(404).json({ error: "Pflegeguide nicht gefunden." });
      return;
    }
    res.json(serialiseGuide(guide));
  },
);

// ── PATCH /care-guides/:id ────────────────────────────────────────────────────
// Updates reminder settings and/or completed-days list.
router.patch(
  "/care-guides/:id",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const { reminderEnabled, reminderTime, completedDays } = req.body as {
      reminderEnabled?: boolean;
      reminderTime?: string;
      completedDays?: number[];
    };

    const updates: Partial<typeof careGuidesTable.$inferInsert> = {};
    if (typeof reminderEnabled === "boolean") updates.reminderEnabled = reminderEnabled;
    if (typeof reminderTime === "string" && /^\d{2}:\d{2}$/.test(reminderTime)) {
      updates.reminderTime = reminderTime;
    }
    let oldValidDays: number[] = [];
    if (Array.isArray(completedDays)) {
      // Fetch old value so we can compute the leaf delta.
      const [current] = await db
        .select({ completedDays: careGuidesTable.completedDays })
        .from(careGuidesTable)
        .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)));
      if (current) {
        try {
          const parsed = JSON.parse(current.completedDays ?? "[]") as number[];
          // Filter old days with the same rules as new days — avoids phantom
          // delta if the DB somehow contained out-of-range or non-integer values.
          oldValidDays = validDays(parsed);
        } catch { /* ignore */ }
      }
      const newValid = validDays(completedDays);
      updates.completedDays = JSON.stringify(newValid);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Keine gültigen Felder zum Aktualisieren." });
      return;
    }

    const [guide] = await db
      .update(careGuidesTable)
      .set(updates)
      .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)))
      .returning();

    if (!guide) {
      res.status(404).json({ error: "Pflegeguide nicht gefunden." });
      return;
    }

    // Award/deduct leaves using SET DIFFERENCE (not length difference).
    // This correctly handles: idempotent re-sends, type drift, and any case
    // where old and new lengths match but content differs.
    if (Array.isArray(completedDays)) {
      const newValid = validDays(completedDays);
      const delta = leafDelta(oldValidDays, newValid);
      if (delta !== 0) {
        await db
          .update(usersTable)
          .set({ leavesCount: sql`greatest(0, ${usersTable.leavesCount} + ${delta})` })
          .where(eq(usersTable.id, req.user!.id));
      }
    }

    const leavesEarned = Array.isArray(completedDays)
      ? leafDelta(oldValidDays, validDays(completedDays))
      : 0;
    res.json({ ...serialiseGuide(guide), leavesEarned });
  },
);

// ── POST /care-guides/backfill-leaves ────────────────────────────────────────
// Password-gated, one-time backfill: compares each user's actual completedDays
// sum against their current leavesCount and awards the shortfall.
// Run ONCE after deploying the set-difference fix; idempotent per se, but
// calling it twice on the same dataset awards 0 the second time (no double-count).
router.post(
  "/care-guides/backfill-leaves",
  async (req: Request, res: Response): Promise<void> => {
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword) {
      res.status(503).json({ error: "Backfill nicht konfiguriert." });
      return;
    }
    const provided = String(req.body?.password ?? "");
    if (!passwordMatches(provided, deletePassword)) {
      res.status(403).json({ error: "Falsches Passwort." });
      return;
    }

    // Sum completed days per user across ALL their guides.
    const guides = await db
      .select({ userId: careGuidesTable.userId, completedDays: careGuidesTable.completedDays })
      .from(careGuidesTable);

    const totalByUser = new Map<string, number>();
    for (const g of guides) {
      let days: number[] = [];
      try { days = validDays(JSON.parse(g.completedDays ?? "[]") as number[]); } catch { /* ignore */ }
      totalByUser.set(g.userId, (totalByUser.get(g.userId) ?? 0) + days.length);
    }

    // For each affected user, check current leavesCount and award the gap.
    // We compute the gap as: (total guide days) - (current leavesCount from guide days only).
    // Because leavesCount also reflects scans and task completions we cannot isolate
    // guide-day leaves exactly — instead we directly add the number of guide-day
    // completions that SHOULD have been awarded but weren't (the delta per affected user).
    // For the Yvonne case this is 3 (4 guides × 1 day each = 4, she received 1 → +3).
    // To avoid double-counting for users who DID get their leaves correctly, we
    // expose a targeted `award` endpoint below instead of applying globally here.
    const report = [];
    for (const [userId, total] of totalByUser) {
      const [user] = await db
        .select({ leavesCount: usersTable.leavesCount, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      if (user) {
        report.push({ userId, username: user.username, guideCompletedDays: total, currentLeaves: user.leavesCount });
      }
    }

    res.json({ report, message: "Bitte den Bericht prüfen und /care-guides/award-leaves für gezielte Korrekturen nutzen." });
  },
);

// ── POST /care-guides/award-leaves ────────────────────────────────────────────
// Password-gated targeted correction: awards N leaves to a specific user.
router.post(
  "/care-guides/award-leaves",
  async (req: Request, res: Response): Promise<void> => {
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword) {
      res.status(503).json({ error: "Nicht konfiguriert." });
      return;
    }
    const { password, userId, leaves } = req.body as { password?: string; userId?: string; leaves?: number };
    if (!passwordMatches(String(password ?? ""), deletePassword)) {
      res.status(403).json({ error: "Falsches Passwort." });
      return;
    }
    if (!userId || typeof leaves !== "number" || leaves <= 0 || !Number.isInteger(leaves)) {
      res.status(400).json({ error: "userId und leaves (positive integer) sind erforderlich." });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ leavesCount: sql`${usersTable.leavesCount} + ${leaves}` })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, username: usersTable.username, leavesCount: usersTable.leavesCount });
    if (!updated) {
      res.status(404).json({ error: "Nutzer nicht gefunden." });
      return;
    }
    res.json({ ...updated, awarded: leaves });
  },
);

// ── DELETE /care-guides/:id ───────────────────────────────────────────────────
router.delete(
  "/care-guides/:id",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(careGuidesTable)
      .where(and(eq(careGuidesTable.id, id), eq(careGuidesTable.userId, req.user!.id)))
      .returning({ id: careGuidesTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Pflegeguide nicht gefunden." });
      return;
    }
    res.status(204).send();
  },
);

export default router;
