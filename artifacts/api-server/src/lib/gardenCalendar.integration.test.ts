/**
 * Beet-Architekt step 4 against a REAL Postgres, through the HTTP routes:
 * calendar, ticking dates off, bed history, roles, isolation – and the daily
 * garden push with a mocked DWD forecast and push service.
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
const sendPushToUser = vi.fn(async (_u: string, _p: { title: string; body: string }) => 1);
vi.mock("./webPush", async (orig) => ({ ...(await orig<object>()), sendPushToUser }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Beet-Architekt – Kalender & Fruchtfolge (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let bed = 0;
  const realFetch = globalThis.fetch;
  let forecast: number[] = [];
  const forecastCalls: string[] = [];

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith("https://api.brightsky.dev/")) return realFetch(input, init);
      forecastCalls.push(url);
      return new Response(JSON.stringify({ weather: forecast.map((temperature) => ({ temperature })) }), { status: 200 });
    });
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

  afterAll(() => {
    vi.unstubAllGlobals();
    server?.close();
  });

  beforeEach(async () => {
    sendPushToUser.mockClear();
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true), ('carl', 'c@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest'), ($1, 'carl', 'caretaker')`,
      [farm.anna, farm.bert],
    );
    const [g] = await q<{ id: number }>(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm, latitude, longitude) VALUES ($1, 'Hochbeet', 'raised', 300, 120, 52.5, 13.4) RETURNING id`,
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
  const plant = (season: number, cropKey: string, x: number, y = 0) =>
    api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/${season}/plantings`, { cropKey, x, y });
  const calendar = (season: number) => api("GET", `/farms/${farm.anna}/garden/seasons/${season}/calendar`);

  it("computes the dates of a season and keeps what was ticked off", async () => {
    const tomate = (await plant(2026, "tomate", 0)).data.id as number;
    const gurke = (await plant(2026, "gurke", 4)).data.id as number;
    const cal = await calendar(2026);
    expect(cal.status).toBe(200);
    expect(cal.data.filter((e: any) => e.plantingId === tomate).map((e: any) => [e.kind, e.start])).toEqual([
      ["sow_indoor", "2026-03-06"],
      ["plant_out", "2026-05-15"],
      ["harvest", "2026-07-01"],
    ]);
    expect(cal.data[0]).toMatchObject({ bedId: bed, bedName: "Hochbeet", label: expect.any(String), done: false, open: true });

    // Sown indoors → sowing directly is no longer needed.
    // No seed in stock: nothing is taken.
    expect(await api("PUT", `/farms/${farm.anna}/plantings/${gurke}/checks/sow_indoor`)).toEqual({ status: 200, data: { seedUse: null } });
    expect((await api("PUT", `/farms/${farm.anna}/plantings/${gurke}/checks/sow_indoor`)).status).toBe(200);
    const after = (await calendar(2026)).data.filter((e: any) => e.plantingId === gurke);
    expect(after.find((e: any) => e.kind === "sow_indoor")).toMatchObject({ done: true, open: false });
    expect(after.find((e: any) => e.kind === "direct_sow")).toMatchObject({ done: false, open: false });
    expect(after.find((e: any) => e.kind === "plant_out")).toMatchObject({ done: false, open: true });
    expect((await api("DELETE", `/farms/${farm.anna}/plantings/${gurke}/checks/sow_indoor`)).status).toBe(204);
    expect((await calendar(2026)).data.find((e: any) => e.plantingId === gurke && e.kind === "direct_sow").open).toBe(true);

    // Tomatoes are never sown directly; unknown kinds are not found.
    expect((await api("PUT", `/farms/${farm.anna}/plantings/${tomate}/checks/direct_sow`)).status).toBe(400);
    expect((await api("PUT", `/farms/${farm.anna}/plantings/${tomate}/checks/giessen`)).status).toBe(404);
    // A planting that is removed takes its ticks with it.
    await api("PUT", `/farms/${farm.anna}/plantings/${tomate}/checks/plant_out`);
    await api("DELETE", `/farms/${farm.anna}/plantings/${tomate}`);
    expect(await q("SELECT * FROM planting_checks WHERE planting_id = $1", [tomate])).toEqual([]);
  });

  it("lists every season of a bed for crop rotation", async () => {
    await plant(2024, "kartoffel", 0);
    await plant(2025, "tomate", 0);
    await plant(2026, "buschbohne", 0);
    const history = await api("GET", `/farms/${farm.anna}/beds/${bed}/history`);
    expect(history.status).toBe(200);
    expect(history.data.map((p: any) => p.season)).toEqual([2026, 2025, 2024]);
    expect(history.data[2]).toMatchObject({ cropKey: "kartoffel", x: 0, y: 0 });
  });

  it("keeps farms apart and only lets caretakers tick off", async () => {
    const tomate = (await plant(2026, "tomate", 0)).data.id as number;
    as = "bert";
    expect((await calendar(2026)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.anna}/beds/${bed}/history`)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.anna}/garden/frost-warnings`)).status).toBe(404);
    // His own farm cannot reach Anna's planting either.
    expect((await api("PUT", `/farms/${farm.bert}/plantings/${tomate}/checks/plant_out`)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.bert}/beds/${bed}/history`)).status).toBe(404);
    as = "gast";
    expect((await calendar(2026)).status).toBe(200);
    expect((await api("PUT", `/farms/${farm.anna}/plantings/${tomate}/checks/plant_out`)).status).toBe(403);
    as = "carl";
    expect((await api("PUT", `/farms/${farm.anna}/plantings/${tomate}/checks/plant_out`)).status).toBe(200);
  });

  it("sends one garden push per farm and day: dates starting today and frost", async () => {
    const { sendGardenDigests } = await import("./gardenCalendar");
    await plant(2026, "tomate", 0); // outside since 15.05., frost-tender
    await plant(2026, "gurke", 4); // direct sowing starts 22.05.
    forecast = [6, 3.2, 0.4, 1.8];

    expect(await sendGardenDigests("07:29", "2026-05-22")).toBe(0);
    expect(await sendGardenDigests("07:30", "2026-05-22")).toBe(1);
    expect(forecastCalls.at(-1)).toContain("lat=52.5&lon=13.4&date=2026-05-22T18:00&last_date=2026-05-23T09:00");
    const recipients = sendPushToUser.mock.calls.map(([u]) => u).sort();
    expect(recipients).toEqual(["anna", "carl"]);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({
      title: "Frostwarnung für deinen Garten",
      body: "Bodenfrost möglich (0,4 °C) heute Nacht – Tomate, Gurke im Beet „Hochbeet“ schützen. Ab heute: Gurke säen, Gurke auspflanzen.",
      url: "/aufgaben",
    });
    // Same day again: nothing.
    expect(await sendGardenDigests("08:15", "2026-05-22")).toBe(0);
    expect(sendPushToUser).toHaveBeenCalledTimes(2);

    // Warm night, nothing starts → no push, but the day is done.
    forecast = [9, 7];
    expect(await sendGardenDigests("07:30", "2026-05-24")).toBe(0);
    expect(await q("SELECT day FROM garden_digest_log ORDER BY day")).toEqual([{ day: "2026-05-22" }, { day: "2026-05-24" }]);

    // The app shows the same warning.
    forecast = [-2.04];
    const { farmFrostWarnings } = await import("./gardenCalendar");
    expect(await farmFrostWarnings(farm.anna, "2026-05-26")).toEqual([
      { bedId: bed, bedName: "Hochbeet", night: "2026-05-26", minTemp: -2, plants: ["Tomate", "Gurke"] },
    ]);
    // Without a location there is no forecast.
    await q("UPDATE garden_beds SET latitude = NULL, longitude = NULL");
    expect(await farmFrostWarnings(farm.anna, "2026-05-27")).toEqual([]);
  });
});
