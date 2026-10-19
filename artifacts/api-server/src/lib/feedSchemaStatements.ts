/**
 * DDL for the Futterplaner tables (lib/db/src/schema/feed.ts), applied at
 * server start by schemaUpgrade.ts after the farm tables.
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent like farmSchemaStatements.ts. Do not edit by hand – change
 * feed.ts, re-export and replace this list.
 */
export const FEED_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "farm_feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"values" jsonb NOT NULL,
	"for_species" jsonb,
	"botanical_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"additives" jsonb
)`,
  `ALTER TABLE "farm_feeds" ADD COLUMN IF NOT EXISTS "additives" jsonb`,
  `CREATE TABLE IF NOT EXISTS "feed_rations" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_id" integer,
	"herd_id" integer,
	"stage" text NOT NULL,
	"items" jsonb NOT NULL,
	"times" jsonb NOT NULL,
	"water_l" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"season" text DEFAULT 'all' NOT NULL,
	"previous_items" jsonb,
	"change_started_on" date,
	"change_days" integer
)`,
  `ALTER TABLE "feed_rations" ADD COLUMN IF NOT EXISTS "season" text DEFAULT 'all' NOT NULL`,
  `ALTER TABLE "feed_rations" ADD COLUMN IF NOT EXISTS "previous_items" jsonb`,
  `ALTER TABLE "feed_rations" ADD COLUMN IF NOT EXISTS "change_started_on" date`,
  `ALTER TABLE "feed_rations" ADD COLUMN IF NOT EXISTS "change_days" integer`,
  `DO $$ BEGIN
     ALTER TABLE "farm_feeds" ADD CONSTRAINT "farm_feeds_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feed_rations" ADD CONSTRAINT "feed_rations_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feed_rations" ADD CONSTRAINT "feed_rations_animal_id_farm_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."farm_animals"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feed_rations" ADD CONSTRAINT "feed_rations_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "farm_feeds_farm_idx" ON "farm_feeds" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "feed_rations_farm_idx" ON "feed_rations" USING btree ("farm_id")`,
  // Step 3: one ration per target AND season (all year, summer, winter).
  `DROP INDEX IF EXISTS "feed_rations_animal_unique"`,
  `DROP INDEX IF EXISTS "feed_rations_herd_unique"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "feed_rations_animal_season_unique" ON "feed_rations" USING btree ("animal_id","season") WHERE "feed_rations"."animal_id" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "feed_rations_herd_season_unique" ON "feed_rations" USING btree ("herd_id","season") WHERE "feed_rations"."herd_id" IS NOT NULL`,
  // Step 4: Vorrat.
  `CREATE TABLE IF NOT EXISTS "feed_stocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"feed_key" text,
	"feed_id" integer,
	"stock_kg" double precision NOT NULL,
	"counted_on" date NOT NULL,
	"package_kg" double precision,
	"price_per_kg" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "feed_stocks" ADD CONSTRAINT "feed_stocks_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "feed_stocks" ADD CONSTRAINT "feed_stocks_feed_id_farm_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."farm_feeds"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "feed_stocks_farm_idx" ON "feed_stocks" USING btree ("farm_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "feed_stocks_farm_key_unique" ON "feed_stocks" USING btree ("farm_id","feed_key") WHERE "feed_stocks"."feed_key" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "feed_stocks_feed_unique" ON "feed_stocks" USING btree ("feed_id") WHERE "feed_stocks"."feed_id" IS NOT NULL`,
];
