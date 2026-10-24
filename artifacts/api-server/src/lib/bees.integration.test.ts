/**
 * Bienen against a REAL Postgres, through the HTTP routes: colonies and their
 * hive card, the medicine stock for treatments, honey in Ertrag & Bilanz,
 * roles, Modul-Freigaben, farm isolation and the morning push.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Ertrag & Bilanz reaches the Futterplaner, which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-07-25";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Bienen (real database)", () => {
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
    app.use((await import("../routes/bees")).default);
    app.use((await import("../routes/farm-yields")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('pia', 'p@x.de', true), ('gast', 'g@x.de', true), ('bert', 'b@x.de', true), ('olli', 'o@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof') RETURNING id");
    const [g] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Bert') RETURNING id");
    farmId = f!.id;
    otherFarm = g!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role, modules) VALUES ($1, 'anna', 'admin', null), ($1, 'pia', 'caretaker', null), ($1, 'gast', 'guest', null), ($1, 'olli', 'caretaker', '["yields"]'), ($2, 'bert', 'admin', null)`,
      [farmId, otherFarm],
    );
    as = "anna";
    fixedDay = "2026-07-25";
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
  const B = () => `/farms/${farmId}/bees`;

  it("keeps colonies with their hive card and hints", async () => {
    const created = await api("POST", B(), { name: "Linde", apiary: "Obstwiese", hiveType: "Zander", queenYear: 2025, queenMarked: true });
    expect(created.status).toBe(201);
    const id = created.data.colony.id;
    expect(created.data.colony).toMatchObject({ name: "Linde", apiary: "Obstwiese", status: "active", queenMarked: true, lastInspectionOn: null });
    // July without treatment since June: summer treatment.
    expect(created.data.colony.hints.map((h: any) => h.kind)).toEqual(["summer-treatment"]);

    as = "pia";
    expect((await api("POST", `${B()}/${id}/inspections`, { date: "2026-07-20", beeFrames: 14, broodFrames: 6, queenSeen: true, eggsSeen: true, queenCells: 0, temper: 1, mitesPerDay: 12 })).status).toBe(201);
    expect((await api("POST", `${B()}/${id}/feedings`, { date: "2026-07-21", kind: "sirup", amountKg: 5 })).status).toBe(201);
    const detail = (await api("GET", `${B()}/${id}`)).data;
    expect(detail.inspections[0]).toMatchObject({ beeFrames: 14, queenSeen: true, mitesPerDay: 12, temper: 1 });
    expect(detail.feedings[0]).toMatchObject({ kind: "sirup", amountKg: 5 });
    expect(detail.colony).toMatchObject({ lastInspectionOn: "2026-07-20", beeFrames: 14, lastMites: { date: "2026-07-20", mitesPerDay: 12 }, feedKgThisYear: 5 });
    expect(detail.colony.hints.map((h: any) => `${h.kind}${h.urgent ? "!" : ""}`)).toEqual(["varroa!", "summer-treatment"]);

    // Input checks.
    expect((await api("POST", `${B()}/${id}/inspections`, { date: "2026-07-20", temper: 5 })).status).toBe(400);
    expect((await api("POST", `${B()}/${id}/feedings`, { date: "2026-07-20", kind: "brot", amountKg: 1 })).status).toBe(400);
    expect((await api("POST", `${B()}/${id}/feedings`, { date: "2099-07-20", kind: "sirup", amountKg: 1 })).status).toBe(400);
    expect((await api("POST", B(), { name: "X", queenYear: 2099 })).status).toBe(400);

    // Dissolved: no hints, date set.
    as = "anna";
    const ended = await api("PUT", `${B()}/${id}`, { name: "Linde", status: "lost" });
    expect(ended.data.colony).toMatchObject({ status: "lost", endedOn: "2026-07-25", hints: [] });
    expect((await api("GET", B())).data).toMatchObject({ active: 0, apiaries: [] });
  });

  it("takes a treatment off the medicine stock and gives it back when deleted", async () => {
    const id = (await api("POST", B(), { name: "Akazie" })).data.colony.id;
    const [m] = await q<{ id: number }>("INSERT INTO medicines (farm_id, name, unit, amount, batch) VALUES ($1, 'Ameisensäure 60 %', 'ml', 500, 'CH-7') RETURNING id", [farmId]);
    const t = await api("POST", `${B()}/${id}/treatments`, { date: "2026-07-24", method: "ameisensaeure", medicineId: m!.id, dose: 200 });
    expect(t.status).toBe(201);
    expect(t.data.treatments[0]).toMatchObject({ method: "ameisensaeure", product: "Ameisensäure 60 %", dose: 200, unit: "ml", batch: "CH-7" });
    expect((await q<{ amount: number }>("SELECT amount FROM medicines WHERE id = $1", [m!.id]))[0]!.amount).toBe(300);
    expect(t.data.colony.hints).toEqual([]);
    expect((await api("POST", `${B()}/${id}/treatments`, { date: "2026-07-24", method: "oxalsaeure", medicineId: m!.id })).status).toBe(400);
    // Without the stock: just written down.
    expect((await api("POST", `${B()}/${id}/treatments`, { date: "2026-06-24", method: "drohnenbrut" })).status).toBe(201);

    const del = await api("DELETE", `${B()}/${id}/treatments/${t.data.treatments[0].id}`);
    expect(del.data.treatments.map((x: any) => x.method)).toEqual(["drohnenbrut"]);
    expect((await q<{ amount: number }>("SELECT amount FROM medicines WHERE id = $1", [m!.id]))[0]!.amount).toBe(500);
    expect((await api("DELETE", `${B()}/${id}/treatments/999`)).status).toBe(404);
    expect((await api("DELETE", `${B()}/${id}/brot/1`)).status).toBe(404);
  });

  it("puts honey into Ertrag & Bilanz, where it stays when the colony goes", async () => {
    const id = (await api("POST", B(), { name: "Raps" })).data.colony.id;
    const h = await api("POST", `${B()}/${id}/honey`, { date: "2026-06-10", amountKg: 12.5, note: "Frühtracht" });
    expect(h.data.honey).toEqual([{ id: expect.any(Number), colonyId: id, date: "2026-06-10", amountKg: 12.5, note: "Frühtracht" }]);
    expect(h.data.colony.honeyKgThisYear).toBe(12.5);
    expect((await api("GET", B())).data.honeyKgThisYear).toBe(12.5);
    const overview = (await api("GET", `/farms/${farmId}/yield-overview/2026`)).data;
    expect(overview.summary.animals.lines).toEqual([{ product: "honey", unit: "kg", amount: 12.5, price: 13, value: 162.5 }]);
    expect((await api("DELETE", `${B()}/${id}`)).status).toBe(204);
    expect((await api("GET", `/farms/${farmId}/yield-overview/2026`)).data.entries.map((e: any) => [e.product, e.amount])).toEqual([["honey", 12.5]]);
  });

  it("keeps the bees to the farm, its roles and the grant", async () => {
    const id = (await api("POST", B(), { name: "Linde" })).data.colony.id;
    as = "gast";
    expect((await api("GET", `${B()}/${id}`)).status).toBe(200);
    expect((await api("POST", `${B()}/${id}/feedings`, { date: "2026-07-20", kind: "sirup", amountKg: 1 })).status).toBe(403);
    as = "pia";
    expect((await api("DELETE", `${B()}/${id}`)).status).toBe(403);
    as = "olli"; // caretaker without the Bienen grant
    expect((await api("GET", B())).status).toBe(403);
    as = "bert";
    expect((await api("GET", B())).status).toBe(404);
    expect((await api("GET", `/farms/${otherFarm}/bees/${id}`)).status).toBe(404);
    expect((await api("POST", `/farms/${otherFarm}/bees/${id}/honey`, { date: "2026-07-20", amountKg: 1 })).status).toBe(404);
  });

  it("pushes once on the day a reminder comes due, to members with the grant", async () => {
    await api("POST", B(), { name: "Linde" });
    const { sendBeeDigests } = await import("./bees");
    expect(await sendBeeDigests("07:00", "2026-07-25")).toBe(0);
    expect(await sendBeeDigests("07:30", "2026-07-25")).toBe(1);
    expect(await sendBeeDigests("07:31", "2026-07-25")).toBe(0);
    expect(sendPushToUser.mock.calls.map((c) => c[0]).sort()).toEqual(["anna", "pia"]);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({ topic: "bees", title: "Bienen: heute dran", body: "Linde: Sommerbehandlung gegen Varroa einplanen", url: "/farm/bienen" });
    expect(await sendBeeDigests("07:30", "2026-07-26")).toBe(0);
  });
});
