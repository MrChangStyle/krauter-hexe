import { boolean, date, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// What an account set up for itself (docs/module.md): the modules it hides
// and when it went through the first-start assistant. No row = everything
// visible, assistant not done yet. Personal, goes with the account.
export const userSettingsTable = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  hiddenModules: jsonb("hidden_modules").$type<string[]>().notNull().default([]),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Benachrichtigungen (docs/benachrichtigungen.md): push topics switched off,
  // and a quiet time "HH:MM"–"HH:MM" (Berlin) without pushes; null = none.
  pushOff: jsonb("push_off").$type<string[]>().notNull().default([]),
  quietStart: text("quiet_start"),
  quietEnd: text("quiet_end"),
  // Wetterabhängige Pflege (docs/pflege-wetter.md): longer watering intervals
  // and no fertilising in winter; the last "frost in sight" push.
  seasonalCare: boolean("seasonal_care").notNull().default(true),
  frostNoticeOn: date("frost_notice_on", { mode: "string" }),
  // Bio (docs/bio.md): only organic advice in Pflanzendoc and Pflege-Guide,
  // for accounts without a farm that farms naturally or organically.
  organicTips: boolean("organic_tips").notNull().default(false),
  // Meine Tierarten (docs/module.md): animal kinds hidden in "Essbar für" and
  // the Kräuter-Hexe; empty = every kind shows.
  hiddenAnimals: jsonb("hidden_animals").$type<string[]>().notNull().default([]),
});
