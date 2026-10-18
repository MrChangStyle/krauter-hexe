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
];

export async function upgradeSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    await pool.query(statement);
  }
  logger.info({ statements: STATEMENTS.length }, "Schema up to date");
}
