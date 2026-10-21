import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Umzug über das Konto (docs/landingpage.md): device-only data (photos,
// scan queue) the old address hands over through the server, picked up by
// the new address after signing in and deleted then. Personal, goes with the
// account; anything left over is removed after a few days.
export const moveParcelsTable = pgTable(
  "move_parcels",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    // One MoveBatch as JSON (photos as data URLs) – checked again on unpacking.
    payload: text("payload").notNull(),
    // Photos, queue items and draft in it, for the progress bar.
    entries: integer("entries").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("move_parcels_user_idx").on(table.userId, table.id)],
);
