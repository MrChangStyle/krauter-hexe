/**
 * Wetter für den Hof against a REAL Postgres, through the HTTP routes, with
 * the weather service and the postal-code lookup replaced: the location (farm,
 * or taken from a bed), forecast and warnings, roles, and the morning push
 * that sends a lasting warning only once; the official DWD warnings and their
 * push.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-12-01";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

/** Bright Sky: every day `minTemp` at night, 8 °C at noon. */
let minTemp = -3;
const weatherCalls: string[] = [];
/** Bright Sky /alerts: what the DWD has out for the area. */
let alerts: Record<string, unknown>[] = [];
const alert = (id: string, severity: string, over: Record<string, unknown> = {}) => ({
  alert_id: id,
  status: "actual",
  onset: "2026-12-01T14:00:00+01:00",
  expires: "2099-12-01T20:00:00+01:00",
  category: "met",
  response_type: "prepare",
  severity,
  event_code: 52,
  event_de: "ORKANARTIGE BÖEN",
  headline_de: "Amtliche UNWETTERWARNUNG vor ORKANARTIGEN BÖEN",
  description_de: "Es treten orkanartige Böen bis 110 km/h auf.",
  instruction_de: "Halten Sie Abstand von Gebäuden, Bäumen und Gerüsten.",
  ...over,
});
const realFetch = globalThis.fetch;
function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.startsWith("https://nominatim.openstreetmap.org/")) {
    return Promise.resolve(new Response(JSON.stringify(url.includes("postalcode=99999") ? [] : [{ lat: "52.5208", lon: "13.4094" }])));
  }
  if (url.startsWith("https://api.brightsky.dev/weather")) {
    weatherCalls.push(url);
    const from = new URL(url).searchParams.get("date")!;
    const weather = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
      const d = new Date(`${from}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      return Array.from({ length: 24 }, (_, h) => ({
        timestamp: `${date}T${String(h).padStart(2, "0")}:00:00+01:00`,
        temperature: h === 4 ? minTemp : 8,
        precipitation: 0,
        wind_gust_speed: 20,
        icon: "cloudy",
      }));
    });
    return Promise.resolve(new Response(JSON.stringify({ weather })));
  }
  if (url.startsWith("https://api.brightsky.dev/alerts")) {
    return Promise.resolve(new Response(JSON.stringify({ alerts, location: { name: "Berlin", warn_cell_id: 811000000 } })));
  }
  return realFetch(input, init);
}

describe.skipIf(!enabled)("Wetter für den Hof (real database, weather replaced)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    vi.stubGlobal("fetch", fakeFetch);
    const { default: router } = await import("../routes/farm-weather");
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
    server?.close();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('pia', 'p@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'pia', 'caretaker'), ($1, 'gast', 'guest'), ($2, 'bert', 'admin')`,
      [farm.anna, farm.bert],
    );
    await q(`INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Hühner', 'poultry')`, [farm.anna]);
    as = "anna";
    minTemp = -3;
    alerts = [];
    fixedDay = "2026-12-01";
    sendPushToUser.mockClear();
  });

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetchLocal(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };
  const fetchLocal = (url: string, init: RequestInit) => realFetch(url, init);

  it("takes the location from a bed until the farm has its own, then forecasts and warns", async () => {
    expect((await api("GET", `/farms/${farm.anna}/weather`)).data).toEqual({ location: null, days: [], warnings: [], alerts: [], alertArea: null });
    await q(`INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm, postal_code, latitude, longitude) VALUES ($1, 'Beet', 'bed', 200, 100, '01067', 51.1, 13.7)`, [farm.anna]);
    expect((await api("GET", `/farms/${farm.anna}/weather`)).data.location).toEqual({ source: "bed", postalCode: "01067", latitude: 51.1, longitude: 13.7 });

    const set = await api("PUT", `/farms/${farm.anna}/location`, { postalCode: "10115" });
    expect(set.status).toBe(200);
    expect(set.data.location).toEqual({ source: "farm", postalCode: "10115", latitude: 52.5, longitude: 13.4 });
    // A week ahead.
    expect(set.data.days.map((d: any) => [d.date, d.minTemp, d.maxTemp])).toEqual(
      ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07"].map((d) => [d, -3, 8]),
    );
    // Frost all week: one warning for the spell.
    expect(set.data.warnings).toEqual([{ kind: "frostSpell", date: "2026-12-01", text: expect.stringMatching(/^Frostperiode: 7 Tage in Folge Frost bis −3 °C/) }]);
    expect(weatherCalls.at(-1)).toContain("lat=52.5&lon=13.4&date=2026-12-01&last_date=2026-12-08");

    // The phone's position wins and is rounded to about 10 km.
    expect((await api("PUT", `/farms/${farm.anna}/location`, { latitude: 48.13743, longitude: 11.57549 })).data.location).toMatchObject({ latitude: 48.1, longitude: 11.6, postalCode: null });
    expect((await api("PUT", `/farms/${farm.anna}/location`, { postalCode: "123" })).status).toBe(400);
    expect((await api("PUT", `/farms/${farm.anna}/location`, { postalCode: "99999" })).status).toBe(422);
  });

  it("lets every member read, only the admin set the location", async () => {
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/weather`)).status).toBe(200);
    expect((await api("PUT", `/farms/${farm.anna}/location`, { postalCode: "10115" })).status).toBe(403);
    as = "pia";
    expect((await api("PUT", `/farms/${farm.anna}/location`, { postalCode: "10115" })).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/weather`)).status).toBe(404);
  });

  it("pushes a warning in the morning once, not every day of a long frost", async () => {
    await api("PUT", `/farms/${farm.anna}/location`, { postalCode: "10115" });
    await q("UPDATE farms SET latitude = 52.5, longitude = 13.4 WHERE id = $1", [farm.bert]);
    const { sendWeatherDigests } = await import("./farmWeather");
    expect(await sendWeatherDigests("07:00", "2026-12-01")).toBe(0);
    expect(await sendWeatherDigests("07:30", "2026-12-01")).toBe(1);
    expect(await sendWeatherDigests("07:31", "2026-12-01")).toBe(0);
    // Admin and caretaker, not the guest; Bert's farm has no animals.
    expect(sendPushToUser.mock.calls.map(([user, p]) => [user, (p as any).title])).toEqual([
      ["anna", "Wetter-Hinweis für deinen Hof"],
      ["pia", "Wetter-Hinweis für deinen Hof"],
    ]);
    // A week of frost: one warning for the spell.
    expect((sendPushToUser.mock.calls[0]![1] as any).body).toMatch(/^Frostperiode: 7 Tage in Folge Frost bis −3 °C \(bis Mo 07\.12\. und länger\): Tränken/);
    // Next day still frost: no second push. Then it gets much colder: a new warning.
    fixedDay = "2026-12-02";
    expect(await sendWeatherDigests("07:30", "2026-12-02")).toBe(0);
    fixedDay = "2026-12-03";
    minTemp = -14;
    expect(await sendWeatherDigests("07:30", "2026-12-03")).toBe(1);
    expect((sendPushToUser.mock.calls.at(-1)![1] as any).title).toBe("Unwetter-Warnung für deinen Hof");
  });

  it("shows the DWD warnings for the area and pushes a severe one once, again only when it gets worse", async () => {
    alerts = [
      alert("a-frost", "minor", { event_code: 22, event_de: "FROST", headline_de: "Amtliche WARNUNG vor FROST" }),
      alert("a-storm", "severe"),
      alert("a-test", "extreme", { status: "test" }),
      alert("a-over", "severe", { expires: "2020-01-01T00:00:00+01:00" }),
    ];
    // A place of its own: the warnings are cached per place for ten minutes.
    await api("PUT", `/farms/${farm.anna}/location`, { latitude: 50.1, longitude: 8.7 });
    await q("UPDATE farms SET latitude = 50.1, longitude = 8.7 WHERE id = $1", [farm.bert]);
    const { data } = await api("GET", `/farms/${farm.anna}/weather`);
    expect(data.alertArea).toBe("Berlin");
    expect(data.alerts.map((a: any) => [a.id, a.severity])).toEqual([
      ["a-storm", "severe"],
      ["a-frost", "minor"],
    ]);
    expect(data.alerts[0]).toMatchObject({ event: "ORKANARTIGE BÖEN", instruction: "Halten Sie Abstand von Gebäuden, Bäumen und Gerüsten." });

    // The cache holds for ten minutes – every step is a new cron call later.
    const { sendAlertPushes } = await import("./farmWeather");
    let now = Date.parse("2026-12-01T12:00:00Z");
    const tick = () => new Date((now += 11 * 60_000));
    expect(await sendAlertPushes("2026-12-01", tick())).toBe(1);
    // Admin and caretaker of the farm with animals; the frost (level 1) is not pushed.
    expect(sendPushToUser.mock.calls.map(([user, p]) => [user, (p as any).title])).toEqual([
      ["anna", "Unwetterwarnung des DWD"],
      ["pia", "Unwetterwarnung des DWD"],
    ]);
    expect((sendPushToUser.mock.calls[0]![1] as any).body).toBe("Amtliche UNWETTERWARNUNG vor ORKANARTIGEN BÖEN – Halten Sie Abstand von Gebäuden, Bäumen und Gerüsten.");
    expect(await sendAlertPushes("2026-12-01", tick())).toBe(0);
    // DWD re-issues it under a new id: the same warning, no second push …
    alerts = [alert("a-storm-2", "severe")];
    expect(await sendAlertPushes("2026-12-01", tick())).toBe(0);
    // … until it gets worse.
    alerts = [alert("a-storm-3", "extreme", { headline_de: "Amtliche EXTREME UNWETTERWARNUNG vor ORKANBÖEN" })];
    expect(await sendAlertPushes("2026-12-01", tick())).toBe(1);
    expect((sendPushToUser.mock.calls.at(-1)![1] as any).title).toBe("Extreme Unwetterwarnung (DWD)");
    expect(sendPushToUser).toHaveBeenCalledTimes(4);
  });
});
