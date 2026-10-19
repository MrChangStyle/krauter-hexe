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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "feed_rations" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_id" integer,
	"herd_id" integer,
	"stage" text NOT NULL,
	"items" jsonb NOT NULL,
	"times" jsonb NOT NULL,
	"water_l" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
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
  `CREATE UNIQUE INDEX IF NOT EXISTS "feed_rations_animal_unique" ON "feed_rations" USING btree ("animal_id") WHERE "feed_rations"."animal_id" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "feed_rations_herd_unique" ON "feed_rations" USING btree ("herd_id") WHERE "feed_rations"."herd_id" IS NOT NULL`,
];
