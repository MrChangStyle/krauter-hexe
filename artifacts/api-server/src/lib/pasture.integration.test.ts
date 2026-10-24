/**
 * Weide against a REAL Postgres, through the HTTP routes: pastures, driving a
 * herd on, moving it and off, the state and the year's use, roles, the
 * grant, farm isolation and the morning push.
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
let fixedDay = "2026-06-20";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Weide (real database)", () => {
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
    app.use((await import("../routes/pasture")).default);
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
      `INSERT INTO farm_memberships (farm_id, user_id, role, modules) VALUES ($1, 'anna', 'admin', null), ($1, 'pia', 'caretaker', null), ($1, 'gast', 'guest', null), ($1, 'olli', 'caretaker', '["feed"]'), ($2, 'bert', 'admin', null)`,
      [farmId, otherFarm],
    );
    const [h] = await q<{ id: number }>("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Schafe', 'sheep') RETURNING id", [farmId]);
    herdId = h!.id;
    for (let k = 0; k < 3; k++) await q("INSERT INTO farm_animals (farm_id, herd_id, name, species, registration_number) VALUES ($1, $2, $3, 'sheep', $3)", [farmId, herdId, `S${k}`]);
    as = "anna";
    fixedDay = "2026-06-20";
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
  const W = () => `/farms/${farmId}/pastures`;
  const named = (d: any, name: string) => d.pastures.find((p: any) => p.name === name);

  it("drives a herd on, moves it and off, and shows state and use", async () => {
    expect((await api("POST", W(), { name: "Obere Weide", areaHa: 1.5, restDays: 30, maxGrazeDays: 10 })).status).toBe(201);
    let d = (await api("POST", W(), { name: "Bachwiese", kind: "mowing", areaHa: 0.8 })).data;
    expect(d.herds).toEqual([{ id: herdId, name: "Schafe", species: "sheep", animals: 3 }]);
    const oben = named(d, "Obere Weide").id;
    const bach = named(d, "Bachwiese").id;
    expect(named(d, "Bachwiese")).toMatchObject({ restDays: 35, maxGrazeDays: 10, status: "ready" });

    as = "pia";
    d = (await api("POST", `${W()}/${oben}/grazings`, { herdId, animals: 3, startOn: "2026-06-01" })).data;
    const first = named(d, "Obere Weide").current;
    expect(first).toMatchObject({ label: "Schafe", animals: 3, startOn: "2026-06-01", endOn: null });
    expect(named(d, "Obere Weide")).toMatchObject({ status: "grazed", grazingDays: 20, animalDays: 60, animalDaysPerHa: 40 });
    expect(named(d, "Obere Weide").hints.map((h: any) => `${h.kind}${h.urgent ? "!" : ""}`)).toEqual(["too-long!"]);

    // Umtreiben: the old grazing ends the day before.
    d = (await api("POST", `${W()}/${bach}/grazings`, { herdId, animals: 3, startOn: "2026-06-15", fromGrazingId: first.id })).data;
    expect(named(d, "Obere Weide")).toMatchObject({ status: "resting", readyOn: "2026-07-14", current: null });
    expect(named(d, "Obere Weide").grazings[0]).toMatchObject({ endOn: "2026-06-14" });
    expect(named(d, "Bachwiese")).toMatchObject({ status: "grazed" });
    expect((await api("POST", `${W()}/${bach}/grazings`, { herdId, animals: 3, startOn: "2026-06-16", fromGrazingId: first.id })).data.error).toBe("Diese Herde ist dort schon abgetrieben.");

    // Abtreiben and the checks.
    const second = named(d, "Bachwiese").current.id;
    expect((await api("PUT", `/farms/${farmId}/grazings/${second}/end`, { endOn: "2026-06-10" })).data.error).toBe("Das Datum liegt vor dem Auftrieb.");
    d = (await api("PUT", `/farms/${farmId}/grazings/${second}/end`, { endOn: "2026-06-19" })).data;
    expect(named(d, "Bachwiese")).toMatchObject({ status: "resting", readyOn: "2026-07-24" });
    expect((await api("POST", `${W()}/${oben}/grazings`, { animals: 3, startOn: "2026-06-20" })).data.error).toBe("Bitte wähle eine Gruppe oder gib einen Namen an.");
    expect((await api("POST", `${W()}/${oben}/grazings`, { label: "Pferde Nachbar", animals: 0, startOn: "2026-06-20" })).status).toBe(400);
    expect((await api("POST", W(), { name: "X", restDays: 0 })).status).toBe(400);

    // Too early: a hint.
    d = (await api("POST", `${W()}/${oben}/grazings`, { label: "Pferde Nachbar", animals: 2, startOn: "2026-06-20" })).data;
    expect(named(d, "Obere Weide").hints.map((h: any) => h.kind)).toEqual(["early"]);

    // Archived: no new grazing.
    as = "anna";
    await api("PUT", `${W()}/${bach}`, { name: "Bachwiese", kind: "mowing", archived: true });
    expect((await api("POST", `${W()}/${bach}/grazings`, { herdId, animals: 3, startOn: "2026-06-20" })).data.error).toBe("Diese Weide wird nicht mehr genutzt.");
  });

  it("keeps the pastures to the farm, its roles and the grant", async () => {
    const id = (await api("POST", W(), { name: "Weide" })).data.pastures[0].id;
    const [foreignHerd] = await q<{ id: number }>("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Fremd', 'sheep') RETURNING id", [otherFarm]);
    expect((await api("POST", `${W()}/${id}/grazings`, { herdId: foreignHerd!.id, animals: 3, startOn: "2026-06-01" })).data.error).toBe("Diese Gruppe gibt es auf der Farm nicht.");
    as = "gast";
    expect((await api("GET", W())).status).toBe(200);
    expect((await api("POST", `${W()}/${id}/grazings`, { herdId, animals: 3, startOn: "2026-06-01" })).status).toBe(403);
    as = "pia";
    expect((await api("DELETE", `${W()}/${id}`)).status).toBe(403);
    as = "olli";
    expect((await api("GET", W())).status).toBe(403);
    as = "bert";
    expect((await api("GET", W())).status).toBe(404);
    expect((await api("PUT", `/farms/${otherFarm}/pastures/${id}`, { name: "Meins" })).status).toBe(404);
  });

  it("pushes once on the day a herd should move", async () => {
    const id = (await api("POST", W(), { name: "Obere Weide", maxGrazeDays: 10 })).data.pastures[0].id;
    await api("POST", `${W()}/${id}/grazings`, { herdId, animals: 3, startOn: "2026-06-10" });
    const { sendPastureDigests } = await import("./pasture");
    expect(await sendPastureDigests("07:30", "2026-06-19")).toBe(0);
    expect(await sendPastureDigests("07:30", "2026-06-20")).toBe(1);
    expect(await sendPastureDigests("09:00", "2026-06-20")).toBe(0);
    expect(sendPushToUser.mock.calls.map((c) => c[0]).sort()).toEqual(["anna", "pia"]);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({ topic: "pasture", body: "Schafe seit 10 Tagen auf Obere Weide – umtreiben?", url: "/farm/weide" });
  });
});
