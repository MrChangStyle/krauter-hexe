import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Premium (docs/premium.md): the paid features – for now the AI of the Grow
// module. One row per account that has Premium. Until there are payments the
// owner grants it by hand (source "manual"); a payment provider will later
// write rows with its plan (monthly | yearly) and the end of the paid period.
export const premiumTable = pgTable("premium", {
  userId: text("user_id").primaryKey(),
  // manual | (later) the payment provider
  source: text("source").notNull().default("manual"),
  // monthly | yearly once paid; null when granted by hand
  plan: text("plan"),
  // End of Premium; null = no end.
  activeUntil: timestamp("active_until", { withTimezone: true }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});
