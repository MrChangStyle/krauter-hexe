/**
 * Datentrennung (docs/datentrennung.md) against a REAL Postgres: every farm
 * route of the app, found by walking the real router – a new route is covered
 * without touching this file.
 *
 * Two farms full of demo data (A of anna, B of bert). For every route:
 *  1. a stranger (bert) asking for farm A gets 404 – not even "forbidden";
 *  2. bert on HIS farm with the ids of A's records (animal, bed, colony …)
 *     changes nothing on A and reads nothing of A;
 *  3. a guest of A changes nothing (403 on every write);
 *  4. a caretaker of A without granted modules gets 403 on every module route.
 * After all of it, farm A's rows are byte for byte what they were.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (a throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { moduleOfRequest } from "./farmModuleAccess";

vi.mock("./webPush", () => ({ sendPushToUser: () => Promise.resolve(0), sendPushToUsers: () => Promise.resolve(0) }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

interface Route {
  method: string;
  path: string;
}

/** Every route of the router, depth first, as registered. */
function routesOf(router: { stack: unknown[] }): Route[] {
  const out: Route[] = [];
  const walk = (stack: unknown[]) => {
    for (const layer of stack as Array<{ route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }>) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: layer.route.path });
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(router.stack);
  return out;
}

/**
 * Where the id for a route parameter comes from: the table, chosen by the
 * path segment in front of it where one name means different records.
 */
const PARAM_TABLE: Record<string, string> = {
  animalId: "farm_animals",
  herdId: "herds",
  bedId: "garden_beds",
  plantingId: "bed_plantings",
  colonyId: "bee_colonies",
  entryId: "bee_inspections",
  pastureId: "pastures",
  grazingId: "pasture_grazings",
  cutId: "pasture_cuts",
  itemId: "pantry_items",
  useId: "pantry_uses",
  seedId: "seeds",
  cameraId: "cameras",
  rationId: "feed_rations",
  feedId: "farm_feeds",
  stockId: "feed_stocks",
  logId: "food_logs",
  medicineId: "medicines",
  contactId: "farm_contacts",
  checkId: "bee_site_checks",
  yieldId: "farm_yields",
  weightId: "weight_logs",
  saleId: "farm_sales",
  expenseId: "farm_expenses",
  costId: "farm_expenses",
  hoursId: "garden_hours",
  heatId: "heat_records",
  harvestId: "harvest_logs",
  taskId: "farm_tasks",
  commentId: "farm_task_comments",
  "medical/recordId": "medical_records",
  "breeding/recordId": "breeding_records",
};

/** Fixed values for parameters that are not record ids. */
function fixedParam(name: string, year: number): string | null {
  switch (name) {
    case "season":
    case "year":
      return String(year);
    case "species":
      return "poultry";
    case "kind":
      return "inspections";
    case "dutyKey":
      return "tsk";
    default:
      return null;
  }
}

