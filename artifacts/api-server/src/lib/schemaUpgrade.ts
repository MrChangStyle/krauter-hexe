import { pool } from "@workspace/db";
import { logger } from "./logger";

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
];

export async function upgradeSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    await pool.query(statement);
  }
  logger.info({ statements: STATEMENTS.length }, "Schema up to date");
}
