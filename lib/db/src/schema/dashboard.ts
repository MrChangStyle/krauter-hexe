import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Hof-Dashboard (docs/dashboard.md): the widgets an account chose, in its
// order. No row = the default layout. Personal, goes with the account.
export const dashboardLayoutsTable = pgTable("dashboard_layouts", {
  userId: text("user_id").primaryKey(),
  widgets: jsonb("widgets").$type<string[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
