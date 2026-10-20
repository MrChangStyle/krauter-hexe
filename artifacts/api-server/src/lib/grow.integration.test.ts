/**
 * Grow against a REAL Postgres, through the HTTP routes: the gate (unlocked by
 * the owner, age confirmed), grows and plants with their plan, the Tagebuch,
 * the KCanG check, privacy between accounts and account deletion.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

let fixedDay = "2026-04-01";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Grow (real database)", () => {
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
    as = "anna";
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
  const unlock = async (email: string) => {
    const who = as;
    as = "owner";
    const r = await api("PUT", "/admin/grow-access", { email, unlocked: true });
    as = who;
    return r;
  };
  const tent = { name: "Zelt 80", environment: "indoor", medium: "soil", tentSize: "80×80×160", lightType: "LED", lightWatts: 240 };
  const plant = { name: "Lemon 1", strain: "Lemon Haze", breeder: "Testbank", strainType: "hybrid", flowering: "photo", seedSex: "feminized", startedOn: "2026-03-01" };

  it("stays closed until the owner unlocks it and the age is confirmed", async () => {
    expect((await api("GET", "/grow/access")).data).toEqual({ unlocked: false, ageConfirmed: false, adults: 1 });
    expect((await api("GET", "/grow")).data.error).toBe("Das Grow-Modul ist für dieses Konto nicht freigeschaltet.");
    expect((await api("POST", "/grow/access", { adults: 1 })).status).toBe(403);
    // Only the owner unlocks.
    expect((await api("PUT", "/admin/grow-access", { email: "anna@x.de", unlocked: true })).status).toBe(403);
    const list = await unlock("ANNA@x.de");
    expect(list.data).toEqual([{ email: "anna@x.de", username: null, unlockedAt: expect.any(String) }]);
    expect((await api("GET", "/grow")).data.error).toBe("Bitte bestätige zuerst, dass du volljährig bist.");
    expect((await api("POST", "/grow/access", { adults: 0 })).status).toBe(400);
    expect((await api("POST", "/grow/access", { adults: 2 })).data).toEqual({ unlocked: true, ageConfirmed: true, adults: 2 });
    expect((await api("GET", "/grow")).data).toEqual({
      grows: [],
      kcang: { activePlants: 0, maxPlants: 6, plantsOver: false, dryGramsLastYear: 0, maxGrams: 100, gramsOver: false },
    });
    // The owner has it without being unlocked, but confirms the age too.
    as = "owner";
    expect((await api("GET", "/grow/access")).data).toMatchObject({ unlocked: true, ageConfirmed: false });
    // Taking it back closes it again.
    await api("PUT", "/admin/grow-access", { email: "anna@x.de", unlocked: false });
    expect((await api("GET", "/admin/grow-access")).data).toEqual([]);
    as = "anna";
    expect((await api("GET", "/grow")).status).toBe(403);
    expect((await api("PUT", "/admin/grow-access", { email: "nobody@x.de", unlocked: true })).status).toBe(403);
  });

  it("keeps grows, plants and the Tagebuch with their plan", async () => {
    await unlock("anna@x.de");
    await api("POST", "/grow/access", { adults: 1 });
    let r = await api("POST", "/grow/grows", tent);
    expect(r.status).toBe(201);
    const growId = r.data.grows[0].id;
    expect(r.data.grows[0]).toMatchObject({ name: "Zelt 80", environment: "indoor", medium: "soil", lightWatts: 240, archived: false, plants: [] });
    r = await api("POST", `/grow/grows/${growId}/plants`, plant);
    expect(r.status).toBe(201);
    const p = r.data;
    expect(p).toMatchObject({ name: "Lemon 1", flowerWeeks: 9, plan: { current: "veg", day: 32, flipOn: "2026-04-17", harvestOn: "2026-06-19" } });
    expect(p.plan.targets.light).toMatch(/^18\/6/);
    // Outdoor grows have no tent and light.
    r = await api("POST", "/grow/grows", { ...tent, name: "Garten", environment: "outdoor" });
    expect(r.data.grows.find((g: any) => g.name === "Garten")).toMatchObject({ tentSize: null, lightWatts: null });
    // Tagebuch.
    expect((await api("POST", `/grow/plants/${p.id}/logs`, { date: "2026-03-31", heightCm: 24.5, waterMl: 500, ph: 6.4, ec: 1.1, note: "getoppt" })).status).toBe(204);
    expect((await api("POST", `/grow/plants/${p.id}/logs`, { date: "2026-03-31" })).data.error).toBe("Bitte trage mindestens einen Wert oder eine Notiz ein.");
    expect((await api("POST", `/grow/plants/${p.id}/logs`, { date: "2026-03-31", ph: 14 })).status).toBe(400);
    expect((await api("POST", `/grow/plants/${p.id}/logs`, { date: "2026-02-01", note: "x" })).data.error).toBe("Das Datum liegt vor dem Keimen.");
    const detail = await api("GET", `/grow/plants/${p.id}`);
    expect(detail.data.grow).toEqual({ id: growId, name: "Zelt 80", environment: "indoor", medium: "soil" });
    expect(detail.data.logs).toEqual([{ id: expect.any(Number), date: "2026-03-31", heightCm: 24.5, waterMl: 500, ph: 6.4, ec: 1.1, note: "getoppt" }]);
    // Switching to 12/12 earlier moves the harvest.
    r = await api("PUT", `/grow/plants/${p.id}`, { ...plant, flipOn: "2026-04-10" });
    expect(r.data.plan).toMatchObject({ flipOn: "2026-04-10", harvestOn: "2026-06-12" });
    expect((await api("PUT", `/grow/plants/${p.id}`, { ...plant, startedOn: "2027-01-01" })).status).toBe(400);
    expect((await api("PUT", `/grow/plants/${p.id}`, { ...plant, strainType: "kush" })).status).toBe(400);
    // Delete the log and the plant.
    expect((await api("DELETE", `/grow/logs/${detail.data.logs[0].id}`)).status).toBe(204);
    expect((await api("DELETE", `/grow/plants/${p.id}`)).status).toBe(204);
    expect((await api("GET", `/grow/plants/${p.id}`)).status).toBe(404);
  });

  it("counts plants and the harvest against the KCanG limits", async () => {
    await unlock("anna@x.de");
    await api("POST", "/grow/access", { adults: 1 });
    const growId = (await api("POST", "/grow/grows", tent)).data.grows[0].id;
    for (let k = 1; k <= 4; k++) await api("POST", `/grow/grows/${growId}/plants`, { ...plant, name: `P${k}` });
    let { data } = await api("GET", "/grow");
    expect(data.kcang).toMatchObject({ activePlants: 4, maxPlants: 3, plantsOver: true });
    const ids = data.grows[0].plants.map((p: any) => p.id);
    // Harvested plants no longer count; their dry weight does.
    await api("PUT", `/grow/plants/${ids[0]}`, { ...plant, name: "P1", harvestedOn: "2026-03-25", wetGrams: 300, dryGrams: 62.5 });
    ({ data } = await api("GET", "/grow"));
    expect(data.kcang).toMatchObject({ activePlants: 3, plantsOver: false, dryGramsLastYear: 63, gramsOver: true });
    // A second adult doubles both.
    expect((await api("PUT", "/grow/access", { adults: 2 })).data.adults).toBe(2);
    ({ data } = await api("GET", "/grow"));
    expect(data.kcang).toMatchObject({ maxPlants: 6, maxGrams: 100, gramsOver: false });
    // Archived grows do not count.
    await api("PUT", `/grow/grows/${growId}`, { ...tent, archived: true });
    ({ data } = await api("GET", "/grow"));
    expect(data.kcang.activePlants).toBe(0);
    expect((await api("POST", `/grow/grows/${growId}/plants`, plant)).status).toBe(409);
  });

  it("keeps every account's grows to itself", async () => {
    await unlock("anna@x.de");
    await unlock("bert@x.de");
    await api("POST", "/grow/access", { adults: 1 });
    const growId = (await api("POST", "/grow/grows", tent)).data.grows[0].id;
    const plantId = (await api("POST", `/grow/grows/${growId}/plants`, plant)).data.id;
    as = "bert";
    await api("POST", "/grow/access", { adults: 1 });
    expect((await api("GET", "/grow")).data.grows).toEqual([]);
    expect((await api("GET", `/grow/plants/${plantId}`)).status).toBe(404);
    expect((await api("PUT", `/grow/grows/${growId}`, tent)).status).toBe(404);
    expect((await api("POST", `/grow/grows/${growId}/plants`, plant)).status).toBe(404);
    expect((await api("POST", `/grow/plants/${plantId}/logs`, { date: "2026-03-31", note: "x" })).status).toBe(404);
    expect((await api("DELETE", `/grow/grows/${growId}`)).status).toBe(404);
  });

  it("goes with the account", async () => {
    await unlock("anna@x.de");
    await api("POST", "/grow/access", { adults: 1 });
    const growId = (await api("POST", "/grow/grows", tent)).data.grows[0].id;
    await api("POST", `/grow/grows/${growId}/plants`, plant);
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");
    expect(await q("SELECT * FROM grows")).toEqual([]);
    expect(await q("SELECT * FROM grow_plants")).toEqual([]);
    expect(await q("SELECT * FROM grow_access WHERE user_id = 'anna'")).toEqual([]);
  });
});
