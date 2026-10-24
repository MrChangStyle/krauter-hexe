/**
 * Demo-Daten against a REAL Postgres, through the HTTP routes: loading fills a
 * Demo-Hof with two examples per module, a second load is refused, deleting
 * removes the Demo-Hof and the demo grow but nothing real, and the grow only
 * comes for accounts that confirmed their age.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => "2026-04-01" }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const MODULE_TABLES = ["herds", "farm_tasks", "feed_stocks", "breeding_records", "medicines", "farm_yields", "cameras", "garden_beds", "bed_plantings", "seeds", "farm_contacts", "bee_colonies", "bee_inspections", "pantry_items", "pastures", "pasture_grazings"];

describe.skipIf(!enabled)("Demo-Daten (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }
  const count = async (table: string, farmId: number) =>
    Number((await q<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE farm_id = $1`, [farmId]))[0]!.n);

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: false };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/demo")).default);
    app.use((await import("../routes/grow")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE users, farms, grow_access, grows RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'anna@x.de', true), ('bert', 'bert@x.de', true)`);
    as = "anna";
  });

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };

  it("loads two examples per module onto a Demo-Hof, once, and deletes them again", async () => {
    expect((await api("GET", "/demo")).data).toEqual({ active: false, farmId: null });
    const r = await api("POST", "/demo");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const farmId = r.data.farmId as number;
    expect(r.data.active).toBe(true);
    expect(await q("SELECT name, is_demo FROM farms WHERE id = $1", [farmId])).toEqual([{ name: "Demo-Hof", is_demo: true }]);
    expect(await q("SELECT user_id, role FROM farm_memberships WHERE farm_id = $1", [farmId])).toEqual([{ user_id: "anna", role: "admin" }]);
    for (const table of MODULE_TABLES) expect(await count(table, farmId), table).toBeGreaterThanOrEqual(2);
    // No grow without the age confirmed.
    expect(await q("SELECT id FROM grows")).toEqual([]);

    expect((await api("GET", "/demo")).data).toEqual({ active: true, farmId });
    expect((await api("POST", "/demo")).status).toBe(409);

    const d = await api("DELETE", "/demo");
    expect(d.data).toEqual({ active: false, farmId: null });
    expect(await q("SELECT id FROM farms")).toEqual([]);
    for (const table of MODULE_TABLES) expect(await count(table, farmId), table).toBe(0);
    // Loading again works after deleting.
    expect((await api("POST", "/demo")).status).toBe(200);
  });

  it("adds a demo grow for confirmed adults and keeps real farms and grows on delete", async () => {
    await api("POST", "/grow/access", { adults: 1 });
    const real = await api("POST", "/grow/grows", { name: "Mein Zelt", environment: "indoor", medium: "soil" });
    expect(real.status).toBe(201);
    const [realFarm] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Echter Hof') RETURNING id");
    await q("INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin')", [realFarm!.id]);

    await api("POST", "/demo");
    const grows = await q<{ name: string; is_demo: boolean; id: number }>("SELECT id, name, is_demo FROM grows ORDER BY id");
    expect(grows.map((g) => [g.name, g.is_demo])).toEqual([["Mein Zelt", false], ["Demo-Zelt", true]]);
    expect(await q("SELECT count(*)::int AS n FROM grow_plants WHERE grow_id = $1", [grows[1]!.id])).toEqual([{ n: 2 }]);

    await api("DELETE", "/demo");
    expect(await q("SELECT name FROM grows")).toEqual([{ name: "Mein Zelt" }]);
    expect(await q("SELECT name FROM farms")).toEqual([{ name: "Echter Hof" }]);
  });

  it("does not count the Demo-Hof against the farm limit", async () => {
    const { MAX_ADMIN_FARMS, createFarm } = await import("./farmMembers");
    await api("POST", "/demo");
    for (let i = 0; i < MAX_ADMIN_FARMS; i++) await createFarm("anna", `Hof ${i + 1}`);
    await expect(createFarm("anna", "Einer zu viel")).rejects.toThrow(/höchstens/);
  });

  it("keeps each account's demo to itself", async () => {
    const anna = (await api("POST", "/demo")).data.farmId;
    as = "bert";
    expect((await api("GET", "/demo")).data).toEqual({ active: false, farmId: null });
    await api("DELETE", "/demo");
    expect(await q("SELECT id FROM farms")).toEqual([{ id: anna }]);
    // Bert as a caretaker of Anna's Demo-Hof cannot delete it either.
    await q("INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'bert', 'caretaker')", [anna]);
    await api("DELETE", "/demo");
    expect(await q("SELECT id FROM farms")).toEqual([{ id: anna }]);
  });
});
