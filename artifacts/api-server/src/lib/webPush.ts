import webpush, { type PushSubscription as WebPushSubscription } from "web-push";
import { eq } from "drizzle-orm";
import {
  db,
  pushSubscriptionsTable,
  webPushKeysTable,
  type PushSubscription,
} from "@workspace/db";
import { logger } from "./logger";

// The VAPID key pair is generated once on first start and persisted in the
// database, so dev and prod each get their own pair with no manual secret
// setup. Cached here after the first load.
let vapidPublicKey: string | null = null;
let initPromise: Promise<string> | null = null;

export async function ensureWebPushReady(): Promise<string> {
  if (vapidPublicKey) return vapidPublicKey;
  if (!initPromise) {
    initPromise = (async () => {
      let [keys] = await db.select().from(webPushKeysTable).limit(1);
      if (!keys) {
        const generated = webpush.generateVAPIDKeys();
        [keys] = await db
          .insert(webPushKeysTable)
          .values({
            publicKey: generated.publicKey,
            privateKey: generated.privateKey,
          })
          .returning();
        logger.info("Generated new VAPID key pair for web push");
      }
      webpush.setVapidDetails(
        "mailto:noreply@replit.app",
        keys!.publicKey,
        keys!.privateKey,
      );
      vapidPublicKey = keys!.publicKey;
      return vapidPublicKey;
    })();
    // Allow a retry on failure instead of caching a rejected promise forever.
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

// Sends a payload to one stored subscription. Deletes the subscription when
// the push service reports it is gone (404/410), so dead devices don't
// accumulate. Returns true when the push was accepted.
export async function sendPushTo(
  sub: PushSubscription,
  payload: PushPayload,
): Promise<boolean> {
  await ensureWebPushReady();
  const target: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    await webpush.sendNotification(target, JSON.stringify(payload));
    return true;
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription expired or was revoked on the device - clean it up.
      await db
        .delete(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.id, sub.id));
      logger.info({ endpoint: sub.endpoint }, "Removed expired push subscription");
    } else {
      logger.warn({ err, statusCode }, "Failed to send push notification");
    }
    return false;
  }
}

// Sends a payload to every device of one user. Returns how many pushes were
// accepted by the push services.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<number> {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));
  let sent = 0;
  for (const sub of subs) {
    if (await sendPushTo(sub, payload)) sent++;
  }
  return sent;
}
