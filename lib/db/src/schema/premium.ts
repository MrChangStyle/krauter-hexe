import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Premium (docs/premium.md): the paid features – for now the AI of the Grow
// module. One row per account that has Premium. Until there are payments the
// owner grants it by hand (source "manual"); a payment provider will later
// write rows with its plan (monthly | yearly) and the end of the paid period.
export const premiumTable = pgTable("premium", {
  userId: text("user_id").primaryKey(),
  // manual | stripe | mock (the test checkout, docs/bezahlung.md)
  source: text("source").notNull().default("manual"),
  // monthly | yearly once paid; null when granted by hand
  plan: text("plan"),
  // Paket: lite | premium (sets the daily AI limit); hand grants are premium.
  tier: text("tier").notNull().default("premium"),
  // The payment provider's customer and subscription, for the portal and
  // the cancel button; null for hand grants.
  customerId: text("customer_id"),
  subscriptionId: text("subscription_id"),
  // Cancelled: runs until activeUntil, then ends.
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // End of Premium; null = no end.
  activeUntil: timestamp("active_until", { withTimezone: true }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});
