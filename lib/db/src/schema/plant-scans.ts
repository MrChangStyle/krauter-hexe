import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { plantsTable } from "./plants";

// Tracks every scan event per user per plant (new additions AND duplicates).
// Used by "Meine Scans" so the view reflects all plants a user has personally
// scanned, regardless of whether they were the first to add the plant.
export const plantScansTable = pgTable(
  "plant_scans",
  {
    id: serial("id").primaryKey(),
    // The authenticated user who performed the scan.
    userId: text("user_id").notNull(),
    // The plant that was returned by the scan (new or existing archive entry).
    plantId: integer("plant_id")
      .notNull()
      .references(() => plantsTable.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One record per user/plant pair — rescanning the same plant is idempotent.
    unique("plant_scans_user_plant_unique").on(table.userId, table.plantId),
  ],
);

export type PlantScan = typeof plantScansTable.$inferSelect;
