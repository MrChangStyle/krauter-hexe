import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { eq, and, desc, sql, isNotNull, count } from "drizzle-orm";
import { db, tasksTable, usersTable } from "@workspace/db";
import { requireApproved } from "../middlewares/requireApproved";
import { createHash, timingSafeEqual } from "crypto";

function passwordMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const router: IRouter = Router();

// ── GET /tasks ────────────────────────────────────────────────────────────────
// Returns all tasks for the current user, newest first.
router.get(
  "/tasks",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.userId, req.user!.id))
      .orderBy(desc(tasksTable.createdAt));
    res.json(tasks);
  },
);

// ── POST /tasks ───────────────────────────────────────────────────────────────
// Create a new task for the current user.
router.post(
  "/tasks",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const {
      plantId,
      actionType,
      intervalValue,
      intervalUnit,
      reminderTime,
      fertilizerType,
      fertilizerCustomName,
    } = req.body as {
      plantId: number;
      actionType: string;
      intervalValue: number;
      intervalUnit: string;
      reminderTime: string;
      fertilizerType?: string;
      fertilizerCustomName?: string;
    };

    if (
      !plantId ||
      !actionType ||
      !intervalValue ||
      !intervalUnit ||
      !reminderTime
    ) {
      res.status(400).json({ error: "Alle Felder sind erforderlich." });
      return;
    }

    const VALID_ACTIONS = ["Gießen", "Besprühen", "Düngen", "Pflanze drehen"];
    const VALID_UNITS = ["Tage", "Wochen", "Monate"];
    const VALID_FERTILIZER_TYPES = ["Biologischer Dünger", "Mineralischer Dünger", "Manuell"];
    if (!VALID_ACTIONS.includes(actionType)) {
      res.status(400).json({ error: "Ungültiger Aufgabentyp." });
      return;
    }
    if (!VALID_UNITS.includes(intervalUnit)) {
      res.status(400).json({ error: "Ungültige Intervall-Einheit." });
      return;
    }
    if (intervalValue < 1 || intervalValue > 60) {
      res.status(400).json({ error: "Intervall muss zwischen 1 und 60 liegen." });
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(reminderTime)) {
      res.status(400).json({ error: "Erinnerungszeit muss im Format HH:MM sein." });
      return;
    }
    if (fertilizerType && !VALID_FERTILIZER_TYPES.includes(fertilizerType)) {
      res.status(400).json({ error: "Ungültige Düngerart." });
      return;
    }

    // fertilizerType / fertilizerCustomName only stored for "Düngen" tasks
    const resolvedFertilizerType =
      actionType === "Düngen" && fertilizerType
        ? (fertilizerType as "Biologischer Dünger" | "Mineralischer Dünger" | "Manuell")
        : null;
    const resolvedFertilizerCustomName =
      resolvedFertilizerType === "Manuell" ? (fertilizerCustomName ?? null) : null;

    const [task] = await db
      .insert(tasksTable)
      .values({
        userId: req.user!.id,
        plantId: Number(plantId),
        actionType: actionType as "Gießen" | "Besprühen" | "Düngen" | "Pflanze drehen",
        intervalValue: Number(intervalValue),
        intervalUnit: intervalUnit as "Tage" | "Wochen" | "Monate",
        reminderTime,
        isActive: true,
        fertilizerType: resolvedFertilizerType,
        fertilizerCustomName: resolvedFertilizerCustomName,
      })
      .returning();

    res.status(201).json(task);
  },
);

