import { pool } from "@workspace/db";
import { logger } from "./logger";
import { FARM_SCHEMA_STATEMENTS } from "./farmSchemaStatements";
import { GARDEN_SCHEMA_STATEMENTS } from "./gardenSchemaStatements";
import { FEED_SCHEMA_STATEMENTS } from "./feedSchemaStatements";
import { GROW_SCHEMA_STATEMENTS } from "./growSchemaStatements";
import { BEE_SCHEMA_STATEMENTS } from "./beeSchemaStatements";
import { PANTRY_SCHEMA_STATEMENTS } from "./pantrySchemaStatements";
import { PASTURE_SCHEMA_STATEMENTS } from "./pastureSchemaStatements";

/**
 * Small, additive schema changes applied at server start.
 *
 * The production database is not migrated by the build, so new columns are
 * added here. Every statement must be idempotent (IF NOT EXISTS) and purely
 * additive: it runs on every start. If it fails, the server does not start,
 * and Render keeps the previous version online.
 */
const STATEMENTS = [
  "ALTER TABLE plants ADD COLUMN IF NOT EXISTS image_quality integer",
  "ALTER TABLE plants ADD COLUMN IF NOT EXISTS image_locked boolean NOT NULL DEFAULT false",
  // Pilz-Scan mit drei Fotos und Freigabe durch den Betreiber (docs/scannen.md).
  "ALTER TABLE plants ADD COLUMN IF NOT EXISTS image_url_gills text",
  "ALTER TABLE plants ADD COLUMN IF NOT EXISTS has_gills_image boolean NOT NULL DEFAULT false",
  "ALTER TABLE plants ADD COLUMN IF NOT EXISTS edible_released_at timestamp with time zone",
  "ALTER TABLE insects ADD COLUMN IF NOT EXISTS image_quality integer",
  "ALTER TABLE insects ADD COLUMN IF NOT EXISTS image_locked boolean NOT NULL DEFAULT false",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp with time zone",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version varchar",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone",
  // Moderation (lib/db/src/schema/reports.ts). CREATE TYPE has no IF NOT
  // EXISTS, hence the DO blocks that ignore "already exists".
  `DO $$ BEGIN
     CREATE TYPE report_content_type AS ENUM ('plant_image', 'insect_image', 'username');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE report_reason AS ENUM ('unangemessen', 'person', 'falsch', 'urheberrecht', 'spam', 'sonstiges');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE report_status AS ENUM ('open', 'resolved', 'dismissed');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS reports (
     id serial PRIMARY KEY,
     user_id text NOT NULL,
     content_type report_content_type NOT NULL,
     content_id text NOT NULL,
     reason report_reason NOT NULL,
     note text,
     status report_status NOT NULL DEFAULT 'open',
     resolution text,
     created_at timestamp with time zone NOT NULL DEFAULT now(),
     resolved_at timestamp with time zone
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS reports_open_unique_idx ON reports (user_id, content_type, content_id) WHERE status = 'open'",
  "CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status)",
  // "Meine Farm" (generated, see farmSchemaStatements.ts).
  ...FARM_SCHEMA_STATEMENTS,
  // Alpakas (docs/alpaka.md): a new value in an existing enum. Runs on its
  // own, outside any transaction, so the value can be used right after.
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'alpaca' BEFORE 'other'`,
  // Gänse, Enten, Puten, Wachteln (docs/gefluegel.md).
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'goose' BEFORE 'other'`,
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'duck' BEFORE 'other'`,
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'turkey' BEFORE 'other'`,
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'quail' BEFORE 'other'`,
  // Nandus und Esel (docs/nandu-esel.md).
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'rhea' BEFORE 'other'`,
  `ALTER TYPE "public"."farm_species" ADD VALUE IF NOT EXISTS 'donkey' BEFORE 'other'`,
  // Beet-Architekt (generated, see gardenSchemaStatements.ts).
  ...GARDEN_SCHEMA_STATEMENTS,
  // Futterplaner (generated, see feedSchemaStatements.ts).
  ...FEED_SCHEMA_STATEMENTS,
  // Grow (generated, see growSchemaStatements.ts).
  ...GROW_SCHEMA_STATEMENTS,
  // Bienen (generated, see beeSchemaStatements.ts).
  ...BEE_SCHEMA_STATEMENTS,
  // Vorratskammer (generated, see pantrySchemaStatements.ts).
  ...PANTRY_SCHEMA_STATEMENTS,
  // Weide (generated, see pastureSchemaStatements.ts).
  ...PASTURE_SCHEMA_STATEMENTS,
  // Weidekarte: the outline came after the Weide tables.
  `ALTER TABLE "pastures" ADD COLUMN IF NOT EXISTS "boundary" jsonb`,
  // Parasite hints: the species on a grazing came later; older entries take
  // it from their herd.
  `ALTER TABLE "pasture_grazings" ADD COLUMN IF NOT EXISTS "species" "farm_species"`,
  `UPDATE "pasture_grazings" g SET "species" = h."species" FROM "herds" h WHERE g."herd_id" = h."id" AND g."species" IS NULL`,
  // Module and first-start assistant (schema/settings.ts).
  `CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hidden_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "push_off" jsonb DEFAULT '[]'::jsonb NOT NULL`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "quiet_start" text`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "quiet_end" text`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "seasonal_care" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "frost_notice_on" date`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "organic_tips" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "hidden_animals" jsonb DEFAULT '[]'::jsonb NOT NULL`,
  // Fundorte (schema/find-spots.ts, docs/fundorte.md).
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "share_find_spots" boolean`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "find_spots_decided_at" timestamp with time zone`,
  `CREATE TABLE IF NOT EXISTS "find_spots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plant_id" integer REFERENCES "plants"("id") ON DELETE CASCADE,
	"insect_id" integer REFERENCES "insects"("id") ON DELETE CASCADE,
	"species_key" text NOT NULL,
	"cell_row" integer NOT NULL,
	"cell_col" integer NOT NULL,
	"found_month" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "find_spots_user_species_cell_unique" UNIQUE ("user_id","species_key","cell_row","cell_col"),
	CONSTRAINT "find_spots_one_species" CHECK (("plant_id" IS NULL) <> ("insect_id" IS NULL))
)`,
  `CREATE INDEX IF NOT EXISTS "find_spots_plant_idx" ON "find_spots" ("plant_id")`,
  `CREATE INDEX IF NOT EXISTS "find_spots_insect_idx" ON "find_spots" ("insect_id")`,
  // Wetterabhängige Pflege (schema/tasks.ts).
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "outdoor" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "rain_skipped_on" date`,
  // Feedback (schema/feedback.ts).
  `CREATE TABLE IF NOT EXISTS "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"text" text NOT NULL,
	"page" text,
	"voice" boolean DEFAULT false NOT NULL,
	"kind" text,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
)`,
  // Feedback from the homepage, without an account.
  `ALTER TABLE "feedback" ALTER COLUMN "user_id" DROP NOT NULL`,
  `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "kind" text`,
  `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "contact" text`,
  `ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "screenshot" text`,
  `CREATE INDEX IF NOT EXISTS "feedback_created_idx" ON "feedback" USING btree ("created_at")`,
  // Umzug über das Konto (schema/move.ts).
  `CREATE TABLE IF NOT EXISTS "move_parcels" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"payload" text NOT NULL,
	"entries" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "move_parcels_user_idx" ON "move_parcels" USING btree ("user_id","id")`,
  // Hof-Dashboard (schema/dashboard.ts).
  `CREATE TABLE IF NOT EXISTS "dashboard_layouts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"widgets" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  // Premium (schema/premium.ts).
  `CREATE TABLE IF NOT EXISTS "premium" (
	"user_id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"plan" text,
	"active_until" timestamp with time zone,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  // Betrieb: error monitoring, status notice, usage counts (schema/monitoring.ts).
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_on date",
  `CREATE TABLE IF NOT EXISTS "error_groups" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"location" text,
	"stack" text,
	"release" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"notified_at" timestamp with time zone
)`,
  `CREATE TABLE IF NOT EXISTS "app_status" (
	"id" integer PRIMARY KEY NOT NULL,
	"message" text,
	"level" text DEFAULT 'info' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "usage_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_day_metric_pk" PRIMARY KEY("day","metric")
)`,
  // Wetter: one push per farm and day (schema/weather.ts).
  `CREATE TABLE IF NOT EXISTS "weather_digest_log" (
	"farm_id" integer NOT NULL,
	"day" text NOT NULL,
	"kinds" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_digest_log_farm_id_day_pk" PRIMARY KEY("farm_id","day")
)`,
  `DO $$ BEGIN
     ALTER TABLE "weather_digest_log" ADD CONSTRAINT "weather_digest_log_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Amtliche DWD-Warnungen: which warning went to which farm (schema/weather.ts).
  `CREATE TABLE IF NOT EXISTS "weather_alert_log" (
	"farm_id" integer NOT NULL,
	"key" text NOT NULL,
	"level" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_alert_log_farm_id_key_pk" PRIMARY KEY("farm_id","key")
)`,
  `DO $$ BEGIN
     ALTER TABLE "weather_alert_log" ADD CONSTRAINT "weather_alert_log_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Hof-Aufgaben (docs/hof-aufgaben.md).
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "title" text`,
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "area" text DEFAULT 'tiere' NOT NULL`,
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "starts_on" date`,
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "repeats" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "assignee_id" text`,
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "last_completed_by" text`,
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "prev_completed_at" timestamp with time zone`,
  `CREATE TABLE IF NOT EXISTS "farm_task_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "farm_task_comments" ADD CONSTRAINT "farm_task_comments_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "farm_task_comments" ADD CONSTRAINT "farm_task_comments_task_id_farm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."farm_tasks"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "farm_task_comments_task_idx" ON "farm_task_comments" USING btree ("farm_id","task_id")`,
  // Alltagsnotizen (docs/alltagsnotizen.md).
  `CREATE TABLE IF NOT EXISTS "daily_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"added_by" text,
	"kind" text NOT NULL,
	"category" text,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "daily_notes_user_idx" ON "daily_notes" USING btree ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "note_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_shares_owner_user_unique" UNIQUE("owner_id","user_id")
)`,
  `CREATE INDEX IF NOT EXISTS "note_shares_user_idx" ON "note_shares" USING btree ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "farm_push_log" (
	"farm_id" integer NOT NULL,
	"topic" text NOT NULL,
	"day" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_push_log_farm_id_topic_day_pk" PRIMARY KEY("farm_id","topic","day")
)`,
  `DO $$ BEGIN
     ALTER TABLE "farm_push_log" ADD CONSTRAINT "farm_push_log_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Kostenschutz: daily AI checks per camera (docs/kostenschutz.md).
  `ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "ai_day" date`,
  `ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "ai_count" integer DEFAULT 0 NOT NULL`,
  // Hof-Aufgaben an Wochentagen (docs/hof-aufgaben.md).
  `ALTER TABLE "farm_tasks" ADD COLUMN IF NOT EXISTS "weekdays" jsonb`,
  // Krankenakte: Behandlung über mehrere Tage (docs/gesundheit.md).
  `ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "treatment_until" date`,
  // Bio in der Krankenakte (docs/bio.md).
  `ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "remedy_kind" text`,
  `ALTER TABLE "medical_records" ADD COLUMN IF NOT EXISTS "organic" boolean DEFAULT false NOT NULL`,
  // Besucher der Homepage (docs/analyse.md).
  `CREATE TABLE IF NOT EXISTS "site_visits" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"source" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_visits_day_path_source_pk" PRIMARY KEY("day","path","source")
)`,
  // Bezahlung: Paket und Abo beim Zahlungsanbieter (docs/bezahlung.md).
  `ALTER TABLE "premium" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'premium' NOT NULL`,
  `ALTER TABLE "premium" ADD COLUMN IF NOT EXISTS "customer_id" text`,
  `ALTER TABLE "premium" ADD COLUMN IF NOT EXISTS "subscription_id" text`,
  `ALTER TABLE "premium" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean DEFAULT false NOT NULL`,
  // Passwort vergessen (docs/konto.md).
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone",
  // Nutzer-ID (docs/konto.md); codes for older accounts are handed out at start (lib/userCode.ts).
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code integer",
  "CREATE UNIQUE INDEX IF NOT EXISTS users_user_code_unique ON users (user_code)",
  `CREATE TABLE IF NOT EXISTS "password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"via" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
)`,
  `CREATE INDEX IF NOT EXISTS "password_resets_user_idx" ON "password_resets" USING btree ("user_id")`,
];

export async function upgradeSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    await pool.query(statement);
  }
  logger.info({ statements: STATEMENTS.length }, "Schema up to date");
}
