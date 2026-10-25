/**
 * DDL for the Weide tables (lib/db/src/schema/pasture.ts), applied at server
 * start by schemaUpgrade.ts.
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent like farmSchemaStatements.ts. Do not edit by hand – change
 * pasture.ts, re-export and replace this list.
 */
export const PASTURE_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "pasture_grazings" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"pasture_id" integer NOT NULL,
	"herd_id" integer,
	"label" text NOT NULL,
	"animals" integer NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "pastures" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'pasture' NOT NULL,
	"area_ha" double precision,
	"boundary" jsonb,
	"rest_days" integer DEFAULT 35 NOT NULL,
	"max_graze_days" integer DEFAULT 10 NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "pasture_grazings" ADD CONSTRAINT "pasture_grazings_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "pasture_grazings" ADD CONSTRAINT "pasture_grazings_pasture_id_pastures_id_fk" FOREIGN KEY ("pasture_id") REFERENCES "public"."pastures"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "pasture_grazings" ADD CONSTRAINT "pasture_grazings_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "pastures" ADD CONSTRAINT "pastures_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "pasture_grazings_pasture_idx" ON "pasture_grazings" USING btree ("pasture_id","start_on")`,
  `CREATE INDEX IF NOT EXISTS "pastures_farm_idx" ON "pastures" USING btree ("farm_id")`,
];
