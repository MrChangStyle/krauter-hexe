/**
 * Beet-Architekt step 1 against a REAL Postgres, through the HTTP routes,
 * with OpenStreetMap (postal code) and Bright Sky (DWD weather history)
 * replaced: beds, location, frost dates, roles and isolation.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The garden routes reach the Futterplaner (winter need), which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Beet-Architekt – beds (real database, weather replaced)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  const calls: string[] = [];
  const realFetch = globalThis.fetch;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  /** Hourly DWD-like records: frost until 21.04. and again from 18.10. */
  function brightSky(url: URL): Response {
    const from = new Date(`${url.searchParams.get("date")}T00:00:00Z`);
    const to = new Date(`${url.searchParams.get("last_date")}T00:00:00Z`);
    const weather = [];
    for (let t = from.getTime(); t <= to.getTime(); t += 3 * 3600_000) {
      const iso = new Date(t).toISOString();
      const mmdd = iso.slice(5, 10);
      const night = iso.slice(11, 13) === "03";
      const frost = mmdd <= "04-21" || mmdd >= "10-18";
      weather.push({ timestamp: `${iso.slice(0, 19)}+02:00`, temperature: night && frost ? -1.5 : 8 });
    }
    return Response.json({ weather });
  }

  beforeAll(async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.hostname === "127.0.0.1") return realFetch(input, init);
      calls.push(url.hostname);
      if (url.hostname === "nominatim.openstreetmap.org") {
        return Response.json(url.searchParams.get("postalcode") === "99999" ? [] : [{ lat: "48.1372", lon: "11.5755" }]);
      }
      if (url.hostname === "api.brightsky.dev") return brightSky(url);
      throw new Error(`unexpected ${url}`);
    });
    const { default: router } = await import("../routes/garden");
    const app = express();
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: as !== "neu" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use(router);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    vi.restoreAllMocks();
    server?.close();
  });

  beforeEach(async () => {
    calls.length = 0;
    await q("TRUNCATE farms, farm_memberships, users, frost_climate RESTART IDENTITY CASCADE");
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

  const bed = (over: Record<string, unknown> = {}) => ({
    name: "Hochbeet am Haus",
    type: "raised",
    lengthCm: 200,
    widthCm: 120,
    heightCm: 80,
    sunHours: 6,
    orientation: "S",
    windProtection: "partial",
    soilTexture: "loamy",
    soilPh: 6.54,
    ...over,
  });

  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i += 1) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("timed out");
  };

  it("serves the crop catalog to approved accounts only", async () => {
    const catalog = await api("GET", "/garden/catalog");
    expect(catalog.data.find((c: { key: string }) => c.key === "tomate")).toMatchObject({ name: "Tomate", family: "Nachtschattengewächse" });
    as = "neu";
    expect((await api("GET", "/garden/catalog")).status).toBe(403);
  });

  it("creates a bed at the phone's position and fills in the frost dates from the weather history", async () => {
    const created = await api("POST", `/farms/${farm.anna}/beds`, bed({ latitude: 52.5183, longitude: 13.4467 }));
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ latitude: 52.5, longitude: 13.4, soilPh: 6.5, frostSource: "default", lastFrost: "05-15" });
    await waitFor(async () => (await api("GET", `/farms/${farm.anna}/beds/${created.data.id}`)).data.frostSource === "climate");
    expect((await api("GET", `/farms/${farm.anna}/beds/${created.data.id}`)).data).toMatchObject({ lastFrost: "04-21", firstFrost: "10-18" });

    // A second bed in the same 10-km cell uses the cached result.
    const brightSkyCalls = calls.filter((h) => h === "api.brightsky.dev").length;
    expect(brightSkyCalls).toBe(20);
    const second = await api("POST", `/farms/${farm.anna}/beds`, bed({ name: "Kräuterspirale", latitude: 52.49, longitude: 13.41 }));
    await waitFor(async () => (await api("GET", `/farms/${farm.anna}/beds/${second.data.id}`)).data.frostSource === "climate");
    expect(calls.filter((h) => h === "api.brightsky.dev").length).toBe(brightSkyCalls);
  });

  it("finds the place from the postal code, once, and keeps own frost dates", async () => {
    const created = await api("POST", `/farms/${farm.anna}/beds`, bed({ postalCode: "80331", frostDates: { lastFrost: "05-20", firstFrost: "10-01" } }));
    expect(created.data).toMatchObject({ postalCode: "80331", latitude: 48.1, longitude: 11.6, frostSource: "manual", lastFrost: "05-20" });
    expect(calls).toEqual(["nominatim.openstreetmap.org"]);

    // Same postal code again: no new lookup; own dates stay.
    const same = await api("PATCH", `/farms/${farm.anna}/beds/${created.data.id}`, bed({ postalCode: "80331", name: "Umbenannt" }));
    expect(same.data).toMatchObject({ name: "Umbenannt", frostSource: "manual", lastFrost: "05-20" });
    expect(calls).toEqual(["nominatim.openstreetmap.org"]);

    // Handing the dates back to the weather history.
    const reset = await api("PATCH", `/farms/${farm.anna}/beds/${created.data.id}`, bed({ postalCode: "80331", frostDates: null }));
    expect(reset.data).toMatchObject({ frostSource: "default", lastFrost: "05-15" });
    await waitFor(async () => (await api("GET", `/farms/${farm.anna}/beds/${created.data.id}`)).data.frostSource === "climate");

    // An unknown postal code: no place, default dates.
    const unknown = await api("POST", `/farms/${farm.anna}/beds`, bed({ postalCode: "99999" }));
    expect(unknown.data).toMatchObject({ latitude: null, longitude: null, frostSource: "default" });
  });

  it("checks the input", async () => {
    const path = `/farms/${farm.anna}/beds`;
    expect((await api("POST", path, bed({ postalCode: "8033" }))).data.error).toMatch(/fünf Ziffern/);
    expect((await api("POST", path, bed({ soilPh: 12 }))).data.error).toMatch(/pH/);
    expect((await api("POST", path, bed({ lengthCm: 10 }))).status).toBe(400);
    expect((await api("POST", path, bed({ type: "garage" }))).status).toBe(400);
    expect((await api("POST", path, bed({ frostDates: { lastFrost: "10-01", firstFrost: "05-01" } }))).data.error).toMatch(/vor dem ersten/);
    expect((await api("POST", path, bed({ frostDates: { lastFrost: "02-30", firstFrost: "10-01" } }))).status).toBe(400);
  });

  it("keeps farms apart and lets guests only look", async () => {
    const created = await api("POST", `/farms/${farm.anna}/beds`, bed());
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/beds`)).data).toHaveLength(1);
    expect((await api("POST", `/farms/${farm.anna}/beds`, bed())).status).toBe(403);
    expect((await api("DELETE", `/farms/${farm.anna}/beds/${created.data.id}`)).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/beds`)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.bert}/beds/${created.data.id}`)).status).toBe(404);
    expect((await api("PATCH", `/farms/${farm.bert}/beds/${created.data.id}`, bed({ name: "Meins" }))).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/beds/${created.data.id}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `/farms/${farm.anna}/beds/${created.data.id}`)).status).toBe(204);
    expect((await api("GET", `/farms/${farm.anna}/beds`)).data).toEqual([]);
  });
});
