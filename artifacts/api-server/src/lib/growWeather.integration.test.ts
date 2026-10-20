/**
 * Grow push and weather against a REAL Postgres, through the HTTP routes: the
 * push setting, where an outdoor grow is, the forecast with its warnings, and
 * the morning push with the day's plan steps – discreet or full, once a day,
 * a warning not again the next morning.
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

import type { DayForecast } from "./farmWeather";

const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-04-01";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));
let weather: Partial<DayForecast> = {};
const forecast = vi.fn(async (_lat: number, _lon: number, today: string): Promise<DayForecast[]> =>
  [0, 1, 2].map((k) => ({
    date: new Date(Date.parse(`${today}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10),
    minTemp: 8,
    maxTemp: 20,
    precipitationMm: 0,
    maxGustKmh: 20,
    icon: "sun" as const,
    ...(k === 0 ? weather : {}),
  })),
);
vi.mock("./farmWeather", async (orig) => ({ ...(await orig<object>()), forecast }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Grow push and weather (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "owner" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/grow")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE users, grow_access, grows, grow_push_log RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('owner', 'o@x.de', true, true), ('anna', 'anna@x.de', true, false), ('bert', 'bert@x.de', true, false)`);
    as = "anna";
    fixedDay = "2026-04-01";
    weather = {};
    sendPushToUser.mockClear();
    forecast.mockClear();
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
  const open = async (who: string) => {
    as = "owner";
    await api("PUT", "/admin/grow-access", { email: `${who}@x.de`, unlocked: true });
    as = who;
    await api("POST", "/grow/access", { adults: 1 });
  };
  const garden = { name: "Balkon", environment: "outdoor", medium: "soil", latitude: 52.5234, longitude: 13.4114 };
  const plant = { name: "Lemon 1", strainType: "hybrid", flowering: "photo", seedSex: "feminized", startedOn: "2026-03-01" };
  const run = async (day: string, hhmm = "07:30") => {
    const { sendGrowDigests } = await import("./growWeather");
    return sendGrowDigests(hhmm, day);
  };

  it("keeps the push setting with the adults", async () => {
    await open("anna");
    expect((await api("PUT", "/grow/access", { push: "full" })).data).toEqual({ unlocked: true, ageConfirmed: true, adults: 1, push: "full", kwhPrice: null });
    expect((await api("PUT", "/grow/access", { adults: 2 })).data).toMatchObject({ adults: 2, push: "full" });
    expect((await api("PUT", "/grow/access", { push: "loud" })).status).toBe(400);
  });

  it("knows where an outdoor grow is and forecasts with warnings for its plants", async () => {
    await open("anna");
    let r = await api("POST", "/grow/grows", { ...garden, postalCode: "10178" });
    const grow = r.data.grows[0];
    expect(grow).toMatchObject({ postalCode: "10178", hasLocation: true });
    expect(await q("SELECT latitude, longitude FROM grows")).toEqual([{ latitude: 52.5, longitude: 13.4 }]);
    // Same postal code: the place stays, no new lookup.
    r = await api("PUT", `/grow/grows/${grow.id}`, { ...garden, latitude: null, longitude: null, postalCode: "10178", name: "Garten" });
    expect(r.data.grows[0]).toMatchObject({ name: "Garten", hasLocation: true });
    expect((await api("PUT", `/grow/grows/${grow.id}`, { ...garden, latitude: null, longitude: null, postalCode: "1017" })).status).toBe(400);
    // Archiving without the place keeps it.
    const { latitude: _lat, longitude: _lon, ...plain } = garden;
    r = await api("PUT", `/grow/grows/${grow.id}`, { ...plain, archived: true });
    expect(r.data.grows[0]).toMatchObject({ archived: true, postalCode: "10178", hasLocation: true });
    await api("PUT", `/grow/grows/${grow.id}`, { ...plain, archived: false });
    // No plants yet: forecast, no warnings.
    weather = { minTemp: -1 };
    r = await api("GET", `/grow/grows/${grow.id}/weather`);
    expect(r.data).toMatchObject({ location: { postalCode: "10178", latitude: 52.5, longitude: 13.4 }, warnings: [] });
    expect(r.data.days).toHaveLength(3);
    expect(forecast).toHaveBeenLastCalledWith(52.5, 13.4, "2026-04-01");
    // A plant in the veg phase: frost warning.
    await api("POST", `/grow/grows/${grow.id}/plants`, plant);
    r = await api("GET", `/grow/grows/${grow.id}/weather`);
    expect(r.data.warnings).toEqual([{ kind: "frost", date: "2026-04-01", text: expect.stringMatching(/^Frostgefahr heute nacht/) }]);
    // Moved inside: no location, no weather.
    r = await api("PUT", `/grow/grows/${grow.id}`, { ...garden, environment: "indoor" });
    expect(r.data.grows[0]).toMatchObject({ postalCode: null, hasLocation: false });
    expect((await api("GET", `/grow/grows/${grow.id}/weather`)).data).toEqual({ location: null, days: [], warnings: [] });
    // Someone else's grow.
    await open("bert");
    expect((await api("GET", `/grow/grows/${grow.id}/weather`)).status).toBe(404);
  });

  it("pushes the day's steps and fresh warnings once a day, discreet unless asked", async () => {
    await open("anna");
    const growId = (await api("POST", "/grow/grows", garden)).data.grows[0].id;
    const p = (await api("POST", `/grow/grows/${growId}/plants`, plant)).data;
    const veg = p.plan.phases.find((ph: any) => ph.key === "veg");
    const step = p.plan.steps.find((s: any) => s.on >= veg.from && s.on <= veg.to);
    const day = step.on as string;
    // Not before 07:30; on a day without steps or warnings nothing goes out.
    expect(await run(day, "07:00")).toBe(0);
    expect(await run(veg.from === day ? veg.to : veg.from)).toBe(0);
    weather = { maxGustKmh: 75 };
    expect(await run(day)).toBe(1);
    expect(sendPushToUser).toHaveBeenCalledWith("anna", {
      title: "Little Farming",
      body: expect.stringMatching(/^Heute: \d+ Pflegeschritte? für deine Pflanzen und ein Wetterhinweis\.$/),
      tag: `grow-${day}`,
      url: "/grow",
    });
    // Once a day.
    expect(await run(day)).toBe(0);
    // The storm again tomorrow: not pushed twice (no step tomorrow → nothing).
    const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const stepsTomorrow = p.plan.steps.filter((s: any) => s.on === next).length;
    sendPushToUser.mockClear();
    await run(next);
    if (stepsTomorrow === 0) expect(sendPushToUser).not.toHaveBeenCalled();
    else expect((sendPushToUser.mock.calls[0]![1] as any).body).not.toMatch(/Wetterhinweis/);
    expect(await q("SELECT day, kinds FROM grow_push_log ORDER BY day")).toEqual(expect.arrayContaining([{ day, kinds: ["storm"] }, { day: next, kinds: ["storm"] }]));
    // Full text on request; off means off.
    await q("DELETE FROM grow_push_log");
    await api("PUT", "/grow/access", { push: "full" });
    sendPushToUser.mockClear();
    await run(day);
    const full = sendPushToUser.mock.calls[0]![1] as any;
    expect(full.title).toBe("Grow: Wetter und heute zu tun");
    expect(full.body).toContain(`Lemon 1: ${step.text}`);
    expect(full.body).toMatch(/^Sturmböen heute/);
    await q("DELETE FROM grow_push_log");
    await api("PUT", "/grow/access", { push: "off" });
    expect(await run(day)).toBe(0);
    // Locked again: no push either.
    await api("PUT", "/grow/access", { push: "discreet" });
    as = "owner";
    await api("PUT", "/admin/grow-access", { email: "anna@x.de", unlocked: false });
    expect(await run(day)).toBe(0);
  });
});
