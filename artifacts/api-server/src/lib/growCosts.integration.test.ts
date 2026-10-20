/**
 * Grow Strom- und Kostenrechner against a REAL Postgres, through the HTTP
 * routes: lamp and fans of a tent, the own tariff, entered costs, the price
 * per gram after the harvest, privacy between accounts and deleting.
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
let fixedDay = "2026-04-01";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Grow Strom und Kosten (real database)", () => {
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
    await q("TRUNCATE users, grow_access, grows RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('owner', 'o@x.de', true, true), ('anna', 'anna@x.de', true, false), ('bert', 'bert@x.de', true, false)`);
    fixedDay = "2026-04-01";
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
  const tent = { name: "Zelt", environment: "indoor", medium: "soil", lightWatts: 240, fanWatts: 30 };
  const plant = { name: "Lemon 1", strainType: "hybrid", flowering: "photo", seedSex: "feminized", startedOn: "2026-03-01" };

  it("computes the electricity of a tent with the own tariff and the entered costs", async () => {
    await open("anna");
    const r0 = await api("POST", "/grow/grows", tent);
    const growId = r0.data.grows[0].id;
    expect(r0.data.grows[0]).toMatchObject({ lightWatts: 240, fanWatts: 30 });
    let r = await api("GET", `/grow/grows/${growId}/costs`);
    expect(r.data).toMatchObject({ kwhPrice: 0.37, ownPrice: false, lightWatts: 240, fanWatts: 30, energy: { kwh: 0 }, items: [] });
    const plantId = (await api("POST", `/grow/grows/${growId}/plants`, plant)).data.id;
    r = await api("GET", `/grow/grows/${growId}/costs`);
    expect(r.data.energy).toEqual({ from: "2026-03-06", to: "2026-06-18", lampHours: 1512, kwhLamp: 362.9, kwhFans: 75.6, kwh: 438.5, kwhSoFar: 136.1 });
    expect(r.data.summary).toMatchObject({ electricityEur: 162.25, electricitySoFarEur: 50.36, totalEur: 162.25, eurPerGram: null });
    // Own tariff.
    expect((await api("PUT", "/grow/access", { kwhPrice: 0.4 })).data.kwhPrice).toBe(0.4);
    expect((await api("PUT", "/grow/access", { kwhPrice: 5 })).status).toBe(400);
    // Costs.
    r = await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-02-20", category: "equipment", item: "Zelt 80×80", amount: 99.99 });
    expect(r.status).toBe(201);
    await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-02-21", category: "soil", item: "Erde 50 l", amount: 20.01 });
    expect((await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-02-21", category: "car", item: "x", amount: 1 })).status).toBe(400);
    expect((await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-02-21", category: "soil", item: "x", amount: 0 })).status).toBe(400);
    expect((await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-02-21", category: "soil", item: " ", amount: 3 })).status).toBe(400);
    r = await api("GET", `/grow/grows/${growId}/costs`);
    expect(r.data).toMatchObject({ kwhPrice: 0.4, ownPrice: true });
    expect(r.data.items.map((i: any) => i.item)).toEqual(["Erde 50 l", "Zelt 80×80"]);
    expect(r.data.summary).toMatchObject({ electricityEur: 175.4, itemsEur: 120, byCategory: [{ category: "equipment", eur: 99.99 }, { category: "soil", eur: 20.01 }], totalEur: 295.4 });
    // After the harvest: cost per gram, the electricity used up to then.
    fixedDay = "2026-07-01";
    await api("PUT", `/grow/plants/${plantId}`, { ...plant, harvestedOn: "2026-06-19", dryGrams: 80 });
    r = await api("GET", `/grow/grows/${growId}/costs`);
    expect(r.data.summary).toMatchObject({ dryGrams: 80, eurPerGram: 3.69 });
    // Archiving without the fans keeps them; back to the default tariff.
    await api("PUT", `/grow/grows/${growId}`, { name: "Zelt", environment: "indoor", medium: "soil", lightWatts: 240, archived: true });
    expect((await api("GET", `/grow/grows/${growId}/costs`)).data.fanWatts).toBe(30);
    expect((await api("PUT", "/grow/access", { kwhPrice: null })).data.kwhPrice).toBeNull();
    // Delete a cost.
    expect((await api("DELETE", `/grow/costs/${r.data.items[0].id}`)).status).toBe(204);
    expect((await api("GET", `/grow/grows/${growId}/costs`)).data.items).toHaveLength(1);
  });

  it("has no electricity outdoors and keeps the costs to the account", async () => {
    await open("anna");
    const r = await api("POST", "/grow/grows", { ...tent, name: "Garten", environment: "outdoor" });
    const growId = r.data.grows[0].id;
    expect(r.data.grows[0]).toMatchObject({ lightWatts: null, fanWatts: null });
    await api("POST", `/grow/grows/${growId}/plants`, plant);
    await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-03-01", category: "fertilizer", item: "Blütedünger", amount: 12 });
    expect((await api("GET", `/grow/grows/${growId}/costs`)).data.summary).toMatchObject({ electricityEur: 0, totalEur: 12 });
    const costId = (await api("GET", `/grow/grows/${growId}/costs`)).data.items[0].id;
    await open("bert");
    expect((await api("GET", `/grow/grows/${growId}/costs`)).status).toBe(404);
    expect((await api("POST", `/grow/grows/${growId}/costs`, { date: "2026-03-01", category: "soil", item: "x", amount: 1 })).status).toBe(404);
    expect((await api("DELETE", `/grow/costs/${costId}`)).status).toBe(404);
    // Gone with the grow.
    as = "anna";
    await api("DELETE", `/grow/grows/${growId}`);
    expect(await q("SELECT * FROM grow_costs")).toEqual([]);
  });
});
