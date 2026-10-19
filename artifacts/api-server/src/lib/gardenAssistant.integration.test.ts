/**
 * Beet-Architekt step 6 against a REAL Postgres, through the HTTP routes:
 * the goals of the Garten-Assistent, the plan from animals and beds, the
 * raised bed's year, roles and isolation.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Beet-Architekt – Garten-Assistent & Hochbeet (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/garden");
    const app = express();
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use(router);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
    );
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
  const animal = (farmId: number, species: string, n: number, archived = false) =>
    q(
      `INSERT INTO farm_animals (farm_id, name, species, registration_number, archived_at)
       SELECT $1, 'Tier ' || g, $2::farm_species, $2::text || '-' || g || '-' || $4::text, CASE WHEN $3::boolean THEN now() END FROM generate_series(1, $5::int) g`,
      [farmId, species, archived, archived ? "a" : "x", n],
    );

  it("keeps the goals per farm, with defaults until saved", async () => {
    expect((await api("GET", `/farms/${farm.anna}/garden/goals`)).data).toEqual({ people: 2, animalShare: 0, directions: ["vegetables", "herbs"], hoursPerWeek: null });
    const saved = await api("PUT", `/farms/${farm.anna}/garden/goals`, { people: 3, animalShare: 40, directions: ["storage", "vegetables", "storage"], hoursPerWeek: 4 });
    expect(saved.data).toEqual({ people: 3, animalShare: 40, directions: ["vegetables", "storage"], hoursPerWeek: 4 });
    expect((await api("GET", `/farms/${farm.anna}/garden/goals`)).data.people).toBe(3);
    expect((await api("PUT", `/farms/${farm.anna}/garden/goals`, { people: 3, animalShare: 140, directions: [], hoursPerWeek: null })).status).toBe(400);
    as = "bert";
    expect((await api("GET", `/farms/${farm.bert}/garden/goals`)).data.people).toBe(2);
  });

  it("plans from the farm's animals and beds", async () => {
    await animal(farm.anna, "rabbit", 4);
    await animal(farm.anna, "rabbit", 2, true); // archived: not fed anymore
    await animal(farm.anna, "poultry", 10);
    await animal(farm.bert, "goat", 5); // another farm
    await q(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Großes Beet', 'bed', 400, 200), ($1, 'Hochbeet', 'raised', 200, 100), ($2, 'Bert', 'bed', 1000, 1000)`,
      [farm.anna, farm.bert],
    );
    await api("PUT", `/farms/${farm.anna}/garden/goals`, { people: 2, animalShare: 20, directions: ["vegetables"], hoursPerWeek: null });
    const plan = (await api("GET", `/farms/${farm.anna}/garden/plan`)).data;
    expect(plan.fodder.animals.map((a: any) => [a.species, a.count]).sort()).toEqual([["poultry", 10], ["rabbit", 4]]);
    expect(plan.availableM2).toBe(10);
    expect(plan.kitchenNeedM2).toBe(80);
    expect(plan.beds.map((b: any) => [b.name, b.role])).toEqual([["Großes Beet", "kitchen"], ["Hochbeet", "fodder"]]);
  });

  it("stores the year a raised bed was filled, and only for raised beds", async () => {
    const raised = await api("POST", `/farms/${farm.anna}/beds`, { name: "Hochbeet", type: "raised", lengthCm: 200, widthCm: 100, heightCm: 80, builtYear: 2024 });
    expect(raised.data.builtYear).toBe(2024);
    const flat = await api("POST", `/farms/${farm.anna}/beds`, { name: "Beet", type: "bed", lengthCm: 200, widthCm: 100, builtYear: 2024 });
    expect(flat.data.builtYear).toBeNull();
    expect((await api("POST", `/farms/${farm.anna}/beds`, { name: "Alt", type: "raised", lengthCm: 200, widthCm: 100, builtYear: 1890 })).status).toBe(400);
  });

  it("lets guests read and keeps farms apart", async () => {
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/garden/plan`)).status).toBe(200);
    expect((await api("PUT", `/farms/${farm.anna}/garden/goals`, { people: 1, animalShare: 0, directions: [], hoursPerWeek: null })).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/garden/plan`)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.anna}/garden/goals`)).status).toBe(404);
  });
});
