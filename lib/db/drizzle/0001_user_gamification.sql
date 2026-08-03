-- Migration: add username and leaves_count to users table for Pflanzenretter gamification
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(8) UNIQUE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "leaves_count" integer NOT NULL DEFAULT 0;
