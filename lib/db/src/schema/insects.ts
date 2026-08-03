import {
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Eight insect category buckets from the spec.
export const INSECT_CATEGORIES = [
  "beetle",       // Käfer
  "butterfly",    // Schmetterlinge
  "bee_wasp",     // Bienen/Wespen
  "fly_mosquito", // Fliegen/Mücken
  "bug_cicada",   // Wanzen/Zikaden
  "grasshopper",  // Heuschrecken
  "dragonfly",    // Libellen
  "spider_other", // Spinnen/Andere
] as const;

export type InsectCategory = (typeof INSECT_CATEGORIES)[number];

// Relationship of the insect to cultivated plants.
export const INSECT_RELATION_STATUSES = [
  "pest",       // Schädling
  "beneficial", // Nützling
  "neutral",    // Neutral
] as const;

export type InsectRelationStatus = (typeof INSECT_RELATION_STATUSES)[number];

// Native Postgres enums prevent invalid values regardless of code path.
export const insectCategoryEnum = pgEnum("insect_category", INSECT_CATEGORIES);
export const insectRelationStatusEnum = pgEnum(
  "insect_relation_status",
  INSECT_RELATION_STATUSES,
);

export const insectsTable = pgTable("insects", {
  id: serial("id").primaryKey(),
  // Original photo stored as a data URL. Nullable for rows created after the
  // local-first migration; new scans store only local_image_id instead.
  imageData: text("image_data"),
  // Client-generated UUID that identifies the photo in the device's local
  // IndexedDB image store. Null for rows created before the local-first migration.
  localImageId: text("local_image_id"),
  // GCS object path (e.g. "/objects/uploads/uuid") for the photo.
  // Takes priority over image_data and local_image_id for serving.
  imageUrl: text("image_url"),
  germanName: text("german_name").notNull(),
  scientificName: text("scientific_name").notNull(),
  category: insectCategoryEnum("category").notNull(),
  // Relationship to garden plants.
  relationStatus: insectRelationStatusEnum("relation_status").notNull(),
  // Plant species this insect frequently targets or visits (German names).
  affectedPlants: jsonb("affected_plants").$type<string[]>().notNull().default([]),
  // German-language description of the insect.
  description: text("description").notNull(),
  // For pests: organic treatment / prevention tips. Empty for neutral/beneficial.
  treatmentTips: text("treatment_tips").notNull().default(""),
  // If the photo showed an insect on a plant, the German name of that plant.
  plantContext: text("plant_context"),
  // The authenticated user who triggered this scan.
  scannedByUserId: text("scanned_by_user_id"),
  // Coarse location region where the scan was taken (e.g. "München", "Bayern").
  // Derived from GPS coordinates and reverse-geocoded to plain text — no
  // coordinates stored. Nullable; most legacy rows have no location.
  locationRegion: text("location_region"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertInsectSchema = createInsertSchema(insectsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertInsect = z.infer<typeof insertInsectSchema>;
export type Insect = typeof insectsTable.$inferSelect;
