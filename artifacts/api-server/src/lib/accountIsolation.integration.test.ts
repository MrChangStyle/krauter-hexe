/**
 * Datentrennung beyond the farms (docs/datentrennung.md), against a REAL
 * Postgres and the real router:
 *  1. without signing in, only the listed public routes answer – every other
 *     route says 401;
 *  2. every owner-only route (requireOwner) refuses a normal account;
 *  3. personal records (Pflegeplan, Pflege-Guides, Alltagsnotizen, Grow) of
 *     one account cannot be read or changed by another account through any
 *     route that names them.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (a throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("./webPush", () => ({ sendPushToUser: () => Promise.resolve(0), sendPushToUsers: () => Promise.resolve(0) }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

interface Route {
  method: string;
  path: string;
  guards: string[];
}

function routesOf(router: { stack: unknown[] }): Route[] {
  const out: Route[] = [];
  const walk = (stack: unknown[]) => {
    for (const layer of stack as Array<{
      route?: { path: string; methods: Record<string, boolean>; stack: Array<{ name: string }> };
      handle?: { stack?: unknown[] };
    }>) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          out.push({ method: method.toUpperCase(), path: layer.route.path, guards: layer.route.stack.map((s) => s.name) });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(router.stack);
  return out;
}

/**
 * Routes that answer without an account – each for a reason: signing in and
 * out, the homepage, health and status, error reports, and the cron call
 * with its own secret. Anything new here needs a reason, too.
 */
const PUBLIC = new Set([
  "GET /healthz",
  "GET /status",
  "GET /app-config",
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/logout",
  "GET /auth/user",
  "GET /auth/providers",
  "GET /auth/google",
  "GET /auth/google/callback",
  "POST /auth/password-reset",
  "POST /auth/password-reset/check",
  "POST /auth/password-reset/confirm",
  "POST /feedback/site",
  "POST /client-errors",
  "POST /cron/trigger-notifications",
]);

/** Personal records: which table an id in a route belongs to. */
const PERSONAL: Array<{ match: RegExp; table: string }> = [
  { match: /^\/tasks\/:id/, table: "tasks" },
  { match: /^\/care-guides\/:id/, table: "care_guides" },
  { match: /^\/notes\/:noteId/, table: "daily_notes" },
  { match: /^\/grow\/grows\/:growId/, table: "grows" },
  { match: /^\/grow\/plants\/:plantId/, table: "grow_plants" },
  { match: /^\/grow\/logs\/:logId/, table: "grow_logs" },
  { match: /^\/grow\/costs\/:costId/, table: "grow_costs" },
  { match: /^\/grow\/checks\/:checkId/, table: "grow_checks" },
];

