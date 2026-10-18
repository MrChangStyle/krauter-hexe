import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { taskIntervalUnitEnum } from "./tasks";

// "Meine Farm" – the animal module of Little Farming (docs/meine-farm-app.md).
//
// Farm data is PRIVATE: only members of a farm see it – not other users, and
// not the app owner either (unlike the shared plant/insect archive). Every
// farm table carries farm_id, and all access goes through requireFarm()
// (api-server/src/middlewares/requireFarm.ts).
//
// The tables are created at server start by lib/schemaUpgrade.ts – keep both
// in sync (the statements there are generated from this file).

export const FARM_ROLES = ["admin", "caretaker", "guest"] as const;
export type FarmRole = (typeof FARM_ROLES)[number];

// Includes the animal keys the plant module already knows (src/lib/animals.ts
// in the app: poultry, rabbit, guineaPig, cat, horse), so plant toxicity per
// animal can later be matched to a farm animal directly.
export const FARM_SPECIES = [
  "poultry",
  "rabbit",
  "guineaPig",
  "cat",
  "horse",
  "dog",
  "goat",
  "sheep",
  "cattle",
  "pig",
  "other",
] as const;
export type FarmSpecies = (typeof FARM_SPECIES)[number];

export const ANIMAL_SEXES = ["female", "male", "neutered", "unknown"] as const;
export type AnimalSex = (typeof ANIMAL_SEXES)[number];

// Stall tasks. Kept apart from the plant tasks (tasks table): those belong to
// one user and one plant, these to a farm and are shared by its members.
export const FARM_TASK_ACTIONS = [
  "Füttern",
  "Tränken",
  "Ausmisten",
  "Eier sammeln",
  "Entwurmen",
  "Impfen",
  "Klauen-/Hufpflege",
  "Gesundheitskontrolle",
  "Sonstiges",
] as const;
export type FarmTaskAction = (typeof FARM_TASK_ACTIONS)[number];

export const farmRoleEnum = pgEnum("farm_role", FARM_ROLES);
export const farmTaskActionEnum = pgEnum("farm_task_action", FARM_TASK_ACTIONS);
export const farmSpeciesEnum = pgEnum("farm_species", FARM_SPECIES);
export const animalSexEnum = pgEnum("animal_sex", ANIMAL_SEXES);

export const farmsTable = pgTable("farms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const farmMembershipsTable = pgTable(
  "farm_memberships",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // Text like every other user reference; account deletion handles it
    // (accountDeletion.ts – a farm without members goes with its last one).
    userId: text("user_id").notNull(),
    role: farmRoleEnum("role").notNull().default("caretaker"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("farm_memberships_user_farm_unique").on(table.userId, table.farmId),
    index("farm_memberships_farm_idx").on(table.farmId),
  ],
);

export const herdsTable = pgTable(
  "herds",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    species: farmSpeciesEnum("species").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("herds_farm_idx").on(table.farmId)],
);

export const farmAnimalsTable = pgTable(
  "farm_animals",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    species: farmSpeciesEnum("species").notNull(),
    breed: text("breed"),
    birthDate: date("birth_date", { mode: "string" }),
    sex: animalSexEnum("sex").notNull().default("unknown"),
    // Ring / ear tag. Unique within a farm, so the vet export can rely on it.
    registrationNumber: text("registration_number").notNull(),
    // Cloudinary URL. Nullable: uploads are non-fatal, like plant scans.
    imageUrl: text("image_url"),
    notes: text("notes"),
    // Set instead of deleting, so the medical history stays exportable.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("farm_animals_farm_registration_unique").on(table.farmId, table.registrationNumber),
    index("farm_animals_farm_idx").on(table.farmId),
  ],
);

export const medicalRecordsTable = pgTable(
  "medical_records",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id")
      .notNull()
      .references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    diagnosis: text("diagnosis").notNull(),
    treatment: text("treatment"),
    medication: text("medication"),
    // Wartezeit for food-producing animals (days until milk/eggs/meat are
    // usable again).
    withdrawalPeriodDays: integer("withdrawal_period_days"),
    vet: text("vet"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("medical_records_farm_animal_idx").on(table.farmId, table.animalId)],
);

export const weightLogsTable = pgTable(
  "weight_logs",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id")
      .notNull()
      .references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("weight_logs_farm_animal_idx").on(table.farmId, table.animalId)],
);

export const foodLogsTable = pgTable(
  "food_logs",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    animalId: integer("animal_id").references(() => farmAnimalsTable.id, { onDelete: "set null" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "set null" }),
    date: date("date", { mode: "string" }).notNull(),
    imageUrl: text("image_url"),
    // AI nutrient analysis (step 5), stored as returned after validation.
    analysis: jsonb("analysis"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("food_logs_farm_idx").on(table.farmId)],
);

export const farmTasksTable = pgTable(
  "farm_tasks",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    // At most one of the two; neither means the whole farm.
    animalId: integer("animal_id").references(() => farmAnimalsTable.id, { onDelete: "cascade" }),
    herdId: integer("herd_id").references(() => herdsTable.id, { onDelete: "cascade" }),
    actionType: farmTaskActionEnum("action_type").notNull(),
    notes: text("notes"),
    // Same schedule model as the plant tasks: every <value> <unit>, reminder
    // at a Berlin wall-clock time (HH:MM), sent by the same cron.
    intervalValue: integer("interval_value").notNull(),
    intervalUnit: taskIntervalUnitEnum("interval_unit").notNull(),
    reminderTime: text("reminder_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("farm_tasks_farm_idx").on(table.farmId)],
);

export const camerasTable = pgTable(
  "cameras",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // sha256 of the camera's secret; the secret itself is shown only once.
    secretHash: text("secret_hash").notNull().unique(),
    relayUrl: text("relay_url"),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(300),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cameras_farm_idx").on(table.farmId)],
);

export const cameraEventsTable = pgTable(
  "camera_events",
  {
    id: serial("id").primaryKey(),
    farmId: integer("farm_id")
      .notNull()
      .references(() => farmsTable.id, { onDelete: "cascade" }),
    cameraId: integer("camera_id")
      .notNull()
      .references(() => camerasTable.id, { onDelete: "cascade" }),
    imageUrl: text("image_url"),
    predatorDetected: boolean("predator_detected").notNull(),
    species: text("species"),
    confidence: real("confidence"),
    relayTriggered: boolean("relay_triggered").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("camera_events_farm_created_idx").on(table.farmId, table.createdAt)],
);

export type Farm = typeof farmsTable.$inferSelect;
export type FarmMembership = typeof farmMembershipsTable.$inferSelect;
export type FarmAnimal = typeof farmAnimalsTable.$inferSelect;
export type FarmTask = typeof farmTasksTable.$inferSelect;