describe.skipIf(!enabled)("Datentrennung über alle Hof-Endpunkte (real database)", () => {
  let server: Server;
  let base = "";
  let farmA = 0;
  let farmB = 0;
  const year = new Date().getFullYear();
  let farmRoutes: Route[] = [];
  let farmTables: string[] = [];
  const idsOfA = new Map<string, number>();

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  async function call(as: string, method: string, path: string): Promise<{ status: number; text: string }> {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-test-user": as },
      body: method === "GET" || method === "DELETE" ? undefined : "{}",
    });
    return { status: res.status, text: await res.text() };
  }

  /** Farm A's rows in every farm table – compared before and after. */
  async function snapshotOfA(): Promise<string> {
    const parts: string[] = [];
    for (const table of farmTables) {
      const rows = await q(`SELECT * FROM "${table}" WHERE farm_id = $1 ORDER BY 1`, [farmA]);
      parts.push(`${table}:${JSON.stringify(rows)}`);
    }
    parts.push(`farms:${JSON.stringify(await q("SELECT * FROM farms WHERE id = $1", [farmA]))}`);
    return parts.join("\n");
  }

  /** The concrete path: :farmId → the given farm, record ids → A's records. */
  function fill(path: string, farmId: number): string | null {
    let missing = false;
    const filled = path.replace(/\/([^/]+)\/:([A-Za-z]+)|\/:([A-Za-z]+)/g, (whole, segment: string | undefined, named: string | undefined, bare: string | undefined) => {
      const name = (named ?? bare)!;
      const prefix = segment ? `/${segment}` : "";
      if (name === "farmId") return `${prefix}/${farmId}`;
      const fixed = fixedParam(name, year);
      if (fixed !== null) return `${prefix}/${fixed}`;
      if (name === "userId") return `${prefix}/anna`;
      const id = idsOfA.get(`${segment}/${name}`) ?? idsOfA.get(name);
      if (id === undefined) {
        missing = true;
        return whole;
      }
      return `${prefix}/${id}`;
    });
    return missing ? null : filled;
  }

  beforeAll(async () => {
    process.env["JWT_SECRET"] ??= "integration-test-secret-0123456789";
    // The router pulls in the AI client, which wants a key; no test here
    // gets as far as calling it.
    process.env["GEMINI_API_KEY"] ??= "test-key-not-used";
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header("x-test-user");
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => !!id;
      if (id) (req as unknown as { user: unknown }).user = { id, approved: true, isOwner: false, email: `${id}@example.org` };
      next();
    });
    const router = (await import("../routes/index")).default;
    app.use("/api", router);
    farmRoutes = routesOf(router as unknown as { stack: unknown[] }).filter((r) => r.path.includes(":farmId"));
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    farmTables = (
      await q<{ table_name: string }>(
        "SELECT table_name FROM information_schema.columns WHERE column_name = 'farm_id' AND table_schema = 'public' ORDER BY 1",
      )
    ).map((r) => r.table_name);

    await q("TRUNCATE users, farms RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES
      ('anna', 'anna@example.org', true), ('bert', 'bert@example.org', true),
      ('gast', 'gast@example.org', true), ('karl', 'karl@example.org', true)`);
    const { loadDemo } = await import("./demoData");
    farmA = (await loadDemo("anna")).farmId!;
    farmB = (await loadDemo("bert")).farmId!;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'gast', 'guest')`, [farmA]);
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role, modules) VALUES ($1, 'karl', 'caretaker', '[]'::jsonb)`, [farmA]);

    // Records the demo does not have.
    await q(`INSERT INTO farm_sales (farm_id, date, label, revenue_eur) VALUES ($1, current_date, 'Eier', 12)`, [farmA]);
    await q(`INSERT INTO food_logs (farm_id, date) VALUES ($1, current_date)`, [farmA]);
    await q(`INSERT INTO farm_feeds (farm_id, name, category, "values") VALUES ($1, 'Hafer', 'grain', '{}'::jsonb)`, [farmA]);

    for (const [param, table] of Object.entries(PARAM_TABLE)) {
      const [row] = await q<{ id: number }>(`SELECT id FROM "${table}" WHERE farm_id = $1 ORDER BY id LIMIT 1`, [farmA]);
      if (row) idsOfA.set(param, row.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  it("finds the farm routes and an id of farm A for every record parameter", () => {
    expect(farmRoutes.length).toBeGreaterThan(150);
    const unfilled = farmRoutes.filter((r) => fill(r.path, farmA) === null).map((r) => `${r.method} ${r.path}`);
    expect(unfilled).toEqual([]);
  });

  it("a stranger gets 404 on every route of farm A and changes nothing", async () => {
    const before = await snapshotOfA();
    const wrong: string[] = [];
    for (const route of farmRoutes) {
      const path = fill(route.path, farmA)!;
      const res = await call("bert", route.method, path);
      if (res.status !== 404) wrong.push(`${route.method} ${path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
    expect(await snapshotOfA()).toBe(before);
  }, 120_000);

  it("ids of farm A used on another farm reach nothing of farm A", async () => {
    const before = await snapshotOfA();
    const leaks: string[] = [];
    for (const route of farmRoutes) {
      // Only routes that name a record: the rest act on the caller's own farm.
      if (!/:(?!farmId\b)[A-Za-z]+Id\b/.test(route.path)) continue;
      const path = fill(route.path, farmB)!;
      const res = await call("bert", route.method, path);
      if (route.method === "GET" && res.status < 300) leaks.push(`${route.method} ${path} → ${res.status}`);
      if (res.status >= 500) leaks.push(`${route.method} ${path} → ${res.status} ${res.text.slice(0, 120)}`);
    }
    expect(leaks).toEqual([]);
    expect(await snapshotOfA()).toBe(before);
  }, 120_000);

  it("a guest cannot change anything on farm A", async () => {
    const before = await snapshotOfA();
    const wrong: string[] = [];
    for (const route of farmRoutes) {
      if (route.method === "GET") continue;
      // Leaving the farm is the one thing a guest may do – tested in farmMembers.
      if (route.method === "DELETE" && route.path === "/farms/:farmId/members/:userId") continue;
      const path = fill(route.path, farmA)!;
      const res = await call("gast", route.method, path);
      if (res.status !== 403) wrong.push(`${route.method} ${path} → ${res.status}`);
    }
    expect(wrong).toEqual([]);
    expect(await snapshotOfA()).toBe(before);
  }, 120_000);

  it("a caretaker without granted modules gets 403 on every module route", async () => {
    const before = await snapshotOfA();
    const wrong: string[] = [];
    let checked = 0;
    for (const route of farmRoutes) {
      const path = fill(route.path, farmA)!;
      if (!moduleOfRequest(route.method, path)) continue;
      checked += 1;
      const res = await call("karl", route.method, path);
      if (res.status !== 403) wrong.push(`${route.method} ${path} → ${res.status}`);
    }
    expect(checked).toBeGreaterThan(80);
    expect(wrong).toEqual([]);
    expect(await snapshotOfA()).toBe(before);
  }, 120_000);
});
