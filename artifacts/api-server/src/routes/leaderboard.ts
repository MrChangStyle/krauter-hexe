import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  db,
  usersTable,
  plantScansTable,
  insectScansTable,
  plantsTable,
  insectsTable,
  careGuidesTable,
  tasksTable,
} from "@workspace/db";
import { desc, eq, sql, count, isNotNull } from "drizzle-orm";
import { requireApproved } from "../middlewares/requireApproved";
import { createHash, timingSafeEqual } from "crypto";

function passwordMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const router: IRouter = Router();

// ── GET /leaderboard ─────────────────────────────────────────────────────────
// Returns the top 50 users by leavesCount, plus the caller's own entry
// (with rank) even when they are outside the top 50.
// Only users who have chosen a username are included.
router.get(
  "/leaderboard",
  requireApproved,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    // Compute ranks via a CTE so we can slice and look up the own row cheaply.
    const rows = await db
      .select({
        rank: sql<number>`rank() over (order by ${usersTable.leavesCount} desc)`.as("rank"),
        userId: usersTable.id,
        username: usersTable.username,
        leavesCount: usersTable.leavesCount,
      })
      .from(usersTable)
      .where(sql`${usersTable.username} is not null`)
      .orderBy(desc(usersTable.leavesCount));

    const top = rows.slice(0, 50).map((r) => ({
      rank: Number(r.rank),
      userId: r.userId,
      username: r.username!,
      leavesCount: r.leavesCount,
      isCurrentUser: r.userId === userId,
    }));

    const ownRow = rows.find((r) => r.userId === userId);
    const own = ownRow
      ? {
          rank: Number(ownRow.rank),
          userId: ownRow.userId,
          username: ownRow.username!,
          leavesCount: ownRow.leavesCount,
          isCurrentUser: true,
        }
      : null;

    res.json({ top, own });
  },
);

// ── POST /leaderboard/recount-leaves ─────────────────────────────────────────
// Password-gated, IDEMPOTENT full recount: sets every user's leavesCount to the
// sum of all point sources computed directly from the database:
//   + 1 per plant scan   (plant_scans row)
//   + 1 per insect scan  (insect_scans row)
//   + 1 per completed care-guide day (completedDays entries)
//   + 1 per completed task (lastCompletedAt IS NOT NULL)
// Safe to call any number of times — it recomputes from scratch instead of
// adding on top, so already-performed scans count exactly once.
router.post(
  "/leaderboard/recount-leaves",
  async (req: Request, res: Response): Promise<void> => {
    const deletePassword = process.env.DELETE_PASSWORD;
    if (!deletePassword) {
      res.status(503).json({ error: "Nicht konfiguriert." });
      return;
    }
    if (!passwordMatches(String(req.body?.password ?? ""), deletePassword)) {
      res.status(403).json({ error: "Falsches Passwort." });
      return;
    }

    // Backfill: older scans were only recorded via plants.scannedByUserId /
    // insects.scannedByUserId (before the scan tables existed). Insert the
    // missing scan rows first so they count as points AND appear in
    // "Meine Scans". onConflictDoNothing keeps this idempotent.
    const oldPlantScans = await db
      .select({ userId: plantsTable.scannedByUserId, plantId: plantsTable.id })
      .from(plantsTable)
      .where(isNotNull(plantsTable.scannedByUserId));
    for (const r of oldPlantScans) {
      await db
        .insert(plantScansTable)
        .values({ userId: r.userId!, plantId: r.plantId })
        .onConflictDoNothing();
    }

    const oldInsectScans = await db
      .select({ userId: insectsTable.scannedByUserId, insectId: insectsTable.id })
      .from(insectsTable)
      .where(isNotNull(insectsTable.scannedByUserId));
    for (const r of oldInsectScans) {
      await db
        .insert(insectScansTable)
        .values({ userId: r.userId!, insectId: r.insectId })
        .onConflictDoNothing();
    }

    // 1 leaf per plant scan.
    const plantRows = await db
      .select({ userId: plantScansTable.userId, n: count() })
      .from(plantScansTable)
      .groupBy(plantScansTable.userId);

    // 1 leaf per insect scan.
    const insectRows = await db
      .select({ userId: insectScansTable.userId, n: count() })
      .from(insectScansTable)
      .groupBy(insectScansTable.userId);

    // 1 leaf per completed care-guide day.
    const guideRows = await db
      .select({ userId: careGuidesTable.userId, completedDays: careGuidesTable.completedDays })
      .from(careGuidesTable);

    // 1 leaf per completed task.
    const taskRows = await db
      .select({ userId: tasksTable.userId, n: count() })
      .from(tasksTable)
      .where(isNotNull(tasksTable.lastCompletedAt))
      .groupBy(tasksTable.userId);

    const totals = new Map<string, number>();
    const add = (userId: string, n: number) =>
      totals.set(userId, (totals.get(userId) ?? 0) + n);

    for (const r of plantRows) add(r.userId, Number(r.n));
    for (const r of insectRows) add(r.userId, Number(r.n));
    for (const r of taskRows) add(r.userId, Number(r.n));
    for (const g of guideRows) {
      try {
        const days = (JSON.parse(g.completedDays ?? "[]") as number[]).filter(
          (d) => Number.isInteger(d) && d >= 1 && d <= 30,
        );
        add(g.userId, new Set(days).size);
      } catch { /* ignore malformed rows */ }
    }

    // Apply: set (not add) each user's leavesCount. Users without any points
    // are reset to 0 as well, so the leaderboard is fully consistent.
    const allUsers = await db
      .select({ id: usersTable.id, username: usersTable.username, leavesCount: usersTable.leavesCount })
      .from(usersTable);

    const report = [];
    for (const u of allUsers) {
      const target = totals.get(u.id) ?? 0;
      if (target !== u.leavesCount) {
        await db
          .update(usersTable)
          .set({ leavesCount: target })
          .where(eq(usersTable.id, u.id));
      }
      report.push({
        userId: u.id,
        username: u.username,
        before: u.leavesCount,
        after: target,
      });
    }

    res.json({
      updated: report.filter((r) => r.before !== r.after).length,
      report,
    });
  },
);

export default router;
