// Repair identity/serial sequences that fell behind their table contents.
//
// Cause: rows were copied into this database with explicit ids (a data
// migration) without advancing the owning sequence. The sequence then hands out
// ids that already exist, so every INSERT fails with a duplicate-key error on
// the primary key until the counter catches up.
//
// Pass --fix to apply; without it the script only reports.
import pg from "pg";

const apply = process.argv.includes("--fix");
const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL,
});

const { rows } = await pool.query(`
  SELECT s.relname AS sequence_name, t.relname AS table_name, a.attname AS column_name
  FROM pg_class s
  JOIN pg_depend d    ON d.objid = s.oid AND d.classid = 'pg_class'::regclass
  JOIN pg_class t     ON t.oid = d.refobjid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
  WHERE s.relkind = 'S' AND t.relkind = 'r'
  ORDER BY t.relname
`);

const report = [];
for (const r of rows) {
  const { rows: mx } = await pool.query(
    `SELECT COALESCE(MAX("${r.column_name}"), 0)::bigint AS max_id FROM "${r.table_name}"`,
  );
  const { rows: sq } = await pool.query(
    `SELECT last_value, is_called FROM "${r.sequence_name}"`,
  );
  const maxId = Number(mx[0].max_id);
  // is_called=false means nextval() will return last_value itself, not +1.
  const nextId = sq[0].is_called ? Number(sq[0].last_value) + 1 : Number(sq[0].last_value);
  // Broken when the next id the sequence hands out is already taken.
  const broken = nextId <= maxId;
  report.push({ ...r, maxId, nextId, broken });
}

console.log("\n=== Sequence health ===");
console.table(
  report.map((r) => ({
    table: r.table_name,
    next_id_it_would_hand_out: r.nextId,
    highest_id_in_use: r.maxId,
    status: r.broken ? "BROKEN - every insert fails" : "ok",
  })),
);

const broken = report.filter((r) => r.broken);
if (broken.length === 0) {
  console.log("\nAll sequences are ahead of their data. Nothing to repair.");
} else if (!apply) {
  console.log(`\n${broken.length} sequence(s) need repair. Re-run with --fix to apply.`);
} else {
  for (const r of broken) {
    // setval(..., max_id, true) makes the NEXT value max_id + 1: the first free id.
    await pool.query(`SELECT setval($1::regclass, $2::bigint, true)`, [r.sequence_name, r.maxId]);
    console.log(`repaired ${r.table_name}: next id is now ${r.maxId + 1} (was ${r.nextId})`);
  }
  console.log(`\nRepaired ${broken.length} sequence(s).`);
}

await pool.end();
