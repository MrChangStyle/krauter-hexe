import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { farmsTable, medicinesTable } from "./farm";

// Bienen (docs/bienen.md): the farm's colonies with their hive card –
// inspections, feedings and Varroa checks and treatments. Honey goes into
// farm_yields (product "honey", colony_id), so Ertrag & Bilanz counts it.

export const BEE_COLONY_STATUSES = ["active", "dissolved", "lost", "sold"] as const;
export type BeeColonyStatus = (typeof BEE_COLONY_STATUSES)[number];

export const BEE_FEED_KINDS = ["sirup", "zuckerwasser", "futterteig", "honig", "sonstiges"] as const;
export type BeeFeedKind = (typeof BEE_FEED_KINDS)[number];

export const VARROA_METHODS = ["ameisensaeure", "oxalsaeure", "milchsaeure", "thymol", "drohnenbrut", "sonstiges"] as const;
export type VarroaMethod = (typeof VARROA_METHODS)[number];

export const beeColoniesTable = pgTable(
  "bee_colonies",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Bienenstand – where the hive stands, in the beekeeper's own words.
    apiary: text("apiary"),
    // A photo of where the hive stands (Cloudinary URL).
    photoUrl: text("photo_url"),
    hiveType: text("hive_type"),
    queenYear: integer("queen_year"),
    queenMarked: boolean("queen_marked").notNull().default(false),
    queenOrigin: text("queen_origin"),
    status: text("status").$type<BeeColonyStatus>().notNull().default("active"),
    startedOn: date("started_on", { mode: "string" }),
    endedOn: date("ended_on", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bee_colonies_farm_idx").on(table.farmId)],
);

export const beeInspectionsTable = pgTable(
  "bee_inspections",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    colonyId: integer("colony_id")
      .notNull()
      .references(() => beeColoniesTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    // Volksstärke: frames covered with bees; brood frames.
    beeFrames: integer("bee_frames"),
    broodFrames: integer("brood_frames"),
    queenSeen: boolean("queen_seen").notNull().default(false),
    eggsSeen: boolean("eggs_seen").notNull().default(false),
    // Weiselzellen – a sign of swarming.
    queenCells: integer("queen_cells"),
    // Sanftmut 1 (very gentle) to 4 (aggressive).
    temper: integer("temper"),
    foodKg: doublePrecision("food_kg"),
    // Varroa check: mites fallen per day (bottom board).
    mitesPerDay: doublePrecision("mites_per_day"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bee_inspections_colony_idx").on(table.colonyId, table.date)],
);

export const beeFeedingsTable = pgTable(
  "bee_feedings",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    colonyId: integer("colony_id")
      .notNull()
      .references(() => beeColoniesTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    kind: text("kind").$type<BeeFeedKind>().notNull(),
    amountKg: doublePrecision("amount_kg").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bee_feedings_colony_idx").on(table.colonyId, table.date)],
);

// Varroa treatments – the Bestandsbuch for the medicines used on bees.
export const beeTreatmentsTable = pgTable(
  "bee_treatments",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    colonyId: integer("colony_id")
      .notNull()
      .references(() => beeColoniesTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    method: text("method").$type<VarroaMethod>().notNull(),
    // From the Arzneimittel-Vorrat: the dose is taken off its stock.
    medicineId: integer("medicine_id").references(() => medicinesTable.id, { onDelete: "set null" }),
    product: text("product"),
    dose: doublePrecision("dose"),
    unit: text("unit"),
    batch: text("batch"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bee_treatments_colony_idx").on(table.colonyId, table.date)],
);

/** What the AI says about a Bienenstand on a photo (lib/beeSite.ts). */
export interface BeeSiteAnalysis {
  /** One sentence on the whole stand. */
  overall: string;
  /** Flight entrance, sun in the morning, shade at noon. */
  orientation: string;
  /** Wind and weather: hedges, walls, open field. */
  shelter: string;
  /** Plants around: forage through the year, water. */
  forage: string;
  /** Damp ground, hollows, wetland, height of the hive stand. */
  moisture: string;
  /** Paths, neighbours, flight path. */
  neighbours: string;
  tips: string[];
}

// Standort-Check: a photo of a Bienenstand looked at by the AI – kept so the
// beekeeper can come back to it. Not tied to a colony.
export const beeSiteChecksTable = pgTable(
  "bee_site_checks",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    apiary: text("apiary"),
    // Null when the photo could not be stored; the analysis stays.
    photoUrl: text("photo_url"),
    // Where the camera looked (0–360°, from the phone's compass), if known.
    heading: integer("heading"),
    question: text("question"),
    analysis: jsonb("analysis").$type<BeeSiteAnalysis>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bee_site_checks_farm_idx").on(table.farmId, table.createdAt)],
);

