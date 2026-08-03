import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Category buckets used for the archive/auto-categorization feature.
export const PLANT_CATEGORIES = [
  "poisonous", // Giftige Pflanzen
  "edible", // Essbare Pflanzen
  "medicinal", // Heilkräuter
  "mushroom", // Pilze
  "tree", // Bäume
  "shrub", // Sträucher
  "moss", // Moose und Flechten
  "cactus", // Kakteen und Sukkulenten
] as const;

// Deterministic, structured status for the human safety indicator.
export const HUMAN_STATUSES = ["edible", "poisonous"] as const;

// Deterministic, structured status for the poultry/animal safety indicator.
export const POULTRY_STATUSES = ["safe", "poisonous"] as const;

// Three-tier toxicity scale shown as a sublabel under the "GIFTIG" badge:
//   intolerant → unverträglich (mild intolerance / digestive upset)
//   poisonous  → giftig        (toxic, systemic effects)
//   lethal     → tödlich       (potentially fatal)
// Only populated when the status is "poisonous"; null/undefined = unknown.
export const TOXICITY_LEVELS = ["intolerant", "poisonous", "lethal"] as const;
export type ToxicityLevel = (typeof TOXICITY_LEVELS)[number];

// The animals we generate a per-animal fact sheet for. "poultry" stays the
// canonical key and mirrors the legacy poultryStatus/animalToxicityDetails/
// poultryBenefits columns so old rows keep working while the new "Status Tiere"
// dropdown can show every animal.
export const ANIMAL_KINDS = [
  "poultry",
  "rabbit",
  "guineaPig",
  "cat",
  "horse",
] as const;
export type AnimalKind = (typeof ANIMAL_KINDS)[number];

// Per-animal fact sheet: safety status plus the German toxicity explanation and
// medicinal benefits for that specific animal. status reuses the safe/poisonous
// scale so the badges stay deterministic.
export type AnimalInfo = {
  status: (typeof POULTRY_STATUSES)[number];
  // Degree of toxicity; only set when status is "poisonous".
  toxicityLevel?: ToxicityLevel;
  toxicityDetails: string;
  benefits: string;
};

// Keyed by AnimalKind; partial so legacy rows (empty {}) and partially filled
// rows both type-check. The UI/PDF fall back to the legacy poultry columns when
// a key is missing.
export type AnimalsMap = Partial<Record<AnimalKind, AnimalInfo>>;

// Targets we track treatable symptoms for: the human plus every animal kind.
// Drives the "Kräuter-Hexe" view (filter edible/healing plants by who they help
// and which symptom they treat).
export const HEAL_TARGET_KINDS = [
  "human",
  ...ANIMAL_KINDS,
] as const;
export type HealTargetKind = (typeof HEAL_TARGET_KINDS)[number];

// Per-target list of the concrete complaints/symptoms a plant can help treat
// (its Heilwirkung, as short canonical German tags). Keyed by target; partial
// so legacy rows (empty {}) stay valid until the one-time symptom backfill runs.
// Presence of a target key means "already processed" (an empty array is a valid
// result: nothing treatable for that target).
export type SymptomsMap = Partial<Record<HealTargetKind, string[]>>;

// Per-target, per-symptom application instructions: HOW to use/prepare the
// plant to treat each specific complaint. Short German descriptions (1-2
// sentences). Keyed by target → symptom tag → instruction. Partial so legacy
// rows (empty {}) stay valid; presence of any target key means "processed".
export type SymptomApplicationsMap = Partial<Record<HealTargetKind, Record<string, string>>>;

// Native Postgres enums so invalid status/category values can never be
// persisted, regardless of code path (app-layer coercion is not enough for
// safety-critical badge fields).
export const plantCategoryEnum = pgEnum("plant_category", PLANT_CATEGORIES);
export const humanStatusEnum = pgEnum("human_status", HUMAN_STATUSES);
export const poultryStatusEnum = pgEnum("poultry_status", POULTRY_STATUSES);

