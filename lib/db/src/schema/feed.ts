import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { farmAnimalsTable, farmsTable, herdsTable } from "./farm";
import { usersTable } from "./auth";

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

// Vorrat (Futterplaner step 4): how much of a feed was on hand on a day –
// set when counting, raised by a purchase. What is left today is computed
// from the daily use of the rations. Price per kg from the last purchase.
export const feedStocksTable = pgTable(
  "feed_stocks",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // A catalog feed (key) or an own feed (id).
    feedKey: text("feed_key"),
    feedId: integer("feed_id").references(() => farmFeedsTable.id, { onDelete: "cascade" }),
    stockKg: doublePrecision("stock_kg").notNull(),
    countedOn: date("counted_on", { mode: "string" }).notNull(),
    packageKg: doublePrecision("package_kg"),
    pricePerKg: doublePrecision("price_per_kg"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feed_stocks_farm_idx").on(table.farmId),
    uniqueIndex("feed_stocks_farm_key_unique").on(table.farmId, table.feedKey).where(sql`${table.feedKey} IS NOT NULL`),
    uniqueIndex("feed_stocks_feed_unique").on(table.feedId).where(sql`${table.feedId} IS NOT NULL`),
  ],
);

// Bio (docs/bio.md): where a feed of the farm comes from – organic, from a
// farm in conversion or conventional, and whether it grows on the farm itself
// or in the region. Only asked on organic farms; a feed without a row counts
// as not stated.
export const feedOriginsTable = pgTable(
  "feed_origins",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // A catalog feed (key) or an own feed (id).
    feedKey: text("feed_key"),
    feedId: integer("feed_id").references(() => farmFeedsTable.id, { onDelete: "cascade" }),
    // "organic", "conversion" or "conventional".
    organic: text("organic").notNull(),
    ownFarm: boolean("own_farm").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("feed_origins_farm_idx").on(table.farmId),
    uniqueIndex("feed_origins_farm_key_unique").on(table.farmId, table.feedKey).where(sql`${table.feedKey} IS NOT NULL`),
    uniqueIndex("feed_origins_feed_unique").on(table.feedId).where(sql`${table.feedId} IS NOT NULL`),
  ],
);

/** One ingredient of a recipe, as the author wrote it. */
export interface RecipeIngredientJson {
  name: string;
  amount: string;
}

// Rezepte (Futterplaner step 5) sent in by users. Shown to everyone only after
// the app owner approved them; the built-in recipes live in the code.
export const feedRecipesTable = pgTable(
  "feed_recipes",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    species: jsonb("species").$type<string[]>().notNull(),
    kind: text("kind").notNull(),
    ingredients: jsonb("ingredients").$type<RecipeIngredientJson[]>().notNull(),
    steps: jsonb("steps").$type<string[]>().notNull(),
    hygiene: jsonb("hygiene").$type<string[]>().notNull(),
    // "pending", "approved" or "rejected".
    status: text("status").notNull().default("pending"),
    authorId: text("author_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [index("feed_recipes_status_idx").on(table.status)],
);

// One "Futter nachkaufen" push per farm and day, like the garden digest.
export const feedDigestLogTable = pgTable(
  "feed_digest_log",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.day] })],
);
