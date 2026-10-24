/**
 * Meine Daten herunterladen (docs/datenexport.md, Art. 15 und 20 DSGVO): one
 * JSON file with everything stored about the account – profile, the rows of
 * every personal table (PERSONAL_TABLES, the same list account deletion
 * uses), archive entries it scanned, its farm memberships and, for farms it
 * runs as admin, the farm's data.
 *
 * Left out: secrets (password hash, push keys, camera secrets) and bulky
 * copies (inline photos, move parcels) – photos are given as links.
 */

import { db, farmMembershipsTable, farmsTable, pool, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

import { ARCHIVE_TABLES, PERSONAL_TABLES } from './accountDeletion';

const LEFT_OUT = /hash|secret|password|token|p256dh|^auth$|payload|relay_?url|^image_?data/i;
// Bookkeeping of sent reminders, nothing anyone entered.
const INTERNAL = ['farm_memberships', 'farm_push_log', 'feed_digest_log', 'garden_digest_log', 'weather_digest_log'];

type Row = Record<string, unknown>;

function clean(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !LEFT_OUT.test(key)));
}

/** Tables that belong to a farm (have farm_id) – read from the database itself, so new modules are included. */
async function farmTables(): Promise<string[]> {
  const res = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'farm_id'
     ORDER BY table_name`,
  );
  return res.rows.map((r) => r.table_name).filter((t) => !INTERNAL.includes(t));
}

export async function exportAccountData(userId: string, now = new Date()) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;

  const personal: Record<string, Row[]> = {};
  for (const { name, table, userId: column } of PERSONAL_TABLES) {
    const rows = (await db.select().from(table).where(eq(column, userId))) as Row[];
    if (rows.length > 0) personal[name] = rows.map(clean);
  }

  // Grow-Tagebuch: plants, logs and costs hang off the account's grows.
  const growIds = (personal['grows'] ?? []).map((g) => g['id']);
  if (growIds.length > 0) {
    const plants = (await pool.query(`SELECT * FROM grow_plants WHERE grow_id = ANY($1) ORDER BY id`, [growIds])).rows as Row[];
    const plantIds = plants.map((p) => p['id']);
    const more: [string, Row[]][] = [
      ['grow_plants', plants],
      ['grow_costs', (await pool.query(`SELECT * FROM grow_costs WHERE grow_id = ANY($1) ORDER BY id`, [growIds])).rows],
      ['grow_logs', (await pool.query(`SELECT * FROM grow_logs WHERE plant_id = ANY($1) ORDER BY id`, [plantIds])).rows],
      ['grow_checks', (await pool.query(`SELECT * FROM grow_checks WHERE plant_id = ANY($1) ORDER BY id`, [plantIds])).rows],
    ];
    for (const [name, rows] of more) if (rows.length > 0) personal[name] = rows.map(clean);
  }

  const scanned: Record<string, Row[]> = {};
  for (const { name, table, userId: column } of ARCHIVE_TABLES) {
    const rows = (await db.select().from(table).where(eq(column, userId))) as Row[];
    if (rows.length > 0) scanned[name] = rows.map(clean);
  }

  const memberships = await db
    .select({ farmId: farmsTable.id, farm: farmsTable.name, role: farmMembershipsTable.role, since: farmMembershipsTable.createdAt, accessUntil: farmMembershipsTable.accessUntil, modules: farmMembershipsTable.modules })
    .from(farmMembershipsTable)
    .innerJoin(farmsTable, eq(farmsTable.id, farmMembershipsTable.farmId))
    .where(eq(farmMembershipsTable.userId, userId));

  // The farms it runs: their data is the account's data too.
  const tables = await farmTables();
  const farms = [];
  for (const m of memberships.filter((x) => x.role === 'admin')) {
    const [farm] = (await pool.query(`SELECT * FROM "farms" WHERE id = $1`, [m.farmId])).rows as Row[];
    const data: Record<string, Row[]> = {};
    for (const t of tables) {
      // Table names come from the database catalogue, never from the request.
      const rows = (await pool.query(`SELECT * FROM "${t.replace(/"/g, '""')}" WHERE farm_id = $1 ORDER BY 1`, [m.farmId])).rows as Row[];
      if (rows.length > 0) data[t] = rows.map(clean);
    }
    farms.push({ farm: clean(farm ?? {}), data });
  }

  return {
    exportedAt: now.toISOString(),
    app: 'Little Farming',
    note: 'Alles, was Little Farming zu deinem Konto speichert. Fotos stehen als Link; Fotos, die nur auf deinem Gerät liegen („Meine Scans“), sind nicht dabei.',
    account: clean(user as unknown as Row),
    personal,
    scannedByYou: scanned,
    memberships,
    farmsYouRun: farms,
  };
}
