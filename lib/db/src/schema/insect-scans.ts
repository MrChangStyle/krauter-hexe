import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { insectsTable } from "./insects";

// Tracks every scan event per user per insect species (new additions AND
// duplicates). Used by "Meine Insekten" so the view reflects all insects a
// user has personally scanned, regardless of who first added the species.
export const insectScansTable = pgTable(
  "insect_scans",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    insectId: integer("insect_id")
      .notNull()
      .references(() => insectsTable.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("insect_scans_user_insect_unique").on(table.userId, table.insectId),
  ],
);

export type InsectScan = typeof insectScansTable.$inferSelect;
