import { date, doublePrecision, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { farmsTable } from "./farm";
import { harvestLogsTable } from "./garden";

// Vorratskammer (docs/vorratskammer.md): what the farm put by – preserved,
// frozen, dried, honey, eggs – with amount, place and best-before date, and
// what was taken out of it. Shared by the farm.

export const PANTRY_KINDS = [
  "canned",
  "frozen",
  "dried",
  "pickled",
  "fermented",
  "juice",
  "jam",
  "honey",
  "eggs",
  "other",
] as const;
export type PantryKind = (typeof PANTRY_KINDS)[number];

export const pantryItemsTable = pgTable(
  "pantry_items",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<PantryKind>().notNull(),
    // From the garden: the crop, and the harvest it was made from.
    cropKey: text("crop_key"),
    harvestId: integer("harvest_id").references(() => harvestLogsTable.id, { onDelete: "set null" }),
    // How much is left, and how much there was.
    amount: doublePrecision("amount").notNull(),
    initialAmount: doublePrecision("initial_amount").notNull(),
    // "Glas", "Beutel", "kg", "Stück", "Flasche", "l".
    unit: text("unit").notNull(),
    location: text("location"),
    madeOn: date("made_on", { mode: "string" }).notNull(),
    bestBefore: date("best_before", { mode: "string" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pantry_items_farm_idx").on(table.farmId)],
);

export const pantryUsesTable = pgTable(
  "pantry_uses",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => pantryItemsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    amount: doublePrecision("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pantry_uses_item_idx").on(table.itemId, table.date)],
);
