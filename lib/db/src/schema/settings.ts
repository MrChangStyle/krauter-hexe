import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// What an account set up for itself (docs/module.md): the modules it hides
// and when it went through the first-start assistant. No row = everything
// visible, assistant not done yet. Personal, goes with the account.
export const userSettingsTable = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  hiddenModules: jsonb("hidden_modules").$type<string[]>().notNull().default([]),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
