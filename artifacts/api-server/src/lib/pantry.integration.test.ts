/**
 * Vorratskammer against a REAL Postgres, through the HTTP routes: stores made
 * by hand and from a harvest, taking out and undoing, roles, the grant, farm
 * isolation and the Monday push.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-10-26";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Vorratskammer (real database)", () => {
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
    app.use((await import("../routes/pantry")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('pia', 'p@x.de', true), ('gast', 'g@x.de', true), ('olli', 'o@x.de', true), ('bert', 'b@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof') RETURNING id");
    const [g] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Bert') RETURNING id");
    farmId = f!.id;
    otherFarm = g!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role, modules) VALUES ($1, 'anna', 'admin', null), ($1, 'pia', 'caretaker', null), ($1, 'gast', 'guest', null), ($1, 'olli', 'caretaker', '["garden"]'), ($2, 'bert', 'admin', null)`,
      [farmId, otherFarm],
    );
    as = "anna";
    fixedDay = "2026-10-26";
    sendPushToUser.mockClear();
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
  const P = () => `/farms/${farmId}/pantry`;
  const item = (o: object = {}) => ({ name: "Bohnen sauer", kind: "pickled", amount: 6, unit: "Glas", location: "Keller", madeOn: "2026-08-20", bestBefore: "2027-08-20", ...o });

  it("keeps stores, sorted by what to use up first, and takes out and back", async () => {
    expect((await api("POST", P(), item())).status).toBe(201);
    await api("POST", P(), item({ name: "Kirschen", kind: "frozen", amount: 4, unit: "Beutel", location: "Truhe", bestBefore: "2026-11-10" }));
    await api("POST", P(), item({ name: "Alte Marmelade", kind: "jam", amount: 1, bestBefore: "2026-10-01" }));
    let d = (await api("GET", P())).data;
    expect(d.items.map((i: any) => [i.name, i.status])).toEqual([["Alte Marmelade", "expired"], ["Kirschen", "soon"], ["Bohnen sauer", "ok"]]);
    expect(d).toMatchObject({ stocked: 3, soon: 1, expired: 1, locations: ["Keller", "Truhe"] });

    as = "pia";
    const id = d.items.find((i: any) => i.name === "Bohnen sauer").id;
    d = (await api("POST", `${P()}/${id}/take`, { amount: 2 })).data;
    let bohnen = d.items.find((i: any) => i.id === id);
    expect(bohnen).toMatchObject({ amount: 4, initialAmount: 6, uses: [{ date: "2026-10-26", amount: 2 }] });
    expect((await api("POST", `${P()}/${id}/take`, { amount: 5 })).data.error).toBe("Es sind nur noch 4 Glas da.");
    d = (await api("DELETE", `${P()}/${id}/uses/${bohnen.uses[0].id}`)).data;
    bohnen = d.items.find((i: any) => i.id === id);
    expect(bohnen).toMatchObject({ amount: 6, uses: [] });
    // All taken: empty, at the end.
    d = (await api("POST", `${P()}/${id}/take`, { amount: 6 })).data;
    expect(d.items.at(-1)).toMatchObject({ name: "Bohnen sauer", status: "empty" });
    expect(d.stocked).toBe(2);

    // Input checks.
    expect((await api("POST", P(), item({ kind: "gebacken" }))).status).toBe(400);
    expect((await api("POST", P(), item({ amount: 0 }))).status).toBe(400);
    expect((await api("POST", P(), item({ bestBefore: "2026-01-01" }))).data.error).toMatch(/vor dem Herstellungstag/);
  });

  it("makes a store from a harvest of the farm", async () => {
    const [bed] = await q<{ id: number }>("INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 200, 100) RETURNING id", [farmId]);
    const [h] = await q<{ id: number }>(
      "INSERT INTO harvest_logs (farm_id, bed_id, season, crop_key, label, cells, harvested_on, amount_kg, use) VALUES ($1, $2, 2026, 'tomate', 'Tomate', 4, '2026-09-01', 5, 'kitchen') RETURNING id",
      [farmId, bed!.id],
    );
    const d = (await api("GET", P())).data;
    expect(d.harvests).toEqual([{ id: h!.id, label: "Tomate", cropKey: "tomate", harvestedOn: "2026-09-01", amountKg: 5 }]);
    const made = (await api("POST", P(), item({ name: "Tomatensoße", kind: "canned", harvestId: h!.id }))).data;
    expect(made.items[0]).toMatchObject({ name: "Tomatensoße", harvestId: h!.id, cropKey: "tomate" });
    const [foreign] = await q<{ id: number }>("INSERT INTO harvest_logs (farm_id, season, label, cells, harvested_on, amount_kg, use) VALUES ($1, 2026, 'X', 1, '2026-09-01', 1, 'kitchen') RETURNING id", [otherFarm]);
    expect((await api("POST", P(), item({ harvestId: foreign!.id }))).data.error).toBe("Diese Ernte gibt es auf der Farm nicht.");
  });

  it("keeps the pantry to the farm, its roles and the grant", async () => {
    const id = (await api("POST", P(), item())).data.items[0].id;
    as = "gast";
    expect((await api("GET", P())).status).toBe(200);
    expect((await api("POST", `${P()}/${id}/take`, { amount: 1 })).status).toBe(403);
    as = "olli";
    expect((await api("GET", P())).status).toBe(403);
    as = "bert";
    expect((await api("GET", P())).status).toBe(404);
    expect((await api("POST", `/farms/${otherFarm}/pantry/${id}/take`, { amount: 1 })).status).toBe(404);
    expect((await api("DELETE", `/farms/${otherFarm}/pantry/${id}`)).status).toBe(404);
  });

  it("pushes on Monday what runs out within 14 days, once", async () => {
    await api("POST", P(), item({ name: "Kirschen", kind: "frozen", bestBefore: "2026-11-05" }));
    await api("POST", P(), item({ name: "Honig", kind: "honey", bestBefore: "2028-01-01" }));
    const { sendPantryDigests } = await import("./pantry");
    expect(await sendPantryDigests("07:30", "2026-10-25")).toBe(0); // Sunday
    expect(await sendPantryDigests("07:29", "2026-10-26")).toBe(0);
    expect(await sendPantryDigests("07:30", "2026-10-26")).toBe(1);
    expect(await sendPantryDigests("08:00", "2026-10-26")).toBe(0);
    expect(sendPushToUser.mock.calls.map((c) => c[0]).sort()).toEqual(["anna", "pia"]);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({ topic: "pantry", title: "Vorrat: bald aufbrauchen", body: "Kirschen (bis 05.11.)", url: "/vorrat" });
  });
});
