/**
 * DDL for the Vorratskammer tables (lib/db/src/schema/pantry.ts), applied at server
 * start by schemaUpgrade.ts.
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent like farmSchemaStatements.ts. Do not edit by hand – change
 * pantry.ts, re-export and replace this list.
 */
export const PANTRY_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "pantry_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"crop_key" text,
	"harvest_id" integer,
	"amount" double precision NOT NULL,
	"initial_amount" double precision NOT NULL,
	"unit" text NOT NULL,
	"location" text,
	"made_on" date NOT NULL,
	"best_before" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "pantry_uses" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"date" date NOT NULL,
	"amount" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_harvest_id_harvest_logs_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvest_logs"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "pantry_uses" ADD CONSTRAINT "pantry_uses_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "pantry_uses" ADD CONSTRAINT "pantry_uses_item_id_pantry_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pantry_items"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "pantry_items_farm_idx" ON "pantry_items" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "pantry_uses_item_idx" ON "pantry_uses" USING btree ("item_id","date")`,
];
