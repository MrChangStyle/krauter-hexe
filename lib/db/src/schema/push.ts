import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// One row per browser/device push subscription. A user can have several
// (phone, tablet, desktop). The endpoint URL is unique per subscription.
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  // The authenticated user who owns this subscription.
  userId: text("user_id").notNull(),
  // Push service endpoint URL (unique per browser subscription).
  endpoint: text("endpoint").notNull().unique(),
  // Client public key (base64url) used to encrypt the payload.
  p256dh: text("p256dh").notNull(),
  // Client auth secret (base64url).
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;

// Single-row table holding the server's VAPID key pair. Generated on first
// start so no manual secret setup is needed - dev and prod each get their own
// pair automatically.
export const webPushKeysTable = pgTable("web_push_keys", {
  id: serial("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
