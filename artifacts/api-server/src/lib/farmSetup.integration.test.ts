/**
 * Hof einrichten against a REAL Postgres, through the HTTP routes: the
 * checklist read from the data, hiding it, and the quick start (group,
 * numbered animals, starting ration, reminders), with roles.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
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

describe.skipIf(!enabled)("Hof einrichten (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let farmId = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/farms")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('pia', 'p@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Meine Farm') RETURNING id");
    farmId = f!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin')`, [farmId]);
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
  const done = async () => Object.fromEntries((await api("GET", `/farms/${farmId}/setup`)).data.steps.map((s: any) => [s.key, s.done]));

  it("reads the checklist from the data", async () => {
    expect(await done()).toEqual({ name: false, location: false, animals: false, rations: false, tasks: false, beds: false, members: false });
    await q("UPDATE farms SET name = 'Hof Sonnenblick' WHERE id = $1", [farmId]);
    await q("INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm, latitude, longitude) VALUES ($1, 'Beet', 'bed', 200, 100, 52.5, 13.4)", [farmId]);
    await q("INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'pia', 'caretaker')", [farmId]);
    // A bed with a location also gives the farm its weather.
    expect(await done()).toMatchObject({ name: true, location: true, beds: true, members: true, animals: false });
  });

  it("sets up a group of hens in one go and continues the numbers", async () => {
    await q("INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Alte', 'poultry', 'H-2')", [farmId]);
    const res = await api("POST", `/farms/${farmId}/setup/quickstart`, { species: "poultry", count: 3, name: "Legehennen" });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ animals: 3, tasks: 4 });
    expect(await q("SELECT name, registration_number, herd_id IS NOT NULL AS in_herd FROM farm_animals ORDER BY id")).toEqual([
      { name: "Alte", registration_number: "H-2", in_herd: false },
      { name: "Huhn 1", registration_number: "H-1", in_herd: true },
      { name: "Huhn 3", registration_number: "H-3", in_herd: true },
      { name: "Huhn 4", registration_number: "H-4", in_herd: true },
    ]);
    expect(await q("SELECT stage, items, times FROM feed_rations")).toEqual([{ stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens", "abends"] }]);
    expect(await q("SELECT action_type, reminder_time, interval_value, interval_unit FROM farm_tasks ORDER BY reminder_time")).toEqual([
      { action_type: "Füttern", reminder_time: "07:00", interval_value: 1, interval_unit: "Tage" },
      { action_type: "Ausmisten", reminder_time: "10:00", interval_value: 1, interval_unit: "Wochen" },
      { action_type: "Eier sammeln", reminder_time: "17:00", interval_value: 1, interval_unit: "Tage" },
      { action_type: "Füttern", reminder_time: "18:00", interval_value: 1, interval_unit: "Tage" },
    ]);
    expect(await done()).toMatchObject({ animals: true, rations: true, tasks: true });
    // Cats get no ration, only the weekly cleaning.
    expect((await api("POST", `/farms/${farmId}/setup/quickstart`, { species: "cat", count: 1 })).data).toMatchObject({ rationId: null, tasks: 1 });
    expect((await api("POST", `/farms/${farmId}/setup/quickstart`, { species: "goat", count: 51 })).status).toBe(400);
  });

  it("lets the admin hide the checklist; others may only read it", async () => {
    expect((await api("PUT", `/farms/${farmId}/setup`, { dismissed: true })).data.dismissed).toBe(true);
    await q("INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'pia', 'caretaker')", [farmId]);
    as = "pia";
    expect((await api("GET", `/farms/${farmId}/setup`)).data.dismissed).toBe(true);
    expect((await api("PUT", `/farms/${farmId}/setup`, { dismissed: false })).status).toBe(403);
    expect((await api("POST", `/farms/${farmId}/setup/quickstart`, { species: "rabbit", count: 2 })).status).toBe(403);
  });
});