// ── PATCH /tasks/:id ─────────────────────────────────────────────────────────
// Update a task's editable fields (all optional).
router.patch(
  "/tasks/:id",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const {
      actionType,
      intervalValue,
      intervalUnit,
      reminderTime,
      fertilizerType,
      fertilizerCustomName,
    } = req.body as {
      actionType?: string;
      intervalValue?: number;
      intervalUnit?: string;
      reminderTime?: string;
      fertilizerType?: string | null;
      fertilizerCustomName?: string | null;
    };

    const VALID_ACTIONS = ["Gießen", "Besprühen", "Düngen", "Pflanze drehen"];
    const VALID_UNITS = ["Tage", "Wochen", "Monate"];
    const VALID_FERTILIZER_TYPES = ["Biologischer Dünger", "Mineralischer Dünger", "Manuell"];

    if (actionType !== undefined && !VALID_ACTIONS.includes(actionType)) {
      res.status(400).json({ error: "Ungültiger Aufgabentyp." });
      return;
    }
    if (intervalUnit !== undefined && !VALID_UNITS.includes(intervalUnit)) {
      res.status(400).json({ error: "Ungültige Intervall-Einheit." });
      return;
    }
    if (intervalValue !== undefined && (intervalValue < 1 || intervalValue > 60)) {
      res.status(400).json({ error: "Intervall muss zwischen 1 und 60 liegen." });
      return;
    }
    if (reminderTime !== undefined && !/^\d{2}:\d{2}$/.test(reminderTime)) {
      res.status(400).json({ error: "Erinnerungszeit muss im Format HH:MM sein." });
      return;
    }
    if (fertilizerType && !VALID_FERTILIZER_TYPES.includes(fertilizerType)) {
      res.status(400).json({ error: "Ungültige Düngerart." });
      return;
    }

    // Determine effective actionType (may not be changing).
    const effectiveActionType = actionType;

    // Resolve fertilizer fields: clear them if actionType is switching away from Düngen.
    const resolvedFertilizerType =
      effectiveActionType !== undefined && effectiveActionType !== "Düngen"
        ? null
        : fertilizerType !== undefined
          ? (fertilizerType as "Biologischer Dünger" | "Mineralischer Dünger" | "Manuell" | null)
          : undefined; // undefined = don't touch the column

    const resolvedFertilizerCustomName =
      resolvedFertilizerType === null
        ? null
        : resolvedFertilizerType === "Manuell"
          ? (fertilizerCustomName ?? null)
          : resolvedFertilizerType !== undefined
            ? null // switched to non-manual preset → clear custom name
            : undefined; // don't touch

    // Build the update patch (only include keys that were provided).
    const patch: Record<string, unknown> = {};
    if (actionType !== undefined) patch.actionType = actionType;
    if (intervalValue !== undefined) patch.intervalValue = Number(intervalValue);
    if (intervalUnit !== undefined) patch.intervalUnit = intervalUnit;
    if (reminderTime !== undefined) patch.reminderTime = reminderTime;
    if (resolvedFertilizerType !== undefined) patch.fertilizerType = resolvedFertilizerType;
    if (resolvedFertilizerCustomName !== undefined) patch.fertilizerCustomName = resolvedFertilizerCustomName;

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Keine Felder zum Aktualisieren angegeben." });
      return;
    }

    const [task] = await db
      .update(tasksTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(patch as any)
      .where(and(eq(tasksTable.id, id), eq(tasksTable.userId, req.user!.id)))
      .returning();

    if (!task) {
      res.status(404).json({ error: "Aufgabe nicht gefunden." });
      return;
    }

    res.json(task);
  },
);

// ── PATCH /tasks/:id/complete ─────────────────────────────────────────────────
// Mark a task as done (updates lastCompletedAt) and awards 1 leaf.
router.patch(
  "/tasks/:id/complete",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [task] = await db
      .update(tasksTable)
      .set({ lastCompletedAt: new Date() })
      .where(
        and(eq(tasksTable.id, id), eq(tasksTable.userId, req.user!.id)),
      )
      .returning();

    if (!task) {
      res.status(404).json({ error: "Aufgabe nicht gefunden." });
      return;
    }

    // Award 1 leaf for completing a task.
    await db
      .update(usersTable)
      .set({ leavesCount: sql`${usersTable.leavesCount} + 1` })
      .where(eq(usersTable.id, req.user!.id));

    res.json(task);
  },
);

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────
// Permanently delete a task.
router.delete(
  "/tasks/:id",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(tasksTable)
      .where(
        and(eq(tasksTable.id, id), eq(tasksTable.userId, req.user!.id)),
      )
      .returning({ id: tasksTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Aufgabe nicht gefunden." });
      return;
    }

    res.status(204).send();
  },
);

// ── POST /tasks/backfill-leaves ───────────────────────────────────────────────
// One-time, password-gated backfill: awards 1 leaf per completed task
// (lastCompletedAt IS NOT NULL) that pre-dates the leaf-per-task feature.
// Safe to call only ONCE — running it again would double-count.
router.post(
  "/tasks/backfill-leaves",
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

    // Count completed tasks (lastCompletedAt IS NOT NULL) grouped by userId.
    const rows = await db
      .select({ userId: tasksTable.userId, completedCount: count() })
      .from(tasksTable)
      .where(isNotNull(tasksTable.lastCompletedAt))
      .groupBy(tasksTable.userId);

    if (rows.length === 0) {
      res.json({ updated: 0, message: "Keine abgeschlossenen Aufgaben gefunden." });
      return;
    }

    // Award leaves for each user in a single batch.
    let updated = 0;
    for (const { userId, completedCount } of rows) {
      await db
        .update(usersTable)
        .set({ leavesCount: sql`${usersTable.leavesCount} + ${completedCount}` })
        .where(eq(usersTable.id, userId));
      updated++;
    }

    res.json({
      updated,
      message: `${updated} Nutzer aktualisiert. Bitte diesen Endpoint nicht erneut aufrufen.`,
    });
  },
);

export default router;
