import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Records every scan attempt that invokes the AI, regardless of whether the
// species was already known. Has NO unique constraint — the same user scanning
// the same species ten times in one day creates ten rows.
//
// Used exclusively for per-user daily rate limiting (15 attempts/day per scan
// type per Berlin day). Not used for "Meine Scans" views or leaf-counting
// (those use plant_scans / insect_scans with their unique constraints).
export const scanAttemptsTable = pgTable("scan_attempts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** "plant" for POST /plants/scan, "insect" for POST /insects/scan. */
  scanType: text("scan_type").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScanAttempt = typeof scanAttemptsTable.$inferSelect;
