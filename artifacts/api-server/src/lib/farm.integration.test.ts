/**
 * "Meine Farm" against a REAL Postgres with the real schema: farms are
 * isolated from each other, foreign keys cascade as intended, and deleting an
 * account hands a farm over or removes it.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (a throwaway database
 * with the schema pushed). Truncates tables – never point it at real data. Run
 * the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The farm routes reach the Futterplaner (Hof einrichten), which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Meine Farm (real database)", () => {
  let server: Server;
  let base = "";
  let signedIn: { id: string; approved: boolean; isOwner?: boolean } | null = null;
  const ids = { farm1: 0, farm2: 0, farm3: 0 };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: farmsRouter } = await import("../routes/farms");
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user?: unknown }).user = signedIn ?? undefined;
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => !!signedIn;
      next();
    });
    app.use(farmsRouter);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES
      ('chef', 'chef@example.org', true, true),
      ('anna', 'anna@example.org', true, false),
      ('bert', 'bert@example.org', true, false)`);
    const farms = await q<{ id: number }>(
      "INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert'), ('Annas Garten') RETURNING id",
    );
    [ids.farm1, ids.farm2, ids.farm3] = farms.map((f) => f.id) as [number, number, number];
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role, created_at) VALUES
        ($1, 'anna', 'admin', now() - interval '2 days'),
        ($1, 'bert', 'caretaker', now() - interval '1 day'),
        ($2, 'bert', 'admin', now()),
        ($3, 'anna', 'admin', now())`,
      [ids.farm1, ids.farm2, ids.farm3],
    );
    for (const [farmId, name] of [[ids.farm1, "Henne Berta"], [ids.farm2, "Ziege Lotte"], [ids.farm3, "Kater Max"]] as const) {
      const [animal] = await q<{ id: number }>(
        `INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, $2, 'poultry', 'DE-1') RETURNING id`,
        [farmId, name],
      );
      await q(
        `INSERT INTO medical_records (farm_id, animal_id, date, diagnosis) VALUES ($1, $2, '2026-10-01', 'Milben')`,
        [farmId, animal!.id],
      );
    }
    signedIn = { id: "anna", approved: true };
  });

  const get = (path: string) => fetch(`${base}${path}`);

  it("lists only the account's own farms, with its role", async () => {
    const res = await get("/farms");
    expect(await res.json()).toEqual([
      { id: ids.farm1, name: "Hof Anna", role: "admin", accessUntil: null, modules: null, ownerName: null },
      { id: ids.farm3, name: "Annas Garten", role: "admin", accessUntil: null, modules: null, ownerName: null },
    ]);
  });

  it("isolates farms: another member's farm is 'not found'", async () => {
    expect((await get(`/farms/${ids.farm1}`)).status).toBe(200);
    expect((await get(`/farms/${ids.farm2}`)).status).toBe(404);
    signedIn = { id: "bert", approved: true };
    expect((await get(`/farms/${ids.farm3}`)).status).toBe(404);
    expect(await (await get(`/farms/${ids.farm1}`)).json()).toMatchObject({ role: "caretaker" });
  });

  it("gives the app owner no access to members' farms", async () => {
    signedIn = { id: "chef", approved: true, isOwner: true };
    expect(await (await get("/farms")).json()).toEqual([]);
    expect((await get(`/farms/${ids.farm1}`)).status).toBe(404);
  });

  it("keeps registration numbers unique per farm, not across farms", async () => {
    await expect(
      q(`INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Zweite', 'poultry', 'DE-1')`, [ids.farm1]),
    ).rejects.toThrow(/farm_animals_farm_registration_unique/);
    // DE-1 already exists on farm2 and farm3 too – that is fine.
    expect(await q("SELECT 1 FROM farm_animals WHERE registration_number = 'DE-1'")).toHaveLength(3);
  });

  it("deleting a farm removes its animals and records, and nothing of other farms", async () => {
    await q("DELETE FROM farms WHERE id = $1", [ids.farm3]);
    expect(await q("SELECT 1 FROM farm_animals WHERE farm_id = $1", [ids.farm3])).toHaveLength(0);
    expect(await q("SELECT 1 FROM medical_records WHERE farm_id = $1", [ids.farm3])).toHaveLength(0);
    expect(await q("SELECT 1 FROM farm_animals")).toHaveLength(2);
  });

  it("deleting an account hands shared farms over and removes farms it ran alone", async () => {
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");

    // Annas Garten had only Anna: gone, with its animals.
    expect(await q("SELECT 1 FROM farms WHERE id = $1", [ids.farm3])).toHaveLength(0);
    expect(await q("SELECT 1 FROM farm_animals WHERE farm_id = $1", [ids.farm3])).toHaveLength(0);
    // Hof Anna is kept; Bert, the longest-standing remaining member, is admin now.
    expect(await q("SELECT user_id, role FROM farm_memberships WHERE farm_id = $1", [ids.farm1])).toEqual([
      { user_id: "bert", role: "admin" },
    ]);
    expect(await q("SELECT 1 FROM farm_animals WHERE farm_id = $1", [ids.farm1])).toHaveLength(1);
    // Bert's own farm is untouched.
    expect(await q("SELECT role FROM farm_memberships WHERE farm_id = $1", [ids.farm2])).toEqual([
      { role: "admin" },
    ]);
  });
});
