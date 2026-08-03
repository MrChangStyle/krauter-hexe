import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { plantsTable } from "./plants";

// Tracks which plants each user has marked as a favourite. The userId is stored
// as text to match usersTable.id (varchar) without introducing a circular import
// between this file, plants.ts, and auth.ts. Integrity is maintained in
// application code (requireApproved middleware guarantees req.user.id is valid).
export const favoritesTable = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    // The authenticated user who marked this plant as a favourite.
    userId: text("user_id").notNull(),
    // The plant that was marked.
    plantId: integer("plant_id")
      .notNull()
      .references(() => plantsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Each user can only favourite a plant once.
    unique("favorites_user_plant_unique").on(table.userId, table.plantId),
  ],
);

export type Favorite = typeof favoritesTable.$inferSelect;
