import { date, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { farmSpeciesEnum, farmsTable, herdsTable } from "./farm";

// Weide (docs/weide.md): the farm's pastures and the grazing diary – which
// herd grazed where, from when to when, with how many animals.

export const PASTURE_KINDS = ["pasture", "mowing", "paddock", "meadow"] as const;
export type PastureKind = (typeof PASTURE_KINDS)[number];

/** A pasture's outline on the map: corners as [latitude, longitude]. */
export type PastureBoundary = [number, number][];

export const pasturesTable = pgTable(
  "pastures",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<PastureKind>().notNull().default("pasture"),
    areaHa: doublePrecision("area_ha"),
    // Drawn on the map (Weidekarte); the area is then computed from it.
    boundary: jsonb("boundary").$type<PastureBoundary>(),
    // Days the grass needs after grazing, and how long a herd should stay.
    restDays: integer("rest_days").notNull().default(35),
    maxGrazeDays: integer("max_graze_days").notNull().default(10),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pastures_farm_idx").on(table.farmId)],
);

export const pastureGrazingsTable = pgTable(
  "pasture_grazings",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    pastureId: integer("pasture_id")
      .notNull()
      .references(() => pasturesTable.id, { onDelete: "cascade" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "set null" }),
    // The herd's name when it grazed – kept when the herd goes.
    label: text("label").notNull(),
    // Which animals (from the herd, or given for other animals) – for the
    // parasite hints; null when unknown.
    species: farmSpeciesEnum("species"),
    animals: integer("animals").notNull(),
    startOn: date("start_on", { mode: "string" }).notNull(),
    // Null: still grazing.
    endOn: date("end_on", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pasture_grazings_pasture_idx").on(table.pastureId, table.startOn)],
);

// Schnitt (docs/weide.md): when a pasture or meadow was mown – for the next
// cut and the Weidepflege after grazing.
export const pastureCutsTable = pgTable(
  "pasture_cuts",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    pastureId: integer("pasture_id")
      .notNull()
      .references(() => pasturesTable.id, { onDelete: "cascade" }),
    cutOn: date("cut_on", { mode: "string" }).notNull(),
    // Optional: how many bales (hay, haylage or silage) it gave.
    bales: integer("bales"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pasture_cuts_pasture_idx").on(table.pastureId, table.cutOn)],
);
