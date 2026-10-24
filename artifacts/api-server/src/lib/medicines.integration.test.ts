/**
 * Arzneimittel-Vorrat against a REAL Postgres, through the HTTP routes: the
 * stock, its use in health records (dose off the stock, name, batch and the
 * withdrawal period for the species filled in, changes and deletes booked
 * back), expired and archived medicines, roles, and the expiry push.
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
let fixedDay = "2026-10-19";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Arzneimittel-Vorrat (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  const animal = { huhn: 0, ziege: 0 };

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
    app.use((await import("../routes/farm-health")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    sendPushToUser.mockClear();
    fixedDay = "2026-10-19";
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'gast', 'guest'), ($2, 'bert', 'admin')`, [farm.anna, farm.bert]);
    const [h, z] = await q<{ id: number }>(
      `INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Berta', 'poultry', 'H1'), ($1, 'Lotte', 'goat', 'Z1') RETURNING id`,
      [farm.anna],
    );
    animal.huhn = h!.id;
    animal.ziege = z!.id;
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
  const wurmkur = { name: "Flubenol", activeIngredient: "Flubendazol", unit: "g", amount: 60, batch: "CH-4711", expiresOn: "2027-03-31", withdrawalMeatDays: 7, withdrawalMilkDays: 4, withdrawalEggsDays: 0 };

  it("takes the dose off the stock and fills in name, batch and the withdrawal period for the species", async () => {
    const med = await api("POST", `/farms/${farm.anna}/medicines`, wurmkur);
    expect(med.status).toBe(201);
    expect(med.data).toMatchObject({ name: "Flubenol", amount: 60, status: "ok", daysLeft: 163, uses: 0, archived: false });

    const hen = await api("POST", `/farms/${farm.anna}/animals/${animal.huhn}/medical`, { date: "2026-10-19", diagnosis: "Entwurmung", medicineId: med.data.id, dose: 10 });
    expect(hen.data).toMatchObject({ medication: "Flubenol", batch: "CH-4711", dose: 10, doseUnit: "g", withdrawalPeriodDays: 7, medicineId: med.data.id });
    const goat = await api("POST", `/farms/${farm.anna}/animals/${animal.ziege}/medical`, { date: "2026-10-19", diagnosis: "Entwurmung", medicineId: med.data.id, dose: 15, withdrawalPeriodDays: 14 });
    // What the user entered wins over the package insert.
    expect(goat.data.withdrawalPeriodDays).toBe(14);
    expect((await api("GET", `/farms/${farm.anna}/medicines`)).data[0]).toMatchObject({ amount: 35, uses: 2 });

    // Changing the dose books the difference; deleting the record gives it back.
    await api("PATCH", `/farms/${farm.anna}/medical/${hen.data.id}`, { date: "2026-10-19", diagnosis: "Entwurmung", medicineId: med.data.id, dose: 12.5 });
    expect((await api("GET", `/farms/${farm.anna}/medicines`)).data[0].amount).toBe(32.5);
    await api("DELETE", `/farms/${farm.anna}/medical/${goat.data.id}`);
    expect((await api("GET", `/farms/${farm.anna}/medicines`)).data[0].amount).toBe(47.5);
    // A medicine in the records cannot be deleted – it is archived instead.
    expect((await api("DELETE", `/farms/${farm.anna}/medicines/${med.data.id}`)).status).toBe(409);
    const archived = await api("PUT", `/farms/${farm.anna}/medicines/${med.data.id}`, { ...wurmkur, amount: 0, archived: true });
    expect(archived.data).toMatchObject({ status: "archived", archived: true });
    expect((await api("POST", `/farms/${farm.anna}/animals/${animal.ziege}/medical`, { date: "2026-10-19", diagnosis: "x", medicineId: med.data.id, dose: 1 })).status).toBe(400);
    // The old record still points at it and can be edited.
    expect((await api("PATCH", `/farms/${farm.anna}/medical/${hen.data.id}`, { date: "2026-10-19", diagnosis: "Entwurmung", medicineId: med.data.id, dose: 12.5 })).status).toBe(200);
  });

  it("refuses expired medicines, a missing dose and other farms' medicines", async () => {
    const old = (await api("POST", `/farms/${farm.anna}/medicines`, { ...wurmkur, expiresOn: "2026-09-30" })).data;
    expect(old.status).toBe("expired");
    expect((await api("POST", `/farms/${farm.anna}/animals/${animal.huhn}/medical`, { date: "2026-10-19", diagnosis: "x", medicineId: old.id, dose: 1 })).data.error).toBe("Flubenol war am 19.10.2026 schon abgelaufen.");
    // Given before it expired: fine.
    expect((await api("POST", `/farms/${farm.anna}/animals/${animal.huhn}/medical`, { date: "2026-09-01", diagnosis: "x", medicineId: old.id, dose: 1 })).status).toBe(201);
    const fresh = (await api("POST", `/farms/${farm.anna}/medicines`, wurmkur)).data;
    expect((await api("POST", `/farms/${farm.anna}/animals/${animal.huhn}/medical`, { date: "2026-10-19", diagnosis: "x", medicineId: fresh.id })).data.error).toBe("Bitte gib die Menge in g an.");
    as = "bert";
    const his = (await api("POST", `/farms/${farm.bert}/medicines`, wurmkur)).data;
    as = "anna";
    expect((await api("POST", `/farms/${farm.anna}/animals/${animal.huhn}/medical`, { date: "2026-10-19", diagnosis: "x", medicineId: his.id, dose: 1 })).status).toBe(400);
    expect((await api("PUT", `/farms/${farm.anna}/medicines/${his.id}`, wurmkur)).status).toBe(404);
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/medicines`)).data).toHaveLength(2);
    expect((await api("POST", `/farms/${farm.anna}/medicines`, wurmkur)).status).toBe(403);
    as = "anna";
    expect((await api("POST", `/farms/${farm.anna}/medicines`, { ...wurmkur, withdrawalMeatDays: -1 })).status).toBe(400);
    expect((await api("DELETE", `/farms/${farm.anna}/medicines/${fresh.id}`)).status).toBe(204);
  });

  it("pushes 30 days before and on the day a medicine expires, once per day", async () => {
    await api("POST", `/farms/${farm.anna}/medicines`, { ...wurmkur, expiresOn: "2026-11-18" });
    const { sendMedicineDigests } = await import("./medicines");
    expect(await sendMedicineDigests("07:00", "2026-10-19")).toBe(0);
    expect(await sendMedicineDigests("07:30", "2026-10-19")).toBe(1);
    expect(await sendMedicineDigests("07:45", "2026-10-19")).toBe(0);
    expect(sendPushToUser.mock.calls).toEqual([
      ["anna", { topic: "medicines", title: "Arzneimittel-Vorrat", body: "In 30 Tagen läuft ab: Flubenol.", tag: `medicines-${farm.anna}-2026-10-19`, url: "/farm/arzneimittel" }],
    ]);
    expect(await sendMedicineDigests("07:30", "2026-10-20")).toBe(0);
    expect(await sendMedicineDigests("07:30", "2026-11-18")).toBe(1);
    expect((sendPushToUser.mock.calls.at(-1)![1] as any).body).toMatch(/^Heute läuft ab: Flubenol/);
  });
});
