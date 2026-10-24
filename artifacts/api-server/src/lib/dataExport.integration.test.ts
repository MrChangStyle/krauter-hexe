/**
 * Meine Daten herunterladen against a REAL Postgres, through the HTTP route:
 * the file holds the account's own data and the farms it runs, never
 * secrets and never anyone else's data.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Datenexport (real database)", () => {
  let server: Server;
  let base = "";
  let as: string | null = "anna";
  let annaFarm = 0;
  let carlFarm = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = as ? { id: as } : undefined;
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => as !== null;
      next();
    });
    app.use((await import("../routes/data-export")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    (await import("../routes/data-export")).resetDataExportLimit();
    await q("TRUNCATE farms, farm_memberships, users, user_settings, feedback, grows, cameras RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, password_hash, approved) VALUES ('anna', 'a@x.de', 'HASH-ANNA', true), ('carl', 'c@x.de', 'HASH-CARL', true)`);
    await q(`INSERT INTO user_settings (user_id, push_off) VALUES ('anna', '["feed"]'), ('carl', '[]')`);
    await q(`INSERT INTO feedback (user_id, text) VALUES ('anna', 'Annas Idee'), ('carl', 'Carls Idee')`);
    const [g] = await q<{ id: number }>(`INSERT INTO grows (user_id, name, environment, medium) VALUES ('anna', 'Zelt', 'indoor', 'soil') RETURNING id`);
    await q(`INSERT INTO grow_plants (grow_id, name, strain_type, flowering, flower_weeks, started_on) VALUES ($1, 'Pflanze A', 'hybrid', 'auto', 9, '2026-05-01')`, [g!.id]);
    const [a] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Annas Hof') RETURNING id");
    const [c] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Carls Hof') RETURNING id");
    annaFarm = a!.id;
    carlFarm = c!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'carl', 'admin'), ($2, 'anna', 'caretaker')`, [annaFarm, carlFarm]);
    await q(`INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Lotte', 'goat', 'DE-1'), ($2, 'Bruno', 'goat', 'DE-2')`, [annaFarm, carlFarm]);
    await q(`INSERT INTO cameras (farm_id, name, secret_hash) VALUES ($1, 'Stall', 'CAM-SECRET')`, [annaFarm]);
    as = "anna";
  });

  const download = async () => {
    const res = await fetch(`${base}/auth/user/export`);
    return { res, text: await res.text() };
  };

  it("holds the account's own data and the farms it runs", async () => {
    const { res, text } = await download();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="little-farming-daten-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = JSON.parse(text);
    expect(data.account.email).toBe("a@x.de");
    expect(data.personal.feedback.map((f: { text: string }) => f.text)).toEqual(["Annas Idee"]);
    expect(data.personal.user_settings[0].pushOff).toEqual(["feed"]);
    expect(data.personal.grow_plants.map((p: { name: string }) => p.name)).toEqual(["Pflanze A"]);
    expect(data.memberships.map((m: { farm: string; role: string }) => `${m.farm}:${m.role}`).sort()).toEqual(["Annas Hof:admin", "Carls Hof:caretaker"]);
    expect(data.farmsYouRun).toHaveLength(1);
    expect(data.farmsYouRun[0].farm.name).toBe("Annas Hof");
    expect(data.farmsYouRun[0].data.farm_animals.map((x: { name: string }) => x.name)).toEqual(["Lotte"]);
    expect(data.farmsYouRun[0].data.cameras[0].name).toBe("Stall");
  });

  it("never contains secrets or other people's data", async () => {
    const { text } = await download();
    for (const secret of ["HASH-ANNA", "HASH-CARL", "CAM-SECRET", "password_hash", "passwordHash", "secret_hash", "c@x.de", "Carls Idee", "Bruno"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("needs a sign-in and is limited per hour", async () => {
    as = null;
    expect((await download()).res.status).toBe(401);
    as = "anna";
    for (let i = 0; i < 5; i++) expect((await download()).res.status).toBe(200);
    expect((await download()).res.status).toBe(429);
  });
});
