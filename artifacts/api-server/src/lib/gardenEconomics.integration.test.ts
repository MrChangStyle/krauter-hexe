/**
 * Garten-Wirtschaftlichkeit against a REAL Postgres, through the HTTP routes:
 * garden costs (farm expenses with the garden flag), hours, the economics of
 * a season, roles, isolation, and the costs showing in Ertrag & Bilanz once.
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

describe.skipIf(!enabled)("Garten-Wirtschaftlichkeit (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let bed = 0;
  // validDate refuses days in the future: last year's season is safely past.
  const season = new Date().getFullYear() - 1;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/garden")).default);
    app.use((await import("../routes/farm-yields")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true), ('olli', 'o@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role, modules) VALUES ($1, 'anna', 'admin', null), ($2, 'bert', 'admin', null), ($1, 'gast', 'guest', null), ($1, 'olli', 'caretaker', '["feed"]')`,
      [farm.anna, farm.bert],
    );
    const [g] = await q<{ id: number }>(`INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 500, 200) RETURNING id`, [farm.anna]);
    bed = g!.id;
    // A harvest worth 4 €/kg × 10 kg = 40 € (tomato at the default price).
    await q(
      `INSERT INTO harvest_logs (farm_id, bed_id, season, crop_key, label, cells, harvested_on, amount_kg, use) VALUES ($1, $2, $3, 'tomate', 'Tomate', 4, $4, 10, 'kitchen')`,
      [farm.anna, bed, season, `${season}-08-01`],
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
  const G = (farmId = farm.anna) => `/farms/${farmId}/garden`;
  const economics = async () => (await api("GET", `${G()}/seasons/${season}/economics`)).data;

  it("sets the harvest against garden costs and hours, per bed", async () => {
    expect((await api("POST", `${G()}/costs`, { date: `${season}-03-10`, category: "seeds", amountEur: 12.5, note: "Tomatensamen" })).status).toBe(204);
    expect((await api("POST", `${G()}/costs`, { date: `${season}-04-01`, category: "soil", amountEur: 7.5, bedId: bed })).status).toBe(204);
    expect((await api("POST", `${G()}/hours`, { date: `${season}-05-01`, hours: 3.9, bedId: bed })).status).toBe(204);
    const e = await economics();
    expect(e).toMatchObject({
      season,
      value: 40,
      kg: 10,
      area: 10,
      costs: { total: 20, lines: [{ category: "seeds", eur: 12.5 }, { category: "soil", eur: 7.5 }] },
      hours: { total: 4, estimated: false },
      surplus: 20,
      perHour: 5,
      costPerKg: 2,
      surplusPerM2: 2,
    });
    expect(e.beds).toEqual([
      { bedId: bed, name: "Beet", m2: 10, value: 40, costs: 7.5, surplus: 32.5, hours: 4 },
      { bedId: null, name: "Für den ganzen Garten", m2: null, value: 0, costs: 12.5, surplus: -12.5, hours: 0 },
    ]);
    expect(e.costs.entries.map((c: any) => [c.category, c.bedName])).toEqual([["soil", "Beet"], ["seeds", null]]);

    // Ertrag & Bilanz counts them once, marked for the garden.
    const year = (await api("GET", `/farms/${farm.anna}/yield-overview/${season}`)).data;
    expect(year.expenses.total).toBe(20);
    expect(year.expenses.entries.every((x: any) => x.garden)).toBe(true);

    // A feed expense there stays out of the garden; seed entered there counts.
    await api("POST", `/farms/${farm.anna}/expenses`, { date: `${season}-06-01`, category: "feed", amountEur: 30 });
    await api("POST", `/farms/${farm.anna}/expenses`, { date: `${season}-06-01`, category: "water", amountEur: 5 });
    await api("POST", `/farms/${farm.anna}/expenses`, { date: `${season}-06-01`, category: "equipment", amountEur: 9, garden: true });
    expect((await economics()).costs.total).toBe(34);

    // Deleting: only garden costs through the garden route.
    const feed = (await api("GET", `/farms/${farm.anna}/yield-overview/${season}`)).data.expenses.entries.find((x: any) => x.category === "feed");
    expect((await api("DELETE", `${G()}/costs/${feed.id}`)).status).toBe(404);
    const seeds = (await economics()).costs.entries.find((c: any) => c.category === "seeds");
    expect((await api("DELETE", `${G()}/costs/${seeds.id}`)).status).toBe(204);
    const h = (await economics()).hours.entries[0];
    expect((await api("DELETE", `${G()}/hours/${h.id}`)).status).toBe(204);
    expect((await economics()).hours).toMatchObject({ estimated: true, total: 30 });
  });

  it("checks the input and keeps the beds and costs to the farm", async () => {
    const [other] = await q<{ id: number }>(`INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Fremd', 'bed', 100, 100) RETURNING id`, [farm.bert]);
    expect((await api("POST", `${G()}/costs`, { date: `${season}-03-10`, category: "seeds", amountEur: 5, bedId: other!.id })).data.error).toBe("Dieses Beet gibt es auf der Farm nicht.");
    expect((await api("POST", `${G()}/costs`, { date: `${season}-03-10`, category: "seeds", amountEur: 0 })).status).toBe(400);
    expect((await api("POST", `${G()}/costs`, { date: "2999-01-01", category: "seeds", amountEur: 5 })).status).toBe(400);
    expect((await api("POST", `${G()}/hours`, { date: `${season}-03-10`, hours: 0.1 })).data.error).toMatch(/Viertelstunde/);
    expect((await api("POST", `${G()}/hours`, { date: `${season}-03-10`, hours: 25 })).status).toBe(400);

    await api("POST", `${G()}/costs`, { date: `${season}-03-10`, category: "seeds", amountEur: 5 });
    const id = (await economics()).costs.entries[0].id;
    as = "gast";
    expect((await api("GET", `${G()}/seasons/${season}/economics`)).status).toBe(200);
    expect((await api("POST", `${G()}/hours`, { date: `${season}-03-10`, hours: 1 })).status).toBe(403);
    as = "olli";
    expect((await api("GET", `${G()}/seasons/${season}/economics`)).status).toBe(403);
    as = "bert";
    expect((await api("DELETE", `${G(farm.bert)}/costs/${id}`)).status).toBe(404);
    expect((await api("GET", `${G()}/seasons/${season}/economics`)).status).toBe(404);
  });

  it("compares with the season before", async () => {
    await q(`INSERT INTO farm_expenses (farm_id, date, category, amount_eur, garden) VALUES ($1, $2, 'seeds', 8, true)`, [farm.anna, `${season - 1}-04-01`]);
    expect((await economics()).previous).toEqual({ value: 0, costs: 8, surplus: -8 });
  });
});
