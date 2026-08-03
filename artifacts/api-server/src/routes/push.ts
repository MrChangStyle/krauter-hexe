import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import {
  SubscribePushBody,
  UnsubscribePushBody,
  GetPushPublicKeyResponse,
  SendTestPushResponse,
} from "@workspace/api-zod";
import { requireApproved } from "../middlewares/requireApproved";
import { ensureWebPushReady, sendPushToUser } from "../lib/webPush";

const router: IRouter = Router();

// The VAPID public key the browser needs to create a push subscription.
router.get("/push/public-key", requireApproved, async (_req, res) => {
  const publicKey = await ensureWebPushReady();
  res.json(GetPushPublicKeyResponse.parse({ publicKey }));
});

// Store (or refresh) this browser's push subscription for the current user.
router.post("/push/subscribe", requireApproved, async (req, res) => {
  const parsed = SubscribePushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { endpoint, keys } = parsed.data;
  await db
    .insert(pushSubscriptionsTable)
    .values({
      userId: req.user!.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: req.user!.id, p256dh: keys.p256dh, auth: keys.auth },
    });
  res.sendStatus(204);
});

// Remove a subscription (user turned notifications off on this device).
router.post("/push/unsubscribe", requireApproved, async (req, res) => {
  const parsed = UnsubscribePushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.endpoint, parsed.data.endpoint),
        eq(pushSubscriptionsTable.userId, req.user!.id),
      ),
    );
  res.sendStatus(204);
});

// Send a test notification to all of the user's devices so they can verify
// that pushes technically arrive on this device.
router.post("/push/test", requireApproved, async (req, res) => {
  const sent = await sendPushToUser(req.user!.id, {
    title: "Test-Benachrichtigung",
    body: "Benachrichtigungen funktionieren auf diesem Gerät! 🌱",
    tag: "test-notification",
    url: "/benutzer",
  });
  res.json(SendTestPushResponse.parse({ sent }));
});

export default router;
