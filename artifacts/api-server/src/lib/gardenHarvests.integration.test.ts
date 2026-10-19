/**
 * Ernten against a REAL Postgres, through the HTTP routes: logging and
 * deleting harvests, roles, isolation, the record outliving its planting,
 * and the Garten-Assistent learning from them.
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

describe.skipIf(!enabled)("Beet-Architekt – Ernten (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let bed = 0;
  const season = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

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
    const [g] = await q<{ id: number }>(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 300, 120) RETURNING id`,
      [farm.anna],
    );
    bed = g!.id;
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
  const plant = async (cropKey: string, x: number) =>
    (await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/${season}/plantings`, { cropKey, x, y: 0 })).data.id as number;
  const harvest = (plantingId: number, body: object, farmId = farm.anna) => api("POST", `/farms/${farmId}/plantings/${plantingId}/harvests`, body);

  it("logs harvests with a copy of the planting and keeps them when it goes", async () => {
    const tomate = await plant("tomate", 0);
    const first = await harvest(tomate, { harvestedOn: today, amountKg: 1.2345, use: "kitchen", note: "erste Rispe" });
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ plantingId: tomate, bedId: bed, season, cropKey: "tomate", label: "Tomate", cells: 4, amountKg: 1.235, use: "kitchen", note: "erste Rispe" });
    await harvest(tomate, { harvestedOn: today, amountKg: 0.8, use: "fodder" });
    expect((await api("GET", `/farms/${farm.anna}/garden/seasons/${season}/harvests`)).data).toHaveLength(2);

    expect((await harvest(tomate, { harvestedOn: "2099-07-01", amountKg: 1, use: "kitchen" })).status).toBe(400);
    expect((await harvest(tomate, { harvestedOn: `${season}-02-30`, amountKg: 1, use: "kitchen" })).status).toBe(400);
    expect((await harvest(tomate, { harvestedOn: today, amountKg: 0, use: "kitchen" })).status).toBe(400);
    expect((await harvest(tomate, { harvestedOn: today, amountKg: 1, use: "compost" })).status).toBe(400);

    await api("DELETE", `/farms/${farm.anna}/plantings/${tomate}`);
    const kept = (await api("GET", `/farms/${farm.anna}/garden/seasons/${season}/harvests`)).data;
    expect(kept.map((h: any) => [h.plantingId, h.label])).toEqual([[null, "Tomate"], [null, "Tomate"]]);
    expect((await api("DELETE", `/farms/${farm.anna}/harvests/${kept[0].id}`)).status).toBe(204);
    expect((await api("DELETE", `/farms/${farm.anna}/harvests/${kept[0].id}`)).status).toBe(404);
  });

  it("teaches the Garten-Assistent the farm's own yields", async () => {
    const salat = await plant("salat", 0); // 1 cell = 0.09 m²
    await harvest(salat, { harvestedOn: today, amountKg: 0.9, use: "kitchen" });
    const plan = (await api("GET", `/farms/${farm.anna}/garden/plan`)).data;
    expect(plan.learned).toEqual({ season, kitchenKgPerM2: 10, fodderKgPerM2: null });
    expect(plan.kitchenNeedM2).toBe(42); // 2 × 42 m² × 0.5 (bounded)
    expect(plan.tips[0]).toMatch(/^Gerechnet mit euren Ernten/);
  });

  it("keeps harvests to caretakers of the farm", async () => {
    const tomate = await plant("tomate", 0);
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/garden/seasons/${season}/harvests`)).status).toBe(200);
    expect((await harvest(tomate, { harvestedOn: today, amountKg: 1, use: "kitchen" })).status).toBe(403);
    as = "bert";
    expect((await harvest(tomate, { harvestedOn: today, amountKg: 1, use: "kitchen" }, farm.bert)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.anna}/garden/seasons/${season}/harvests`)).status).toBe(404);
    as = "anna";
    const id = (await harvest(tomate, { harvestedOn: today, amountKg: 1, use: "kitchen" })).data.id;
    as = "bert";
    expect((await api("DELETE", `/farms/${farm.bert}/harvests/${id}`)).status).toBe(404);
  });
});
