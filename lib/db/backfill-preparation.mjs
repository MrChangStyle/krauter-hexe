#!/usr/bin/env node
// One-shot preparation backfill — runs directly against the DB + Gemini API.
// Usage: node lib/db/backfill-preparation.mjs
import pg from "pg";

const { Pool } = pg;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) { console.error("GEMINI_API_KEY not set"); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });

const PROMPT = `Du bist ein Kochexperte und Botaniker. \
Unten steht der Name einer essbaren Pflanze oder eines essbaren Pilzes. \
Beschreibe in 1-3 kurzen deutschen Sätzen, wie man sie essen oder zubereiten kann \
(z.B. roh, gekocht, als Tee, Salat, Suppe, gebraten, eingelegt, getrocknet). \
Nenne nur die gängigsten und praktischsten Zubereitungsarten. \
Antworte ausschließlich mit einem JSON-Objekt (keine Erklärungen, kein Markdown):
{ "preparation": string }`;

const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];

async function callGemini(germanName, botanicalName) {
  const prompt = `${PROMPT}\n\nPflanze: ${germanName} (${botanicalName}).\nErstelle das JSON.`;
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) { const t = await res.text(); console.warn(`  [${model}] HTTP ${res.status}: ${t.slice(0,120)}`); continue; }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      const preparation = typeof parsed.preparation === "string" ? parsed.preparation.trim() : "";
      if (preparation) return preparation;
    } catch (err) { console.warn(`  [${model}] error: ${err.message}`); }
  }
  return "";
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, german_name AS "germanName", botanical_name AS "botanicalName"
     FROM plants
     WHERE human_status = 'edible'
       AND (category = 'edible' OR category = 'mushroom')
       AND (preparation IS NULL OR preparation = '')
     ORDER BY created_at DESC`,
  );

  console.log(`Found ${rows.length} plant(s) needing preparation fill.`);
  if (rows.length === 0) { console.log("Nothing to do."); await pool.end(); return; }

  let ok = 0, fail = 0;
  for (const row of rows) {
    process.stdout.write(`  [${ok + fail + 1}/${rows.length}] ${row.germanName} … `);
    try {
      const preparation = await callGemini(row.germanName, row.botanicalName);
      if (preparation) {
        await pool.query(`UPDATE plants SET preparation = $1 WHERE id = $2`, [preparation, row.id]);  // id is integer PK
        console.log(`✓  ${preparation.slice(0, 80)}`);
        ok++;
      } else {
        console.log("⚠ leeres Ergebnis, übersprungen");
        fail++;
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      fail++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\nFertig. ${ok} aktualisiert, ${fail} fehlgeschlagen/übersprungen.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