describe.skipIf(!enabled)("Datentrennung: Konten, Betreiber, persönliche Daten (real database)", () => {
  let server: Server;
  let base = "";
  let routes: Route[] = [];
  const ids = new Map<string, number>();

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  async function call(as: string | null, method: string, path: string) {
    const res = await fetch(`${base}/api${path}`, {
      method,
      redirect: "manual",
      headers: { "Content-Type": "application/json", ...(as ? { "x-test-user": as } : {}) },
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });
    return { status: res.status, text: await res.text() };
  }

  /** Everything of anna's that the personal routes reach. */
  async function snapshotOfAnna(): Promise<string> {
    const parts: string[] = [];
    for (const table of ["tasks", "care_guides", "daily_notes", "grows"]) {
      parts.push(JSON.stringify(await q(`SELECT * FROM "${table}" WHERE user_id = 'anna' ORDER BY id`)));
    }
    parts.push(JSON.stringify(await q(`SELECT * FROM grow_plants ORDER BY id`)));
    for (const table of ["grow_logs", "grow_costs", "grow_checks"]) {
      parts.push(JSON.stringify(await q(`SELECT * FROM "${table}" ORDER BY id`)));
    }
    return parts.join("\n");
  }

  beforeAll(async () => {
    process.env["JWT_SECRET"] ??= "integration-test-secret-0123456789";
    process.env["GEMINI_API_KEY"] ??= "test-key-not-used";
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header("x-test-user");
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => !!id;
      if (id) (req as unknown as { user: unknown }).user = { id, approved: true, isOwner: id === "chef", email: `${id}@example.org` };
      next();
    });
    const router = (await import("../routes/index")).default;
    app.use("/api", router);
    routes = routesOf(router as unknown as { stack: unknown[] });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await q("TRUNCATE users, plants, tasks, care_guides, daily_notes, grows, grow_access RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES
      ('chef', 'chef@example.org', true, true), ('anna', 'anna@example.org', true, false), ('bert', 'bert@example.org', true, false)`);
    // Both may use Grow, so its routes get as far as the ownership check.
    await q(`INSERT INTO grow_access (user_id, unlocked_at, age_confirmed_at, adults) VALUES ('anna', now(), now(), 1), ('bert', now(), now(), 1)`);
    const [plant] = await q<{ id: number }>(`INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status,
         edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
       VALUES ('Minze', 'Mentha', 'medicinal', 'edible', 'safe', '', '', '', '', '') RETURNING id`);
    const one = async (sql: string, params: unknown[] = []) => (await q<{ id: number }>(sql, params))[0]!.id;
    ids.set("tasks", await one(`INSERT INTO tasks (user_id, plant_id, action_type, interval_value, interval_unit, reminder_time) VALUES ('anna', $1, 'Gießen', 2, 'Tage', '08:00') RETURNING id`, [plant!.id]));
    ids.set("care_guides", await one(`INSERT INTO care_guides (user_id, plant_name, start_date, end_date, daily_plan) VALUES ('anna', 'Minze', now(), now() + interval '30 days', '[]') RETURNING id`));
    ids.set("daily_notes", await one(`INSERT INTO daily_notes (user_id, kind, text) VALUES ('anna', 'einkauf', 'Hafer') RETURNING id`));
    const growId = await one(`INSERT INTO grows (user_id, name, environment, medium) VALUES ('anna', 'Zelt', 'indoor', 'soil') RETURNING id`);
    ids.set("grows", growId);
    const growPlant = await one(`INSERT INTO grow_plants (grow_id, name, strain_type, flowering, flower_weeks, started_on) VALUES ($1, 'Eins', 'hybrid', 'auto', 9, current_date) RETURNING id`, [growId]);
    ids.set("grow_plants", growPlant);
    ids.set("grow_logs", await one(`INSERT INTO grow_logs (plant_id, date) VALUES ($1, current_date) RETURNING id`, [growPlant]));
    ids.set("grow_costs", await one(`INSERT INTO grow_costs (grow_id, date, category, item, amount) VALUES ($1, current_date, 'strom', 'Strom', 3) RETURNING id`, [growId]));
    ids.set("grow_checks", await one(`INSERT INTO grow_checks (plant_id, kind, date, result) VALUES ($1, 'health', current_date, '{}'::jsonb) RETURNING id`, [growPlant]));
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it("without an account only the public routes answer", async () => {
    const open: string[] = [];
    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      if (PUBLIC.has(key)) continue;
      const res = await call(null, route.method, route.path.replace(/:[A-Za-z]+/g, "1"));
      if (res.status !== 401) open.push(`${key} → ${res.status}`);
    }
    expect(open).toEqual([]);
  }, 120_000);

  it("owner-only routes refuse a normal account", async () => {
    const ownerRoutes = routes.filter((r) => r.guards.includes("requireOwner"));
    expect(ownerRoutes.length).toBeGreaterThan(15);
    const wrong: string[] = [];
    for (const route of ownerRoutes) {
      const res = await call("bert", route.method, route.path.replace(/:[A-Za-z]+/g, "1"));
      if (res.status !== 403) wrong.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
  }, 120_000);

  it("another account reaches none of anna's personal records", async () => {
    const before = await snapshotOfAnna();
    const leaks: string[] = [];
    let checked = 0;
    for (const route of routes) {
      const personal = PERSONAL.find((p) => p.match.test(route.path));
      if (!personal) continue;
      checked += 1;
      const path = route.path.replace(/:[A-Za-z]+/, String(ids.get(personal.table)));
      const res = await call("bert", route.method, path);
      if (res.status < 300 && (route.method === "GET" || res.text.includes("anna"))) leaks.push(`${route.method} ${path} → ${res.status}`);
      if (res.status >= 500) leaks.push(`${route.method} ${path} → ${res.status} ${res.text.slice(0, 120)}`);
    }
    expect(checked).toBeGreaterThan(20);
    expect(leaks).toEqual([]);
    expect(await snapshotOfAnna()).toBe(before);

    // And anna herself still gets them – the ids are real.
    expect((await call("anna", "GET", `/care-guides/${ids.get("care_guides")}`)).status).toBe(200);
    expect((await call("anna", "DELETE", `/grow/checks/${ids.get("grow_checks")}`)).status).toBeLessThan(300);
    expect(await q("SELECT id FROM grow_checks")).toEqual([]);
  }, 120_000);
});
