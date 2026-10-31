import { check, index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { insectsTable } from "./insects";
import { plantsTable } from "./plants";

// Fundorte (docs/fundorte.md): where a species of the shared archive was found,
// for the public map. Only with the account's consent
// (user_settings.share_find_spots). Never an exact position: the app rounds to
// the centre of a ~2 km cell before sending, the server rounds again. Month
// only, no time. Personal – goes with the account and with the consent.
export const findSpotsTable = pgTable(
  "find_spots",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    plantId: integer("plant_id").references(() => plantsTable.id, { onDelete: "cascade" }),
    insectId: integer("insect_id").references(() => insectsTable.id, { onDelete: "cascade" }),
    // "p:<plantId>" or "i:<insectId>" – one plain key for the unique rule.
    speciesKey: text("species_key").notNull(),
    // The ~2 km cell (lib/findSpots.ts): row along latitude, column along longitude.
    cellRow: integer("cell_row").notNull(),
    cellCol: integer("cell_col").notNull(),
    // "YYYY-MM" of the latest find of this person in this cell.
    foundMonth: text("found_month").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One point per person, species and cell – scanning again only updates the month.
    unique("find_spots_user_species_cell_unique").on(table.userId, table.speciesKey, table.cellRow, table.cellCol),
    index("find_spots_plant_idx").on(table.plantId),
    index("find_spots_insect_idx").on(table.insectId),
    check("find_spots_one_species", sql`(${table.plantId} IS NULL) <> (${table.insectId} IS NULL)`),
  ],
);

export type FindSpot = typeof findSpotsTable.$inferSelect;
