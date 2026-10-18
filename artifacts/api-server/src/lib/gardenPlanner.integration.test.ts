/**
 * Beet-Architekt step 2 against a REAL Postgres, through the HTTP routes:
 * plantings in the grid – size from the spacing, bounds, no overlap, archive
 * plants, seasons, roles and isolation.
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

describe.skipIf(!enabled)("Beet-Architekt – Raster-Planer (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let bed = 0;

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
    await q("TRUNCATE farms, farm_memberships, users, plants RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
    );
    const [g] = await q<{ id: number }>(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Hochbeet', 'raised', 200, 120) RETURNING id`,
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
  const path = (season = 2026) => `/farms/${farm.anna}/beds/${bed}/seasons/${season}/plantings`;

  it("places crops with the size their spacing needs, inside the bed and never on top of each other", async () => {
    const tomato = await api("POST", path(), { cropKey: "tomate", x: 0, y: 0 });
    expect(tomato.status).toBe(201);
    expect(tomato.data).toMatchObject({ label: "Tomate", cropKey: "tomate", x: 0, y: 0, w: 2, h: 2 });
    expect((await api("POST", path(), { cropKey: "basilikum", x: 2, y: 0 })).data).toMatchObject({ w: 1, h: 1 });

    const clash = await api("POST", path(), { cropKey: "salat", x: 1, y: 1 });
    expect(clash.status).toBe(409);
    expect(clash.data.error).toMatch(/Tomate/);
    expect((await api("POST", path(), { cropKey: "tomate", x: 5, y: 0 })).data.error).toMatch(/2 × 2 Felder/);
    expect((await api("POST", path(), { cropKey: "moehre", x: 6, y: 0 })).status).toBe(400);
    expect((await api("POST", path(), { cropKey: "drachenfrucht", x: 3, y: 3 })).status).toBe(400);
    expect((await api("GET", path())).data.map((p: { label: string }) => p.label)).toEqual(["Tomate", "Basilikum"]);
  });

  it("takes archive plants – with catalog rules when the species is known", async () => {
    const insert = (german: string, botanical: string) =>
      q<{ id: number }>(
        `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
         VALUES ($1, $2, 'edible', 'edible', 'safe', '', '', '', '', '') RETURNING id`,
        [german, botanical],
      );
    const [ochsenherz] = await insert("Ochsenherz-Tomate", "Solanum lycopersicum");
    const [bärlauch] = await insert("Bärlauch", "Allium ursinum");
    expect((await api("POST", path(), { plantId: ochsenherz!.id, x: 0, y: 2 })).data).toMatchObject({ label: "Ochsenherz-Tomate", cropKey: "tomate", w: 2 });
    expect((await api("POST", path(), { plantId: bärlauch!.id, x: 3, y: 3 })).data).toMatchObject({ label: "Bärlauch", cropKey: null, w: 1 });
    expect((await api("POST", path(), { plantId: 999, x: 4, y: 3 })).status).toBe(400);
  });

  it("keeps seasons apart", async () => {
    await api("POST", path(2026), { cropKey: "tomate", x: 0, y: 0 });
    expect((await api("POST", path(2027), { cropKey: "moehre", x: 0, y: 0 })).status).toBe(201);
    expect((await api("GET", path(2027))).data).toHaveLength(1);
  });

  it("lets guests look, strangers nothing, and removes plantings with the bed", async () => {
    const tomato = await api("POST", path(), { cropKey: "tomate", x: 0, y: 0 });
    as = "gast";
    expect((await api("GET", path())).data).toHaveLength(1);
    expect((await api("POST", path(), { cropKey: "salat", x: 4, y: 0 })).status).toBe(403);
    expect((await api("DELETE", `/farms/${farm.anna}/plantings/${tomato.data.id}`)).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farm.bert}/beds/${bed}/seasons/2026/plantings`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/beds/${bed}/seasons/2026/plantings`, { cropKey: "salat", x: 4, y: 0 })).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/plantings/${tomato.data.id}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `/farms/${farm.anna}/plantings/${tomato.data.id}`)).status).toBe(204);
    await api("POST", path(), { cropKey: "salat", x: 0, y: 0 });
    await api("DELETE", `/farms/${farm.anna}/beds/${bed}`);
    expect(await q("SELECT id FROM bed_plantings")).toEqual([]);
  });
});