export const plantsTable = pgTable("plants", {
  id: serial("id").primaryKey(),
  // Original scanned photo, stored as a data URL. Nullable for rows created
  // after the local-first migration: new scans no longer store the photo in
  // the database; only the local_image_id key is kept here.
  imageData: text("image_data"),
  // Optional second photo (data URL) - side view of the two-photo mushroom scan.
  // Null for plants and for legacy single-photo mushroom entries. New rows
  // do not store image bytes here either; has_side_image is the durable marker.
  imageDataSide: text("image_data_side"),
  // GCS object path (e.g. "/objects/uploads/uuid") for the main photo.
  // Takes priority over image_data and local_image_id for serving.
  // Set by the scan endpoint when uploading to GCS, and by the migration script.
  imageUrl: text("image_url"),
  // GCS object path for the mushroom side-view photo.
  imageUrlSide: text("image_url_side"),
  // True when this entry has (or had) a verified side-view photo from the
  // two-photo mushroom scan. Replaces the `imageDataSide IS NOT NULL` check for
  // new rows that no longer store image bytes in the database.
  hasSideImage: boolean("has_side_image").notNull().default(false),
  // Client-generated UUID that identifies the photo in the device's local
  // IndexedDB image store. Null for rows created before the local-first migration.
  localImageId: text("local_image_id"),
  germanName: text("german_name").notNull(),
  botanicalName: text("botanical_name").notNull(),
  category: plantCategoryEnum("category").notNull(),
  // Structured fields drive the color-coded badges - never parsed from free text.
  humanStatus: humanStatusEnum("human_status").notNull(),
  poultryStatus: poultryStatusEnum("poultry_status").notNull(),
  // Rich free-text fact sheet content (German, matches the domain).
  edibilityDetails: text("edibility_details").notNull(),
  animalToxicityDetails: text("animal_toxicity_details").notNull(),
  activeIngredients: text("active_ingredients").notNull(),
  humanBenefits: text("human_benefits").notNull(),
  poultryBenefits: text("poultry_benefits").notNull(),
  // Habitat facts: where the plant usually grows and what the site must
  // provide. Default '' so legacy rows (scanned before these fields existed)
  // stay valid; the UI hides empty sections until a backfill fills them.
  habitat: text("habitat").notNull().default(""),
  siteConditions: text("site_conditions").notNull().default(""),
  // "Weitere Nutzung": practical uses beyond eating/medicine (e.g. Beinwell/
  // Brennnessel fertilizer brew) plus fertilizing tips for growing the plant
  // yourself. Default '' so legacy rows stay valid; the UI hides empty
  // sections until entries are backfilled.
  otherUses: text("other_uses").notNull().default(""),
  fertilizerTips: text("fertilizer_tips").notNull().default(""),
  // Per-animal fact sheets (poultry/rabbit/guineaPig/cat). Default '{}' so
  // legacy rows stay valid; a one-time backfill fills them from the plant name
  // and new scans populate all animals at once. The legacy poultry* columns
  // above are kept in sync with animals.poultry for backward compatibility.
  animals: jsonb("animals").$type<AnimalsMap>().notNull().default({}),
  // Treatable symptoms per target (Mensch + 4 Tierarten), as short canonical
  // German tags derived from the plant's Heilwirkung. Default '{}' so legacy
  // rows stay valid; a one-time backfill fills them and new scans populate all
  // targets. Drives the "Kräuter-Hexe" symptom filter, never a safety badge.
  symptoms: jsonb("symptoms").$type<SymptomsMap>().notNull().default({}),
  // Application instructions per target + symptom: HOW to use/prepare the
  // plant to treat each specific complaint (e.g. "Als Tee trinken.", "Blätter
  // zerreiben und auflegen."). Default '{}' so legacy rows stay valid; backfill
  // fills them once symptoms are present.
  symptomApplications: jsonb("symptom_applications").$type<SymptomApplicationsMap>().notNull().default({}),
  // Three-tier toxicity level for humans: "intolerant" (unverträglich),
  // "poisonous" (giftig), "lethal" (tödlich). Only set when humanStatus is
  // "poisonous"; null for edible plants and for legacy rows until rescanned.
  humanToxicityLevel: text("human_toxicity_level").$type<ToxicityLevel>(),
  // Whether the plant produces edible fruits (Bäume / Sträucher context).
  // null = not yet classified (legacy rows); true/false once backfilled or
  // provided by a new scan.
  hasEdibleFruits: boolean("has_edible_fruits"),
  // Short German description of how the plant can be prepared/eaten (e.g.
  // "Roh, gekocht, als Tee oder Salat"). Only relevant for edible plants
  // (category = "edible" or edible mushrooms). Default '' so legacy rows
  // stay valid; the UI hides this section when empty.
  preparation: text("preparation").notNull().default(""),
  // The authenticated user who triggered this scan. Null for entries created
  // before per-user tracking was introduced (all plants scanned before this
  // migration). Not a FK at schema level to avoid a circular import with
  // auth.ts; integrity is maintained in application code.
  scannedByUserId: text("scanned_by_user_id"),
  // Coarse location region where the scan was taken (e.g. "München", "Bayern").
  // Derived from GPS coordinates client-side and reverse-geocoded to a plain
  // text name — no coordinates are ever stored server-side. Nullable; most
  // legacy rows have no location.
  locationRegion: text("location_region"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Timestamp set once the plant's "medicinal" classification has been
  // reviewed against current phytotherapy standards by the AI backfill.
  // NULL = not yet reviewed. After review the category may have changed.
  medicinalVerifiedAt: timestamp("medicinal_verified_at", {
    withTimezone: true,
  }),
});

export const insertPlantSchema = createInsertSchema(plantsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPlant = z.infer<typeof insertPlantSchema>;
export type Plant = typeof plantsTable.$inferSelect;
