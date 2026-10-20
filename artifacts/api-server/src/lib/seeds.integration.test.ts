/**
 * Saatgut against a REAL Postgres, through the HTTP routes: adding, changing,
 * archiving and deleting seed, germination tests, the bed plan's missing
 * seed, roles and farm isolation.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The garden routes load the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
let fixedDay = "2026-10-19";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Saatgut (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let farmId = 0;
  let otherFarm = 0;

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
    app.use((await import("../routes/farm-seeds")).default);
    app.use((await import("../routes/garden")).default);
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
  const S = () => `/farms/${farmId}/seeds`;

  it("adds seed with the crop's name and germination years", async () => {
    const r = await api("POST", S(), { cropKey: "moehre", variety: "Nantaise 2", amount: 2, unit: "Tüten", harvestYear: 2025, openPollinated: true });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({
      cropKey: "moehre",
      cropName: "Möhre",
      name: "Möhre",
      variety: "Nantaise 2",
      source: "bought",
      status: "ok",
      goodUntil: 2028,
      saving: "biennial",
      archived: false,
    });
    const own = await api("POST", S(), { name: "Bauernsenf", amount: 30, unit: "g", source: "swapped" });
    expect(own.data).toMatchObject({ cropKey: null, cropName: null, status: "check", saving: null });
    const bad = async (body: object) => (await api("POST", S(), { amount: 1, unit: "Tüten", cropKey: "tomate", ...body })).data.error;
    expect(await bad({ cropKey: "gibtsnicht" })).toBe("Diese Kultur gibt es nicht.");
    expect(await bad({ cropKey: null })).toBe("Bitte gib an, was es für Saatgut ist.");
    expect(await bad({ harvestYear: 2027 })).toBe("Das Erntejahr liegt zwischen 1990 und 2026.");
    expect(await bad({ useBy: "2027-02-30" })).toBe("Das Datum „verwendbar bis“ ist ungültig.");
    expect((await api("POST", S(), { cropKey: "tomate", amount: 1, unit: "Pfund" })).status).toBe(400);
  });

  it("records a germination test, changes, archives and deletes", async () => {
    const r = await api("POST", S(), { cropKey: "salat", amount: 1, unit: "Tüten", harvestYear: 2019 });
    expect(r.data.status).toBe("old");
    const id = r.data.id;
    let t = await api("POST", `${S()}/${id}/test`, { sown: 20, germinated: 17, testedOn: "2026-10-10" });
    expect(t.data).toMatchObject({ status: "ok", germinationRate: 0.85, testSown: 20, testGerminated: 17, testedOn: "2026-10-10" });
    expect((await api("POST", `${S()}/${id}/test`, { sown: 20, germinated: 21, testedOn: "2026-10-10" })).data.error).toMatch(/nicht mehr Samen keimen/);
    t = await api("PUT", `${S()}/${id}`, { cropKey: "salat", amount: 0, unit: "Tüten", harvestYear: 2019 });
    expect(t.data.status).toBe("empty");
    // Editing keeps the test.
    expect(t.data.testGerminated).toBe(17);
    t = await api("PUT", `${S()}/${id}`, { cropKey: "salat", amount: 0, unit: "Tüten", archived: true });
    expect(t.data).toMatchObject({ archived: true, status: "archived" });
    expect((await api("DELETE", `${S()}/${id}`)).status).toBe(204);
    expect((await api("GET", S())).data.seeds).toEqual([]);
  });

  it("shows what the bed plan needs", async () => {
    const [bed] = await q<{ id: number }>("INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 200, 100) RETURNING id", [farmId]);
    const plant = (season: number, cropKey: string) =>
      q("INSERT INTO bed_plantings (farm_id, bed_id, season, crop_key, label, x, y) VALUES ($1, $2, $3, $4, $4, 0, 0)", [farmId, bed!.id, season, cropKey]);
    await plant(2025, "gurke");
    await plant(2026, "tomate");
    await plant(2027, "moehre");
    await plant(2027, "kartoffel");
    await api("POST", S(), { cropKey: "tomate", amount: 1, unit: "Tüten", harvestYear: 2025 });
    await api("POST", S(), { cropKey: "moehre", amount: 1, unit: "Tüten", harvestYear: 2020 });
    as = "gina";
    const { data } = await api("GET", S());
    expect(data.plan).toEqual({
      season: 2026,
      missing: [{ cropKey: "kartoffel", name: "Kartoffel", vegetative: true }],
      check: [{ cropKey: "moehre", name: "Möhre", vegetative: false }],
    });
  });

  it("keeps guests to reading and farms apart", async () => {
    const r = await api("POST", S(), { cropKey: "erbse", amount: 100, unit: "g" });
    as = "gina";
    expect((await api("GET", S())).data.seeds).toHaveLength(1);
    expect((await api("POST", S(), { cropKey: "erbse", amount: 1, unit: "g" })).status).toBe(403);
    expect((await api("PUT", `${S()}/${r.data.id}`, { cropKey: "erbse", amount: 1, unit: "g" })).status).toBe(403);
    as = "bert";
    expect((await api("GET", S())).status).toBe(404);
    expect((await api("PUT", `/farms/${otherFarm}/seeds/${r.data.id}`, { cropKey: "erbse", amount: 1, unit: "g" })).status).toBe(404);
    expect((await api("POST", `/farms/${otherFarm}/seeds/${r.data.id}/test`, { sown: 10, germinated: 5, testedOn: "2026-10-01" })).status).toBe(404);
    expect((await api("DELETE", `/farms/${otherFarm}/seeds/${r.data.id}`)).status).toBe(404);
  });

  it("takes seed when a sowing date is ticked off and gives it back", async () => {
    const [bed] = await q<{ id: number }>("INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 200, 100) RETURNING id", [farmId]);
    const [p] = await q<{ id: number }>("INSERT INTO bed_plantings (farm_id, bed_id, season, crop_key, label, x, y, w, h) VALUES ($1, $2, 2026, 'radieschen', 'Radieschen', 0, 0, 1, 1) RETURNING id", [farmId, bed!.id]);
    const old = (await api("POST", S(), { cropKey: "radieschen", amount: 500, unit: "Korn", harvestYear: 2018 })).data;
    const fresh = (await api("POST", S(), { cropKey: "radieschen", variety: "Cherry Belle", amount: 200, unit: "Korn", harvestYear: 2025 })).data;
    await api("POST", S(), { cropKey: "radieschen", amount: 1, unit: "Tüten", harvestYear: 2026 });
    const tick = await api("PUT", `/farms/${farmId}/plantings/${p!.id}/checks/direct_sow`);
    expect(tick.status).toBe(200);
    // The lot that still germinates well, not the old one.
    expect(tick.data.seedUse).toMatchObject({ seedId: fresh.id, name: "Radieschen", variety: "Cherry Belle", unit: "Korn" });
    const taken = tick.data.seedUse.amount;
    expect(taken).toBeGreaterThan(0);
    expect(tick.data.seedUse.left).toBe(200 - taken);
    // Ticking again takes nothing more.
    expect((await api("PUT", `/farms/${farmId}/plantings/${p!.id}/checks/direct_sow`)).data.seedUse).toBeNull();
    const amounts = async () => Object.fromEntries((await api("GET", S())).data.seeds.map((s: any) => [s.id, s.amount]));
    expect((await amounts())[old.id]).toBe(500);
    expect((await amounts())[fresh.id]).toBe(200 - taken);
    // Taking the tick back gives it back.
    expect((await api("DELETE", `/farms/${farmId}/plantings/${p!.id}/checks/direct_sow`)).status).toBe(204);
    expect((await amounts())[fresh.id]).toBe(200);
    expect(await q("SELECT * FROM seed_uses")).toEqual([]);
    // Harvest dates take nothing.
    expect((await api("PUT", `/farms/${farmId}/plantings/${p!.id}/checks/harvest`)).data.seedUse).toBeNull();
  });

  it("never takes more than is left", async () => {
    const [bed] = await q<{ id: number }>("INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 200, 100) RETURNING id", [farmId]);
    const [p] = await q<{ id: number }>("INSERT INTO bed_plantings (farm_id, bed_id, season, crop_key, label, x, y, w, h) VALUES ($1, $2, 2026, 'radieschen', 'Radieschen', 0, 0, 2, 2) RETURNING id", [farmId, bed!.id]);
    const lot = (await api("POST", S(), { cropKey: "radieschen", amount: 3, unit: "Korn", harvestYear: 2025 })).data;
    const tick = await api("PUT", `/farms/${farmId}/plantings/${p!.id}/checks/direct_sow`);
    expect(tick.data.seedUse).toMatchObject({ seedId: lot.id, amount: 3, left: 0 });
    expect((await api("GET", S())).data.seeds[0].status).toBe("empty");
    await api("DELETE", `/farms/${farmId}/plantings/${p!.id}/checks/direct_sow`);
    expect((await api("GET", S())).data.seeds[0].amount).toBe(3);
  });
});
