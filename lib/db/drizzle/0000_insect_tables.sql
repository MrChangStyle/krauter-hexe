CREATE TYPE "public"."human_status" AS ENUM('edible', 'poisonous');--> statement-breakpoint
CREATE TYPE "public"."plant_category" AS ENUM('poisonous', 'edible', 'medicinal', 'mushroom', 'tree', 'shrub', 'moss', 'cactus');--> statement-breakpoint
CREATE TYPE "public"."poultry_status" AS ENUM('safe', 'poisonous');--> statement-breakpoint
CREATE TYPE "public"."insect_category" AS ENUM('beetle', 'butterfly', 'bee_wasp', 'fly_mosquito', 'bug_cicada', 'grasshopper', 'dragonfly', 'spider_other');--> statement-breakpoint
CREATE TYPE "public"."insect_relation_status" AS ENUM('pest', 'beneficial', 'neutral');--> statement-breakpoint
CREATE TABLE "plants" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_data" text NOT NULL,
	"image_data_side" text,
	"german_name" text NOT NULL,
	"botanical_name" text NOT NULL,
	"category" "plant_category" NOT NULL,
	"human_status" "human_status" NOT NULL,
	"poultry_status" "poultry_status" NOT NULL,
	"edibility_details" text NOT NULL,
	"animal_toxicity_details" text NOT NULL,
	"active_ingredients" text NOT NULL,
	"human_benefits" text NOT NULL,
	"poultry_benefits" text NOT NULL,
	"habitat" text DEFAULT '' NOT NULL,
	"site_conditions" text DEFAULT '' NOT NULL,
	"other_uses" text DEFAULT '' NOT NULL,
	"fertilizer_tips" text DEFAULT '' NOT NULL,
	"animals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"symptoms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"symptom_applications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"human_toxicity_level" text,
	"has_edible_fruits" boolean,
	"preparation" text DEFAULT '' NOT NULL,
	"scanned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"medicinal_verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"approved" boolean DEFAULT false NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plant_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_plant_unique" UNIQUE("user_id","plant_id")
);
--> statement-breakpoint
CREATE TABLE "plant_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plant_id" integer NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plant_scans_user_plant_unique" UNIQUE("user_id","plant_id")
);
--> statement-breakpoint
CREATE TABLE "insects" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_data" text NOT NULL,
	"german_name" text NOT NULL,
	"scientific_name" text NOT NULL,
	"category" "insect_category" NOT NULL,
	"relation_status" "insect_relation_status" NOT NULL,
	"affected_plants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text NOT NULL,
	"treatment_tips" text DEFAULT '' NOT NULL,
	"plant_context" text,
	"scanned_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insect_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"insect_id" integer NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insect_scans_user_insect_unique" UNIQUE("user_id","insect_id")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_scans" ADD CONSTRAINT "plant_scans_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insect_scans" ADD CONSTRAINT "insect_scans_insect_id_insects_id_fk" FOREIGN KEY ("insect_id") REFERENCES "public"."insects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_owner_idx" ON "users" USING btree ("is_owner") WHERE "users"."is_owner" = true;