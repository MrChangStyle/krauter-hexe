/**
 * DDL for the Bienen tables (lib/db/src/schema/bees.ts) and the honey's
 * colony in farm_yields, applied at server start by schemaUpgrade.ts.
 *
 * GENERATED from the Drizzle schema with `drizzle-kit export --sql`, then made
 * idempotent like farmSchemaStatements.ts. Do not edit by hand – change
 * bees.ts, re-export and replace this list.
 */
export const BEE_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "bee_colonies" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"apiary" text,
	"hive_type" text,
	"queen_year" integer,
	"queen_marked" boolean DEFAULT false NOT NULL,
	"queen_origin" text,
	"status" text DEFAULT 'active' NOT NULL,
	"started_on" date,
	"ended_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "bee_feedings" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"colony_id" integer NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"amount_kg" double precision NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "bee_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"colony_id" integer NOT NULL,
	"date" date NOT NULL,
	"bee_frames" integer,
	"brood_frames" integer,
	"queen_seen" boolean DEFAULT false NOT NULL,
	"eggs_seen" boolean DEFAULT false NOT NULL,
	"queen_cells" integer,
	"temper" integer,
	"food_kg" double precision,
	"mites_per_day" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "bee_treatments" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"colony_id" integer NOT NULL,
	"date" date NOT NULL,
	"method" text NOT NULL,
	"medicine_id" integer,
	"product" text,
	"dose" double precision,
	"unit" text,
	"batch" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `DO $$ BEGIN
     ALTER TABLE "bee_colonies" ADD CONSTRAINT "bee_colonies_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_feedings" ADD CONSTRAINT "bee_feedings_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_feedings" ADD CONSTRAINT "bee_feedings_colony_id_bee_colonies_id_fk" FOREIGN KEY ("colony_id") REFERENCES "public"."bee_colonies"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_inspections" ADD CONSTRAINT "bee_inspections_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_inspections" ADD CONSTRAINT "bee_inspections_colony_id_bee_colonies_id_fk" FOREIGN KEY ("colony_id") REFERENCES "public"."bee_colonies"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_treatments" ADD CONSTRAINT "bee_treatments_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_treatments" ADD CONSTRAINT "bee_treatments_colony_id_bee_colonies_id_fk" FOREIGN KEY ("colony_id") REFERENCES "public"."bee_colonies"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "bee_treatments" ADD CONSTRAINT "bee_treatments_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "bee_colonies_farm_idx" ON "bee_colonies" USING btree ("farm_id")`,
  `CREATE INDEX IF NOT EXISTS "bee_feedings_colony_idx" ON "bee_feedings" USING btree ("colony_id","date")`,
  `CREATE INDEX IF NOT EXISTS "bee_inspections_colony_idx" ON "bee_inspections" USING btree ("colony_id","date")`,
  `CREATE INDEX IF NOT EXISTS "bee_treatments_colony_idx" ON "bee_treatments" USING btree ("colony_id","date")`,
  `ALTER TABLE "farm_yields" ADD COLUMN IF NOT EXISTS "colony_id" integer`,
  `DO $$ BEGIN
     ALTER TABLE "farm_yields" ADD CONSTRAINT "farm_yields_colony_id_bee_colonies_id_fk" FOREIGN KEY ("colony_id") REFERENCES "public"."bee_colonies"("id") ON DELETE set null ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];
