import { date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { farmAnimalsTable, farmsTable, herdsTable } from "./farm";

// Futterplaner (docs/futterplaner.md). Farm data like the animals: private to
// the members, every access through requireFarm(), every query by farm_id.
// The common feeds are a fixed list in the API server (lib/feedCatalog.ts);
// only a farm's own feeds (from a label) are stored.

/** Nutrients per kg dry matter, as in lib/feedCatalog.ts (FeedValues). */
export interface FeedValuesJson {
  dryMatter: number;
  crudeProtein: number;
  crudeFat: number;
  crudeFibre: number;
  calcium: number;
  phosphorus: number;
  copper: number | null;
}

export const farmFeedsTable = pgTable(
  "farm_feeds",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    values: jsonb("values").$type<FeedValuesJson>().notNull(),
    // Mineral feed made for these species (others get a warning).
    forSpecies: jsonb("for_species").$type<string[]>(),
    botanicalName: text("botanical_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Additives as printed on the label (Futterplaner step 2).
    additives: jsonb("additives").$type<string[]>(),
  },
  (table) => [index("farm_feeds_farm_idx").on(table.farmId)],
);

/** One feed of a ration: a catalog feed (key) or an own feed (id), grams as fed per animal and day. */
export interface RationItemJson {
  feedKey?: string;
  feedId?: number;
  grams: number;
}

// The daily ration of one animal or of a herd (per animal of the herd).
export const feedRationsTable = pgTable(
  "feed_rations",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id").references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    items: jsonb("items").$type<RationItemJson[]>().notNull(),
    times: jsonb("times").$type<string[]>().notNull(),
    // Water actually offered per animal and day (l); null = not entered.
    waterL: doublePrecision("water_l"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Fütterungsplan (step 3): "all", "summer" (Apr–Oct) or "winter" (Nov–Mar).
    season: text("season").notNull().default("all"),
    // A change of feed is spread over some days: the ration before, and when
    // and over how many days the change runs. Null = no change running.
    previousItems: jsonb("previous_items").$type<RationItemJson[]>(),
    changeStartedOn: date("change_started_on", { mode: "string" }),
    changeDays: integer("change_days"),
  },
  (table) => [
    index("feed_rations_farm_idx").on(table.farmId),
    uniqueIndex("feed_rations_animal_season_unique").on(table.animalId, table.season).where(sql`${table.animalId} IS NOT NULL`),
    uniqueIndex("feed_rations_herd_season_unique").on(table.herdId, table.season).where(sql`${table.herdId} IS NOT NULL`),
  ],
);
