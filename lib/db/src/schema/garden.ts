import { doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { farmsTable } from "./farm";
import { plantsTable } from "./plants";
import { usersTable } from "./auth";

// Beet-Architekt (docs/beet-architekt.md). Beds belong to a farm and follow
// its rules: private to the members, every access through requireFarm(),
// every query filtered by farm_id.
//
// The tables are created at server start by lib/schemaUpgrade.ts – keep both
// in sync (gardenSchemaStatements.ts is generated from this file).

export const BED_TYPES = ["raised", "bed", "greenhouse", "coldframe", "container"] as const;
export type BedType = (typeof BED_TYPES)[number];

export const BED_ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type BedOrientation = (typeof BED_ORIENTATIONS)[number];

export const WIND_PROTECTIONS = ["none", "partial", "good"] as const;
export type WindProtection = (typeof WIND_PROTECTIONS)[number];

/** Result of the finger test (Fingerprobe). */
export const SOIL_TEXTURES = ["sandy", "loamy", "clay"] as const;
export type SoilTexture = (typeof SOIL_TEXTURES)[number];

/** Where a bed's frost dates come from. */
export const FROST_SOURCES = ["default", "climate", "manual"] as const;
export type FrostSource = (typeof FROST_SOURCES)[number];

export const bedTypeEnum = pgEnum("bed_type", BED_TYPES);
export const bedOrientationEnum = pgEnum("bed_orientation", BED_ORIENTATIONS);
export const windProtectionEnum = pgEnum("wind_protection", WIND_PROTECTIONS);
export const soilTextureEnum = pgEnum("soil_texture", SOIL_TEXTURES);
export const frostSourceEnum = pgEnum("frost_source", FROST_SOURCES);

export const gardenBedsTable = pgTable(
  "garden_beds",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: bedTypeEnum("type").notNull(),
    // Entered by the user – a photo never measures.
    lengthCm: integer("length_cm").notNull(),
    widthCm: integer("width_cm").notNull(),
    heightCm: integer("height_cm"),
    postalCode: text("postal_code"),
    // Rounded to 0.1° (about 10 km): enough for weather, no exact address.
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    sunHours: integer("sun_hours"),
    orientation: bedOrientationEnum("orientation"),
    windProtection: windProtectionEnum("wind_protection"),
    soilTexture: soilTextureEnum("soil_texture"),
    soilPh: doublePrecision("soil_ph"),
    // MM-DD: typical last frost in spring and first frost in autumn.
    lastFrost: text("last_frost").notNull().default("05-15"),
    firstFrost: text("first_frost").notNull().default("10-15"),
    frostSource: frostSourceEnum("frost_source").notNull().default("default"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Foto mit Pflanzraster (step 3): Cloudinary URL, compass heading of the
    // phone when the photo was chosen (0–360°, null when unknown) and the four
    // bed corners on the photo (0–1 of width/height, in grid order: start of
    // the grid, along the length, opposite, along the width).
    photoUrl: text("photo_url"),
    photoHeading: integer("photo_heading"),
    photoCorners: jsonb("photo_corners").$type<{ x: number; y: number }[]>(),
    // KI (step 5): the latest AI look at the photo (shade, soil, weeds, tips);
    // cleared with a new photo.
    photoAnalysis: jsonb("photo_analysis").$type<BedPhotoAnalysis>(),
    // Hochbeet-Begleiter (step 6): the year a raised bed was filled – its
    // layers rot down, so the year decides what it feeds best.
    builtYear: integer("built_year"),
  },
  (table) => [index("garden_beds_farm_idx").on(table.farmId)],
);

export interface BedPhotoAnalysis {
  shade: string;
  soil: string;
  weeds: string;
  tips: string[];
  createdAt: string;
}

/** Edge of one planner cell (cm) – the spec's 30 × 30 cm grid. */
export const BED_CELL_CM = 30;

// What grows where in a bed, per season (year): a rectangle of cells, from
// the crop catalog (cropKey) and/or the plant archive (plantId).
export const bedPlantingsTable = pgTable(
  "bed_plantings",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    bedId: integer("bed_id")
      .notNull()
      .references(() => gardenBedsTable.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    cropKey: text("crop_key"),
    plantId: integer("plant_id").references(() => plantsTable.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull().default(1),
    h: integer("h").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("bed_plantings_bed_season_idx").on(table.farmId, table.bedId, table.season)],
);

// Frost dates per 0.1° grid cell, computed once from weather history (DWD
// via Bright Sky) and shared by every bed in that cell. Not farm data.
export const frostClimateTable = pgTable(
  "frost_climate",
  {
    latKey: integer("lat_key").notNull(),
    lonKey: integer("lon_key").notNull(),
    lastFrost: text("last_frost").notNull(),
    firstFrost: text("first_frost").notNull(),
    years: integer("years").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.latKey, table.lonKey] })],
);

export type GardenBed = typeof gardenBedsTable.$inferSelect;

// Kalender (step 4): the dates of a planting come from the Anbaudaten and the
// bed's frost dates and are computed, not stored – only what the user ticked
// off is kept here.
export const GARDEN_EVENT_KINDS = ["sow_indoor", "direct_sow", "plant_out", "harvest"] as const;
export type GardenEventKind = (typeof GARDEN_EVENT_KINDS)[number];
export const gardenEventKindEnum = pgEnum("garden_event_kind", GARDEN_EVENT_KINDS);

export const plantingChecksTable = pgTable(
  "planting_checks",
  {
    plantingId: integer("planting_id")
      .notNull()
      .references(() => bedPlantingsTable.id, { onDelete: "cascade" }),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    kind: gardenEventKindEnum("kind").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.plantingId, table.kind] }), index("planting_checks_farm_idx").on(table.farmId)],
);

// One garden push per farm and Berlin day (dates that start today and the
// frost warning for the coming night) – the row makes the cron idempotent.
export const gardenDigestLogTable = pgTable(
  "garden_digest_log",
  {
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.farmId, table.day] })],
);

// KI (step 5): crops the fixed catalog does not know yet. The AI drafts the
// Anbaudaten, the app owner reviews them; once approved they count for every
// farm like the fixed catalog. `data` has the shape of the catalog's Crop
// (lib/gardenCatalog.ts in the API server).
export const CROP_DRAFT_STATUSES = ["draft", "approved"] as const;
export type CropDraftStatus = (typeof CROP_DRAFT_STATUSES)[number];
export const cropDraftStatusEnum = pgEnum("crop_draft_status", CROP_DRAFT_STATUSES);

export const gardenCropsTable = pgTable("garden_crops", {
  key: text("key").primaryKey(),
  status: cropDraftStatusEnum("status").notNull().default("draft"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  requestedBy: text("requested_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

// Garten-Assistent (step 6): what a farm wants from its beds. Needs and the
// split onto the beds are computed from this, the animals and the beds.
export const GARDEN_DIRECTIONS = ["vegetables", "herbs", "fruit", "storage"] as const;
export type GardenDirection = (typeof GARDEN_DIRECTIONS)[number];

export const gardenGoalsTable = pgTable("garden_goals", {
  farmId: integer("farm_id")
    .primaryKey()
    .references(() => farmsTable.id, { onDelete: "cascade" }),
  people: integer("people").notNull(),
  // Share of the bed area meant for animal fodder, 0–100 %.
  animalShare: integer("animal_share").notNull(),
  directions: jsonb("directions").$type<GardenDirection[]>().notNull(),
  hoursPerWeek: integer("hours_per_week"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
