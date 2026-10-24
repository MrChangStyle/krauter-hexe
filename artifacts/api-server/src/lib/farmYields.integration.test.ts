/**
 * Ertrag & Bilanz against a REAL Postgres, through the HTTP routes: entering
 * and deleting animal yields, the year overview with garden harvests, own
 * prices, the laying rate, roles and farm isolation.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The overview reaches the Futterplaner (feed costs), which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
let fixedDay = "2026-10-19";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Ertrag & Bilanz (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let farmId = 0;
  let otherFarm = 0;
  let herdId = 0;

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
    app.use((await import("../routes/farm-yields")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('gina', 'g@x.de', true), ('bert', 'b@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Sonnenblick') RETURNING id");
    const [g] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Bert') RETURNING id");
    farmId = f!.id;
    otherFarm = g!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'caretaker'), ($1, 'gina', 'guest'), ($2, 'bert', 'admin')`, [farmId, otherFarm]);
    const [h] = await q<{ id: number }>("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Hühner', 'poultry') RETURNING id", [farmId]);
    herdId = h!.id;
    as = "anna";
    fixedDay = "2026-10-19";
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
  const Y = (year = 2026) => `/farms/${farmId}/yield-overview/${year}`;

  it("adds eggs, sums the year with the garden and the laying rate", async () => {
    for (let k = 0; k < 4; k++) {
      await q("INSERT INTO farm_animals (farm_id, herd_id, name, species, sex, registration_number) VALUES ($1, $2, $3, 'poultry', 'female', $3)", [farmId, herdId, `H-${k}`]);
    }
    expect((await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-10", amount: 60, herdId })).status).toBe(204);
    await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-08-01", amount: 100 });
    await api("POST", `/farms/${farmId}/yields`, { product: "milk", date: "2025-05-01", amount: 10 });
    await q("INSERT INTO harvest_logs (farm_id, season, crop_key, label, cells, harvested_on, amount_kg, use) VALUES ($1, 2026, 'tomate', 'Tomate', 2, '2026-08-20', 5, 'kitchen')", [farmId]);
    as = "gina";
    const { status, data } = await api("GET", Y());
    expect(status).toBe(200);
    expect(data.entries.map((e: any) => [e.product, e.date, e.amount, e.unit, e.herdName])).toEqual([
      ["eggs", "2026-10-10", 60, "Stück", "Hühner"],
      ["eggs", "2026-08-01", 100, "Stück", null],
    ]);
    expect(data.summary.animals.lines).toEqual([{ product: "eggs", unit: "Stück", amount: 160, price: 0.4, value: 64 }]);
    expect(data.summary.garden.lines[0]).toMatchObject({ name: "Tomate", kitchenKg: 5, value: 20 });
    expect(data.summary.total).toBe(84);
    expect(data.previousTotal).toBe(15);
    // 60 eggs from 4 hens in the last 30 days.
    expect(data.laying).toEqual({ hens: 4, eggs: 60, perHenDay: 0.5 });
    expect(data.feedCost).toBeNull();
    // Past years: no laying rate.
    expect((await api("GET", Y(2025))).data).toMatchObject({ laying: null, summary: { total: 15 } });
    expect((await api("GET", Y(2027))).status).toBe(400);
  });

  it("shows the laying history per week, group and hen", async () => {
    const [lotte] = await q<{ id: number }>("INSERT INTO farm_animals (farm_id, herd_id, name, species, sex, registration_number) VALUES ($1, $2, 'Lotte', 'poultry', 'female', 'L') RETURNING id", [farmId, herdId]);
    await q("INSERT INTO farm_animals (farm_id, herd_id, name, species, sex, registration_number) VALUES ($1, $2, 'Berta', 'poultry', 'unknown', 'B')", [farmId, herdId]);
    // A chick does not count yet, a rooster never.
    await q("INSERT INTO farm_animals (farm_id, herd_id, name, species, sex, registration_number, birth_date) VALUES ($1, $2, 'Küken', 'poultry', 'female', 'K', '2026-09-01')", [farmId, herdId]);
    await q("INSERT INTO farm_animals (farm_id, herd_id, name, species, sex, registration_number) VALUES ($1, $2, 'Hahn', 'poultry', 'male', 'H')", [farmId, herdId]);
    const [fremd] = await q<{ id: number }>("INSERT INTO farm_animals (farm_id, name, species, sex, registration_number) VALUES ($1, 'Fremd', 'poultry', 'female', 'F') RETURNING id", [otherFarm]);
    expect((await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-13", amount: 10, herdId })).status).toBe(204);
    expect((await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-18", amount: 1, animalId: lotte!.id })).status).toBe(204);
    expect((await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-18", amount: 1, animalId: fremd!.id })).data.error).toBe("Diese Henne gibt es auf der Farm nicht.");
    // Milk never names a hen.
    await api("POST", `/farms/${farmId}/yields`, { product: "milk", date: "2026-10-18", amount: 2, animalId: lotte!.id });
    as = "gina";
    const entries = (await api("GET", Y())).data.entries;
    expect(entries.map((e: any) => [e.product, e.animalName])).toEqual([["milk", null], ["eggs", "Lotte"], ["eggs", null]]);
    expect((await api("GET", Y())).data.laying).toEqual({ hens: 2, eggs: 11, perHenDay: 0.18 });
    const { status, data } = await api("GET", `/farms/${farmId}/laying`);
    expect(status).toBe(200);
    expect(data.weeks).toHaveLength(26);
    expect(data.weeks.at(-2)).toEqual({ start: "2026-10-12", days: 7, eggs: 11, hens: 2, perHenDay: 0.79 });
    expect(data.weeks.at(-1)).toMatchObject({ start: "2026-10-19", days: 1, eggs: 0 });
    expect(data.groups).toEqual([{ herdId, name: "Hühner", hens: 2, eggs: 11, perHenDay: 0.18 }]);
    expect(data.hens).toEqual([{ animalId: lotte!.id, name: "Lotte", eggs: 1, lastEgg: "2026-10-18" }]);
    expect(data.hints.map((h: any) => h.kind)).toEqual(["moult", "young"]);
    as = "bert";
    expect((await api("GET", `/farms/${farmId}/laying`)).status).toBe(404);
  });

  it("checks the input and deletes", async () => {
    const bad = async (body: object) => (await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-01", amount: 5, ...body })).status;
    expect(await bad({ product: "honey" })).toBe(400);
    expect(await bad({ amount: 0 })).toBe(400);
    expect(await bad({ date: "2099-01-01" })).toBe(400);
    const [other] = await q<{ id: number }>("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Fremd', 'poultry') RETURNING id", [otherFarm]);
    expect((await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-01", amount: 5, herdId: other!.id })).data.error).toBe("Diese Gruppe gibt es auf der Farm nicht.");
    await api("POST", `/farms/${farmId}/yields`, { product: "wool", date: "2026-06-01", amount: 2.5 });
    const id = (await api("GET", Y())).data.entries[0].id;
    as = "bert";
    expect((await api("DELETE", `/farms/${otherFarm}/yields/${id}`)).status).toBe(404);
    as = "gina";
    expect((await api("DELETE", `/farms/${farmId}/yields/${id}`)).status).toBe(403);
    as = "anna";
    expect((await api("DELETE", `/farms/${farmId}/yields/${id}`)).status).toBe(204);
    expect((await api("GET", Y())).data.entries).toEqual([]);
  });

  it("uses the farm's own prices", async () => {
    await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-01", amount: 10 });
    await q("INSERT INTO harvest_logs (farm_id, season, crop_key, label, cells, harvested_on, amount_kg, use) VALUES ($1, 2026, 'kuerbis', 'Kürbis', 2, '2026-09-20', 8, 'fodder')", [farmId]);
    let prices = (await api("GET", `/farms/${farmId}/prices`)).data;
    expect(prices.map((p: any) => p.key)).toEqual(["product:eggs", "product:milk", "product:meat", "product:wool", "fodder", "crop:kuerbis"]);
    expect(prices[0]).toEqual({ key: "product:eggs", label: "Eier", unit: "Stück", eur: 0.4, own: false });
    prices = (await api("PUT", `/farms/${farmId}/prices`, { key: "product:eggs", eur: 0.6 })).data;
    expect(prices[0]).toMatchObject({ eur: 0.6, own: true });
    await api("PUT", `/farms/${farmId}/prices`, { key: "fodder", eur: 0.5 });
    expect((await api("GET", Y())).data.summary).toMatchObject({ total: 10, animals: { value: 6 }, garden: { value: 4 } });
    prices = (await api("PUT", `/farms/${farmId}/prices`, { key: "product:eggs", eur: null })).data;
    expect(prices[0]).toMatchObject({ eur: 0.4, own: false });
    expect((await api("PUT", `/farms/${farmId}/prices`, { key: "crop:../x", eur: 1 })).status).toBe(400);
    expect((await api("PUT", `/farms/${farmId}/prices`, { key: "fodder", eur: -1 })).status).toBe(400);
    as = "gina";
    expect((await api("PUT", `/farms/${farmId}/prices`, { key: "fodder", eur: 1 })).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farmId}/prices`)).status).toBe(404);
  });

  it("sets expenses against the value", async () => {
    await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-01", amount: 100 });
    expect((await api("POST", `/farms/${farmId}/expenses`, { date: "2026-09-01", category: "feed", amountEur: 24.99, note: "Legemehl 25 kg" })).status).toBe(204);
    await api("POST", `/farms/${farmId}/expenses`, { date: "2026-10-05", category: "vet", amountEur: 35 });
    await api("POST", `/farms/${farmId}/expenses`, { date: "2025-12-01", category: "feed", amountEur: 10 });
    const { data } = await api("GET", Y());
    expect(data.expenses).toMatchObject({ total: 59.99, lines: [{ category: "feed", eur: 24.99 }, { category: "vet", eur: 35 }] });
    expect(data.expenses.entries.map((e: any) => [e.date, e.category, e.amountEur, e.note])).toEqual([
      ["2026-10-05", "vet", 35, null],
      ["2026-09-01", "feed", 24.99, "Legemehl 25 kg"],
    ]);
    expect(data.balance).toBe(-19.99);
    const bad = async (body: object) => (await api("POST", `/farms/${farmId}/expenses`, { date: "2026-10-01", category: "feed", amountEur: 5, ...body })).status;
    expect(await bad({ category: "urlaub" })).toBe(400);
    expect(await bad({ amountEur: 0 })).toBe(400);
    expect(await bad({ date: "2099-01-01" })).toBe(400);
    const id = data.expenses.entries[0].id;
    as = "gina";
    expect((await api("POST", `/farms/${farmId}/expenses`, { date: "2026-10-01", category: "feed", amountEur: 5 })).status).toBe(403);
    expect((await api("DELETE", `/farms/${farmId}/expenses/${id}`)).status).toBe(403);
    as = "bert";
    expect((await api("DELETE", `/farms/${otherFarm}/expenses/${id}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `/farms/${farmId}/expenses/${id}`)).status).toBe(204);
    expect((await api("GET", Y())).data.balance).toBe(15.01);
  });

  it("keeps sales apart from the self-supply", async () => {
    await api("POST", `/farms/${farmId}/yields`, { product: "eggs", date: "2026-10-01", amount: 100 });
    await api("POST", `/farms/${farmId}/expenses`, { date: "2026-10-01", category: "feed", amountEur: 20 });
    expect((await api("POST", `/farms/${farmId}/sales`, { date: "2026-10-05", product: "product:eggs", amount: 60, revenueEur: 30 })).status).toBe(204);
    await api("POST", `/farms/${farmId}/sales`, { date: "2026-10-06", label: "Eierlikör", revenueEur: 12.5, note: "Hofladen" });
    const { data } = await api("GET", Y());
    expect(data.sales).toMatchObject({ revenue: 42.5, soldValue: 24 });
    expect(data.sales.entries.map((e: any) => [e.label, e.amount, e.unit, e.revenueEur])).toEqual([
      ["Eierlikör", null, null, 12.5],
      ["Eier", 60, "Stück", 30],
    ]);
    // 100 eggs are worth 40 €, 60 of them were sold (24 €): 16 € kept, plus 42.50 € sold, minus 20 € feed.
    expect(data.selfSupply).toBe(16);
    expect(data.balance).toBe(38.5);
    const bad = async (body: object) => (await api("POST", `/farms/${farmId}/sales`, { date: "2026-10-01", revenueEur: 5, ...body })).data?.error;
    expect(await bad({})).toBe("Bitte gib an, was verkauft wurde.");
    expect(await bad({ product: "product:honey" })).toBe("Dieses Produkt gibt es nicht.");
    expect(await bad({ product: "crop:gibtsnicht" })).toBe("Dieses Produkt gibt es nicht.");
    expect(await bad({ product: "product:eggs", revenueEur: 0 })).toBe("Der Erlös ist ungültig.");
    const id = data.sales.entries[0].id;
    as = "gina";
    expect((await api("DELETE", `/farms/${farmId}/sales/${id}`)).status).toBe(403);
    as = "bert";
    expect((await api("DELETE", `/farms/${otherFarm}/sales/${id}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `/farms/${farmId}/sales/${id}`)).status).toBe(204);
    expect((await api("GET", Y())).data.sales.revenue).toBe(30);
  });
});
