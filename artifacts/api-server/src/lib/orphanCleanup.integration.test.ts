/**
 * Integration test for the one-time cleanup and deleteAccount against a REAL
 * Postgres with the real schema – these functions delete production data, so
 * the generated SQL is checked for real, not against a mock.
 *
 * Skipped unless TEST_DATABASE_URL points at a throwaway database that
 * already has the schema (`DATABASE_URL=<url> pnpm --filter @workspace/db run
 * push`). Run with DATABASE_URL set to the same throwaway URL. The test empties
 * the tables it uses – never point it at real data. Run the integration files
 * one after another (they share the database):
 *   TEST_DATABASE_URL=$URL DATABASE_URL=$URL npx vitest run integration --no-file-parallelism
 */

import { beforeEach, describe, expect, it } from "vitest";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("orphan cleanup and deleteAccount (real database)", () => {
  const TABLES =
    "favorites, tasks, care_guides, push_subscriptions, plant_scans, insect_scans, scan_attempts, reports, plants, insects, users";

  async function load() {
    const { pool } = await import("@workspace/db");
    const { cleanupOrphanedData, findOrphanedData } = await import("./orphanCleanup");
    const { deleteAccount } = await import("./accountDeletion");
    return { pool, cleanupOrphanedData, findOrphanedData, deleteAccount };
  }

  async function count(table: string, where = "true"): Promise<number> {
    const { pool } = await load();
    const res = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`);
    return res.rows[0].n as number;
  }

  /** Seeds every user-linked table for one user id. */
  async function seedFor(userId: string, label: string) {
    const { pool } = await load();
    const plant = await pool.query(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status,
         edibility_details, animal_toxicity_details, active_ingredients, human_benefits,
         poultry_benefits, scanned_by_user_id)
       VALUES ($1, $1, 'medicinal', 'edible', 'safe', '', '', '', '', '', $2) RETURNING id`,
      [`Pflanze ${label}`, userId],
    );
    const plantId = plant.rows[0].id as number;
    const insect = await pool.query(
      `INSERT INTO insects (german_name, scientific_name, category, relation_status, description, scanned_by_user_id)
       VALUES ($1, $1, 'beetle', 'neutral', '', $2) RETURNING id`,
      [`Insekt ${label}`, userId],
    );
    const insectId = insect.rows[0].id as number;
    await pool.query(`INSERT INTO favorites (user_id, plant_id) VALUES ($1, $2)`, [userId, plantId]);
    await pool.query(
      `INSERT INTO tasks (user_id, plant_id, action_type, interval_value, interval_unit, reminder_time)
       VALUES ($1, $2, 'Gießen', 1, 'Tage', '08:00')`,
      [userId, plantId],
    );
    await pool.query(
      `INSERT INTO care_guides (user_id, plant_name, start_date, end_date, daily_plan)
       VALUES ($1, 'x', now(), now(), '[]')`,
      [userId],
    );
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'k', 'a')`,
      [userId, `https://push.example/${label}`],
    );
    await pool.query(`INSERT INTO plant_scans (user_id, plant_id) VALUES ($1, $2)`, [userId, plantId]);
    await pool.query(`INSERT INTO insect_scans (user_id, insect_id) VALUES ($1, $2)`, [userId, insectId]);
    await pool.query(`INSERT INTO scan_attempts (user_id, scan_type) VALUES ($1, 'plant')`, [userId]);
    await pool.query(
      `INSERT INTO reports (user_id, content_type, content_id, reason) VALUES ($1, 'plant_image', $2, 'falsch')`,
      [userId, String(plantId)],
    );
  }

  beforeEach(async () => {
    const { pool } = await load();
    await pool.query(`TRUNCATE ${TABLES} RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO users (id, email) VALUES ('alive', 'alive@example.org')`);
    await pool.query(
      `INSERT INTO users (id, email, is_owner, approved) VALUES ('owner', 'owner@example.org', true, true)`,
    );
    await seedFor("alive", "lebt");
    await seedFor("gone", "verwaist"); // no users row: what an old "Entfernen" left behind
    await pool.query(`INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status,
         edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
       VALUES ('Ohne Scanner', 'x', 'tree', 'edible', 'safe', '', '', '', '', '')`);
  });

  it("finds exactly the rows of the missing account", async () => {
    const { findOrphanedData } = await load();
    expect(await findOrphanedData()).toEqual({
      favorites: 1,
      tasks: 1,
      care_guides: 1,
      push_subscriptions: 1,
      plant_scans: 1,
      insect_scans: 1,
      scan_attempts: 1,
      reports: 1,
      plants: 1,
      insects: 1,
    });
    // Looking changes nothing.
    expect(await count("favorites")).toBe(2);
  });

  it("removes the leftovers, unlinks archive entries and leaves everyone else alone", async () => {
    const { cleanupOrphanedData, findOrphanedData } = await load();
    const result = await cleanupOrphanedData();

    expect(Object.values(result).every((n) => n === 1)).toBe(true);
    expect(Object.values(await findOrphanedData()).every((n) => n === 0)).toBe(true);

    for (const table of [
      "favorites",
      "tasks",
      "care_guides",
      "push_subscriptions",
      "plant_scans",
      "insect_scans",
      "scan_attempts",
      "reports",
    ]) {
      expect(await count(table, "user_id = 'gone'")).toBe(0);
      expect(await count(table, "user_id = 'alive'")).toBe(1);
    }
    // Archive entries stay – the orphaned ones just lose their scanner.
    expect(await count("plants")).toBe(3);
    expect(await count("insects")).toBe(2);
    expect(await count("plants", "scanned_by_user_id = 'gone'")).toBe(0);
    expect(await count("plants", "scanned_by_user_id = 'alive'")).toBe(1);
    expect(await count("users")).toBe(2);
  });

  it("deleteAccount removes one account completely and nothing of anyone else", async () => {
    const { deleteAccount } = await load();
    expect(await deleteAccount("alive")).toBe(true);

    expect(await count("users", "id = 'alive'")).toBe(0);
    expect(await count("favorites", "user_id = 'alive'")).toBe(0);
    expect(await count("tasks", "user_id = 'alive'")).toBe(0);
    expect(await count("plants", "scanned_by_user_id = 'alive'")).toBe(0);
    expect(await count("plants")).toBe(3);
    // The other (orphaned) user's rows are untouched by a single deletion.
    expect(await count("favorites", "user_id = 'gone'")).toBe(1);
  });

  it("deleteAccount refuses the owner", async () => {
    const { deleteAccount } = await load();
    await expect(deleteAccount("owner")).rejects.toThrow();
    expect(await count("users", "id = 'owner'")).toBe(1);
  });
});
