/**
 * DDL for the Grow tables (lib/db/src/schema/grow.ts), applied at server
 * start by schemaUpgrade.ts.
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent like farmSchemaStatements.ts. Do not edit by hand – change
 * grow.ts, re-export and replace this list.
 */
export const GROW_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "grow_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"unlocked_at" timestamp with time zone,
	"age_confirmed_at" timestamp with time zone,
	"adults" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"push" text DEFAULT 'discreet' NOT NULL,
	"kwh_price" double precision
)`,
  `ALTER TABLE "grow_access" ADD COLUMN IF NOT EXISTS "push" text DEFAULT 'discreet' NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "grows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"environment" text NOT NULL,
	"medium" text NOT NULL,
	"tent_size" text,
	"light_type" text,
	"light_watts" integer,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"fan_watts" integer
)`,
  `ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "postal_code" text`,
  `ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "latitude" double precision`,
  `ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "longitude" double precision`,
  `CREATE TABLE IF NOT EXISTS "grow_plants" (
	"id" serial PRIMARY KEY NOT NULL,
	"grow_id" integer NOT NULL,
	"name" text NOT NULL,
	"strain" text,
	"breeder" text,
	"strain_type" text NOT NULL,
	"flowering" text NOT NULL,
	"seed_sex" text DEFAULT 'unknown' NOT NULL,
	"flower_weeks" integer NOT NULL,
	"started_on" date NOT NULL,
	"flip_on" date,
	"harvested_on" date,
	"wet_grams" double precision,
	"dry_grams" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "grow_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"plant_id" integer NOT NULL,
	"date" date NOT NULL,
	"height_cm" double precision,
	"water_ml" integer,
	"ph" double precision,
	"ec" double precision,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "grow_plants" ADD CONSTRAINT "grow_plants_grow_id_grows_id_fk" FOREIGN KEY ("grow_id") REFERENCES "public"."grows"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "grow_logs" ADD CONSTRAINT "grow_logs_plant_id_grow_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."grow_plants"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "grows_user_idx" ON "grows" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "grow_plants_grow_idx" ON "grow_plants" USING btree ("grow_id")`,
  `CREATE INDEX IF NOT EXISTS "grow_logs_plant_idx" ON "grow_logs" USING btree ("plant_id")`,
  `CREATE TABLE IF NOT EXISTS "grow_push_log" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"kinds" jsonb NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grow_push_log_user_id_day_pk" PRIMARY KEY("user_id","day")
)`,
  `CREATE TABLE IF NOT EXISTS "grow_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plant_id" integer NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "grow_checks" ADD CONSTRAINT "grow_checks_plant_id_grow_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."grow_plants"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "grow_checks_plant_idx" ON "grow_checks" USING btree ("plant_id")`,
  `ALTER TABLE "grow_access" ADD COLUMN IF NOT EXISTS "kwh_price" double precision`,
  `ALTER TABLE "grows" ADD COLUMN IF NOT EXISTS "fan_watts" integer`,
  `CREATE TABLE IF NOT EXISTS "grow_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"grow_id" integer NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"item" text NOT NULL,
	"amount" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "grow_costs" ADD CONSTRAINT "grow_costs_grow_id_grows_id_fk" FOREIGN KEY ("grow_id") REFERENCES "public"."grows"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "grow_costs_grow_idx" ON "grow_costs" USING btree ("grow_id")`,
];
