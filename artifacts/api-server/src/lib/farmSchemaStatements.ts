/**
 * DDL for the "Meine Farm" tables (lib/db/src/schema/farm.ts), applied at
 * server start by schemaUpgrade.ts.
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent: CREATE ... IF NOT EXISTS, and CREATE TYPE / foreign keys wrapped
 * in DO blocks that ignore "already exists". Do not edit by hand – change
 * farm.ts, re-export and replace this list (the integration test compares the
 * result with drizzle-kit push).
 */
export const FARM_SCHEMA_STATEMENTS: readonly string[] = [
  `DO $$ BEGIN
     CREATE TYPE "public"."animal_sex" AS ENUM('female', 'male', 'neutered', 'unknown');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."farm_role" AS ENUM('admin', 'caretaker', 'guest');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."farm_species" AS ENUM('poultry', 'rabbit', 'guineaPig', 'cat', 'horse', 'dog', 'goat', 'sheep', 'cattle', 'pig', 'other');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."farm_task_action" AS ENUM('Füttern', 'Tränken', 'Ausmisten', 'Eier sammeln', 'Entwurmen', 'Impfen', 'Klauen-/Hufpflege', 'Gesundheitskontrolle', 'Sonstiges');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "farms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"handover_note" text,
	"setup_dismissed_at" timestamp with time zone
)`,
  // Wetter: where the farm is.
  `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "postal_code" text`,
  `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "latitude" double precision`,
  `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "longitude" double precision`,
  // Vertretung.
  `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "handover_note" text`,
  // Hof einrichten.
  `ALTER TABLE "farms" ADD COLUMN IF NOT EXISTS "setup_dismissed_at" timestamp with time zone`,
  `CREATE TABLE IF NOT EXISTS "farm_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "farm_role" DEFAULT 'caretaker' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"access_until" date,
	CONSTRAINT "farm_memberships_user_farm_unique" UNIQUE("user_id","farm_id")
)`,
  `ALTER TABLE "farm_memberships" ADD COLUMN IF NOT EXISTS "access_until" date`,
  `CREATE TABLE IF NOT EXISTS "herds" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"species" "farm_species" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "farm_animals" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"herd_id" integer,
	"name" text NOT NULL,
	"species" "farm_species" NOT NULL,
	"breed" text,
	"birth_date" date,
	"sex" "animal_sex" DEFAULT 'unknown' NOT NULL,
	"registration_number" text NOT NULL,
	"image_url" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_animals_farm_registration_unique" UNIQUE("farm_id","registration_number")
)`,
  `CREATE TABLE IF NOT EXISTS "medical_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_id" integer NOT NULL,
	"date" date NOT NULL,
	"diagnosis" text NOT NULL,
	"treatment" text,
	"medication" text,
	"withdrawal_period_days" integer,
	"vet" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"medicine_id" integer,
	"dose" double precision,
	"batch" text
)`,
  // Arzneimittel-Vorrat.
  `ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "medicine_id" integer`,
  `ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "dose" double precision`,
  `ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "batch" text`,
  `CREATE TABLE IF NOT EXISTS "medicines" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"active_ingredient" text,
	"unit" text NOT NULL,
	"amount" double precision NOT NULL,
	"batch" text,
	"expires_on" date,
	"withdrawal_meat_days" integer,
	"withdrawal_milk_days" integer,
	"withdrawal_eggs_days" integer,
	"vet" text,
	"received_on" date,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "weight_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_id" integer NOT NULL,
	"date" date NOT NULL,
	"weight_kg" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "food_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_id" integer,
	"herd_id" integer,
	"date" date NOT NULL,
	"image_url" text,
	"analysis" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "cameras" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"relay_url" text,
	"cooldown_seconds" integer DEFAULT 300 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cameras_secret_hash_unique" UNIQUE("secret_hash")
)`,
  `CREATE TABLE IF NOT EXISTS "camera_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"camera_id" integer NOT NULL,
	"image_url" text,
	"predator_detected" boolean NOT NULL,
	"species" text,
	"confidence" real,
	"relay_triggered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "farm_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_id" integer,
	"herd_id" integer,
	"action_type" "farm_task_action" NOT NULL,
	"notes" text,
	"interval_value" integer NOT NULL,
	"interval_unit" "task_interval_unit" NOT NULL,
	"reminder_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_completed_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "husbandry_guides" (
	"species" "farm_species" PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "camera_events" ADD CONSTRAINT "camera_events_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "camera_events" ADD CONSTRAINT "camera_events_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "cameras" ADD CONSTRAINT "cameras_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_animals" ADD CONSTRAINT "farm_animals_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_animals" ADD CONSTRAINT "farm_animals_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_memberships" ADD CONSTRAINT "farm_memberships_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_animal_id_farm_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."farm_animals"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "herds" ADD CONSTRAINT "herds_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_animal_id_farm_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."farm_animals"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "weight_logs" ADD CONSTRAINT "weight_logs_animal_id_farm_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."farm_animals"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_animal_id_farm_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."farm_animals"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_tasks" ADD CONSTRAINT "farm_tasks_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "camera_events_farm_created_idx" ON "camera_events" USING btree ("farm_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "cameras_farm_idx" ON "cameras" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "farm_animals_farm_idx" ON "farm_animals" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "farm_memberships_farm_idx" ON "farm_memberships" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "farm_tasks_farm_idx" ON "farm_tasks" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "food_logs_farm_idx" ON "food_logs" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "herds_farm_idx" ON "herds" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "medical_records_farm_animal_idx" ON "medical_records" USING btree ("farm_id","animal_id")`,
  `DO $$ BEGIN
     ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "medicines" ADD CONSTRAINT "medicines_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "medicines_farm_idx" ON "medicines" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "weight_logs_farm_animal_idx" ON "weight_logs" USING btree ("farm_id","animal_id")`,
];
