/**
 * DDL for the Beet-Architekt tables (lib/db/src/schema/garden.ts), applied at
 * server start by schemaUpgrade.ts after the farm tables (garden_beds refers
 * to farms).
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent like farmSchemaStatements.ts. Do not edit by hand – change
 * garden.ts, re-export and replace this list.
 */
export const GARDEN_SCHEMA_STATEMENTS: readonly string[] = [
  `DO $$ BEGIN
     CREATE TYPE "public"."bed_orientation" AS ENUM('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."bed_type" AS ENUM('raised', 'bed', 'greenhouse', 'coldframe', 'container');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."frost_source" AS ENUM('default', 'climate', 'manual');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."soil_texture" AS ENUM('sandy', 'loamy', 'clay');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."wind_protection" AS ENUM('none', 'partial', 'good');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "frost_climate" (
	"lat_key" integer NOT NULL,
	"lon_key" integer NOT NULL,
	"last_frost" text NOT NULL,
	"first_frost" text NOT NULL,
	"years" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frost_climate_lat_key_lon_key_pk" PRIMARY KEY("lat_key","lon_key")
)`,
  `CREATE TABLE IF NOT EXISTS "garden_beds" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "bed_type" NOT NULL,
	"length_cm" integer NOT NULL,
	"width_cm" integer NOT NULL,
	"height_cm" integer,
	"postal_code" text,
	"latitude" double precision,
	"longitude" double precision,
	"sun_hours" integer,
	"orientation" "bed_orientation",
	"wind_protection" "wind_protection",
	"soil_texture" "soil_texture",
	"soil_ph" double precision,
	"last_frost" text DEFAULT '05-15' NOT NULL,
	"first_frost" text DEFAULT '10-15' NOT NULL,
	"frost_source" "frost_source" DEFAULT 'default' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "garden_beds" ADD CONSTRAINT "garden_beds_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "garden_beds_farm_idx" ON "garden_beds" USING btree ("farm_id")`,
];
