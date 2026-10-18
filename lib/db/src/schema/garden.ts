import { doublePrecision, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { farmsTable } from "./farm";
import { plantsTable } from "./plants";

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
  },
  (table) => [index("garden_beds_farm_idx").on(table.farmId)],
);

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
