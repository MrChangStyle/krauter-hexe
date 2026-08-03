import { Router } from "express";
import { logger } from "../lib/logger";
import { triggerDueNotifications } from "../lib/pushScheduler";

const router = Router();

/**
 * POST /cron/trigger-notifications
 *
 * Stateless endpoint called by an external scheduler (e.g. cron-job.org)
 * once per minute. Evaluates all due task- and care-guide push reminders in
 * Europe/Berlin time and sends them, then returns the count of notifications
 * dispatched.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Returns 401 for missing/invalid token, 503 when CRON_SECRET is not set.
 */
router.post("/cron/trigger-notifications", async (req, res) => {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    logger.warn("CRON_SECRET is not set — cron endpoint is disabled");
    res.status(503).json({ error: "Cron endpoint not configured" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const triggered = await triggerDueNotifications();
    logger.info({ triggered }, "Cron: trigger-notifications completed");
    res.json({ triggered });
  } catch (err) {
    logger.error({ err }, "Cron: trigger-notifications failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
