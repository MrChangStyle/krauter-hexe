/**
 * Wetterabhängige Pflege against a REAL Postgres, through the care plan routes
 * and the reminder run, with the weather service replaced: outdoor tasks, the
 * winter rules, rain that waters, frost in sight, and the account setting.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The reminder run reaches the Futterplaner, which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-12-01";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

/** Bright Sky: `minTemp` at 4 o'clock, 8 °C otherwise; `rainPerHour` for 8 hours of every day. */
let minTemp = 3;
let rainPerHour = 0;
const realFetch = globalThis.fetch;
function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  // No official warnings – the scheduler must not reach the real service.
  if (url.startsWith("https://api.brightsky.dev/alerts")) return Promise.resolve(new Response(JSON.stringify({ alerts: [], location: null })));
  if (url.startsWith("https://api.brightsky.dev/weather")) {
    const from = new URL(url).searchParams.get("date")!;
    const weather = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
      const d = new Date(`${from}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      return Array.from({ length: 24 }, (_, h) => ({
        timestamp: `${date}T${String(h).padStart(2, "0")}:00:00+01:00`,
        temperature: h === 4 ? minTemp : 8,
        precipitation: h >= 8 && h < 16 ? rainPerHour : 0,
        wind_gust_speed: 20,
        icon: "cloudy",
      }));
    });
    return Promise.resolve(new Response(JSON.stringify({ weather })));
  }
  return realFetch(input, init);
}

describe.skipIf(!enabled)("Wetterabhängige Pflege (real database, weather replaced)", () => {
  let server: Server;
  let base = "";
  let plantId = 0;
  // Every test its own place, so the forecast cache never answers for another.
  let latitude = 50;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    vi.stubGlobal("fetch", fakeFetch);
    const app = express();
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: "anna", approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/tasks")).default);
    app.use((await import("../routes/settings")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server?.close();
    vi.unstubAllGlobals();
  });

  afterEach(() => vi.useRealTimers());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users, tasks, user_settings, plants RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true)`);
    const [p] = await q<{ id: number }>(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
       VALUES ('Geranie', 'Pelargonium', 'edible', 'edible', 'safe', '', '', '', '', '') RETURNING id`,
    );
    plantId = p!.id;
    latitude += 0.5;
    const [f] = await q<{ id: number }>("INSERT INTO farms (name, latitude, longitude) VALUES ('Hof', $1, 13.4) RETURNING id", [latitude]);
    await q("INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin')", [f!.id]);
    minTemp = 3;
    rainPerHour = 0;
    sendPushToUser.mockClear();
  });

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await realFetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };
  const task = (overrides: Record<string, unknown> = {}) => ({ plantId, actionType: "Gießen", intervalValue: 2, intervalUnit: "Tage", reminderTime: "08:00", ...overrides });
  /** The reminder run on `day` at `time` UTC – 06:00 is 08:00 in Berlin in summer. */
  async function runAt(day: string, time = "06:00") {
    fixedDay = day;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T${time}:30Z`));
    const { triggerDueNotifications } = await import("./pushScheduler");
    const n = await triggerDueNotifications();
    vi.useRealTimers();
    return n;
  }

  it("keeps outdoor tasks and stretches watering, pauses fertilising in winter", async () => {
    fixedDay = "2026-12-01";
    const water = await api("POST", "/tasks", task({ outdoor: true }));
    expect(water.status).toBe(201);
    expect(water.data).toMatchObject({ outdoor: true, rainSkippedOn: null, careNote: "Winter: seltener gießen, alle 3 Tage." });
    const feed = await api("POST", "/tasks", task({ actionType: "Düngen", intervalValue: 2, intervalUnit: "Wochen" }));
    expect(feed.data).toMatchObject({ outdoor: false, nextDueDate: "2027-03-01", careNote: "Winterpause: im Winter wird nicht gedüngt, weiter ab März." });
    expect((await api("PATCH", `/tasks/${water.data.id}`, { outdoor: false })).data.outdoor).toBe(false);

    // Switched off: the plan as entered.
    await q("UPDATE tasks SET created_at = '2026-12-01T08:00:00Z'");
    expect((await api("PUT", "/settings", { seasonalCare: false })).data.seasonalCare).toBe(false);
    const list = (await api("GET", "/tasks")).data as any[];
    expect(list.map((t) => [t.actionType, t.nextDueDate, t.careNote])).toEqual([
      ["Düngen", "2026-12-15", null],
      ["Gießen", "2026-12-03", null],
    ]);
  });

  it("lets the rain water outdoor plants: done, no push – indoor plants still remind", async () => {
    const outside = (await api("POST", "/tasks", task({ outdoor: true }))).data;
    const inside = (await api("POST", "/tasks", task())).data;
    await q("UPDATE tasks SET created_at = '2026-05-01T08:00:00Z'");
    rainPerHour = 1; // 8 l/m²
    fixedDay = "2026-05-10";
    expect((await api("GET", "/care/weather")).data).toMatchObject({ hasLocation: true, rainWaters: true, frost: null, today: { date: "2026-05-10", precipitationMm: 8 } });

    expect(await runAt("2026-05-10")).toBe(1);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({ topic: "plant-care", tag: `task-${inside.id}` });
    const [row] = await q<{ rain_skipped_on: string; last_completed_at: Date | null }>("SELECT rain_skipped_on::text, last_completed_at FROM tasks WHERE id = $1", [outside.id]);
    expect(row!.rain_skipped_on).toBe("2026-05-10");
    expect(row!.last_completed_at).not.toBeNull();
    const shown = ((await api("GET", "/tasks")).data as any[]).find((t) => t.id === outside.id);
    expect(shown).toMatchObject({ careNote: "Heute hat der Regen gegossen.", nextDueDate: "2026-05-12" });
  });

  it("waters outside as usual when it stays dry or there is no location", async () => {
    await api("POST", "/tasks", task({ outdoor: true }));
    await q("UPDATE tasks SET created_at = '2026-05-01T08:00:00Z'");
    rainPerHour = 0.5; // 4 l/m² – not enough
    expect(await runAt("2026-05-11")).toBe(1);
    await q("UPDATE tasks SET last_notified_at = NULL");
    await q("DELETE FROM farm_memberships");
    rainPerHour = 2;
    expect(await runAt("2026-05-12")).toBe(1);
    fixedDay = "2026-05-12";
    expect((await api("GET", "/care/weather")).data).toEqual({ hasLocation: false, today: null, rainWaters: false, frost: null });
  });

  it("warns of frost once for plants outside, then rests for 45 days", async () => {
    await api("POST", "/tasks", task({ outdoor: true, reminderTime: "18:00" }));
    minTemp = -2;
    await runAt("2026-10-20", "06:40");
    const frost = sendPushToUser.mock.calls.filter((c) => (c[1] as { tag: string }).tag === "care-frost");
    expect(frost).toHaveLength(1);
    expect(frost[0]![1]).toMatchObject({ title: "Frost in Sicht", body: "heute Nacht bis -2 °C: frostempfindliche Pflanzen draußen reinholen oder abdecken.", url: "/aufgaben" });
    // Not again within 45 days, again after.
    await runAt("2026-11-10", "06:40");
    await runAt("2026-12-10", "06:40");
    expect(sendPushToUser.mock.calls.filter((c) => (c[1] as { tag: string }).tag === "care-frost")).toHaveLength(2);
  });

  it("does not warn of frost without plants outside", async () => {
    await api("POST", "/tasks", task({ reminderTime: "18:00" }));
    minTemp = -5;
    await runAt("2026-10-21", "06:40");
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});
