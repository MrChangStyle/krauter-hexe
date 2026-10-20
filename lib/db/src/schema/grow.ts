import { date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

// Grow (docs/grow.md): the add-on module for growing cannabis at home within
// the Konsumcannabisgesetz. Personal, not farm data – every row belongs to one
// account (lib/accountDeletion.ts removes them with it). Adults only.

// Who may use the module: the owner unlocks it per account (until payments
// exist), the account confirms its age once and says how many adults live in
// the household (the KCanG allows 3 plants per adult).
export const growAccessTable = pgTable("grow_access", {
  userId: text("user_id").primaryKey(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  adults: integer("adults").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Morning push: off | discreet (no grow words on the lock screen) | full.
  push: text("push").notNull().default("discreet"),
  // Strompreis in €/kWh for the cost calculator (null: the app's default).
  kwhPrice: doublePrecision("kwh_price"),
});

// One grow: a tent indoors, a spot outdoors or a greenhouse.
export const growsTable = pgTable(
  "grows",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // indoor | outdoor | greenhouse
    environment: text("environment").notNull(),
    // soil | coco | hydro
    medium: text("medium").notNull(),
    // Indoor: tent size ("80×80×160") and the light.
    tentSize: text("tent_size"),
    lightType: text("light_type"),
    lightWatts: integer("light_watts"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Outdoor and greenhouse: where, for the weather (rounded to 0.1°, about 10 km).
    postalCode: text("postal_code"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    // Indoor: fans, filter and the like, running around the clock (watts).
    fanWatts: integer("fan_watts"),
  },
  (table) => [index("grows_user_idx").on(table.userId)],
);

// A plant of a grow, from germination to the jar.
export const growPlantsTable = pgTable(
  "grow_plants",
  {
    id: serial("id").primaryKey(),
    growId: integer("grow_id")
      .notNull()
      .references(() => growsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Sorte (strain) and breeder as written on the pack.
    strain: text("strain"),
    breeder: text("breeder"),
    // indica | sativa | hybrid | ruderalis
    strainType: text("strain_type").notNull(),
    // photo | auto
    flowering: text("flowering").notNull(),
    // feminized | regular | unknown
    seedSex: text("seed_sex").notNull().default("unknown"),
    flowerWeeks: integer("flower_weeks").notNull(),
    // Germination day; the plan is computed from it.
    startedOn: date("started_on", { mode: "string" }).notNull(),
    // Photoperiodic plants indoors: the day the light went to 12/12 (null: planned).
    flipOn: date("flip_on", { mode: "string" }),
    harvestedOn: date("harvested_on", { mode: "string" }),
    wetGrams: doublePrecision("wet_grams"),
    dryGrams: doublePrecision("dry_grams"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("grow_plants_grow_idx").on(table.growId)],
);

// Grow-Tagebuch: what was measured and done on a day.
export const growLogsTable = pgTable(
  "grow_logs",
  {
    id: serial("id").primaryKey(),
    plantId: integer("plant_id")
      .notNull()
      .references(() => growPlantsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    heightCm: doublePrecision("height_cm"),
    waterMl: integer("water_ml"),
    ph: doublePrecision("ph"),
    ec: doublePrecision("ec"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("grow_logs_plant_idx").on(table.plantId)],
);

// One grow push per account and Berlin day, with the weather warnings that
// went out – a rainy spell is pushed once, not every morning.
export const growPushLogTable = pgTable(
  "grow_push_log",
  {
    userId: text("user_id").notNull(),
    day: text("day").notNull(),
    kinds: jsonb("kinds").$type<string[]>().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

// KI-Check of a plant photo: health (deficiency, pests, mould, stress) or
// trichomes (ripeness). Only the result is kept – never the photo.
export const growChecksTable = pgTable(
  "grow_checks",
  {
    id: serial("id").primaryKey(),
    plantId: integer("plant_id")
      .notNull()
      .references(() => growPlantsTable.id, { onDelete: "cascade" }),
    // health | trichomes
    kind: text("kind").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("grow_checks_plant_idx").on(table.plantId)],
);

// What a grow cost: equipment, soil, fertilizer, seeds … (electricity is computed).
export const growCostsTable = pgTable(
  "grow_costs",
  {
    id: serial("id").primaryKey(),
    growId: integer("grow_id")
      .notNull()
      .references(() => growsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    // equipment | soil | fertilizer | seeds | water | other
    category: text("category").notNull(),
    item: text("item").notNull(),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("grow_costs_grow_idx").on(table.growId)],
);
