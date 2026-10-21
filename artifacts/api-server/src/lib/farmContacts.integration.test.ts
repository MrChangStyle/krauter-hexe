/**
 * Farm & Team – Wichtige Kontakte against a REAL Postgres, through the HTTP
 * routes: admins keep them, every member reads them, other farms see nothing,
 * and they go with the farm.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Wichtige Kontakte (real database)", () => {
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
    app.use((await import("../routes/farm-contacts")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('carl', 'c@x.de', true), ('gina', 'g@x.de', true), ('bert', 'b@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Sonnenblick') RETURNING id");
    const [g] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Bert') RETURNING id");
    farmId = f!.id;
    otherFarm = g!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role, access_until) VALUES ($1, 'anna', 'admin', null), ($1, 'carl', 'caretaker', null), ($1, 'gina', 'guest', '2099-01-01'), ($2, 'bert', 'admin', null)`,
      [farmId, otherFarm],
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
  const C = (f = farmId) => `/farms/${f}/contacts`;

  it("lets admins keep the contacts, grouped by kind", async () => {
    let r = await api("POST", C(), { kind: "team", name: "Lena Huber", role: "Melkerin, Mo–Fr", phone: "0171 2345678" });
    expect(r.status).toBe(201);
    r = await api("POST", C(), { kind: "vet", name: "Dr. Maier", role: "Großtiere", phone: "+49 8031 12345", email: "praxis@maier.de", note: "Notdienst über die Praxisnummer" });
    r = await api("POST", C(), { kind: "self", name: "Anna", phone: "0170 1111111" });
    expect(r.data.map((c: { kind: string }) => c.kind)).toEqual(["self", "team", "vet"]);
    const vet = r.data.find((c: { kind: string }) => c.kind === "vet");
    expect(vet).toMatchObject({ name: "Dr. Maier", phone: "+49 8031 12345", email: "praxis@maier.de" });

    r = await api("PUT", `${C()}/${vet.id}`, { kind: "vet", name: "Dr. Maier", phone: "08031 99999" });
    expect(r.data.find((c: { id: number }) => c.id === vet.id)).toMatchObject({ phone: "08031 99999", email: null, role: null });
    r = await api("DELETE", `${C()}/${vet.id}`);
    expect(r.data).toHaveLength(2);
  });

  it("checks the input", async () => {
    expect((await api("POST", C(), { kind: "boss", name: "X" })).status).toBe(400);
    expect((await api("POST", C(), { kind: "vet", name: " " })).status).toBe(400);
    expect((await api("POST", C(), { kind: "vet", name: "X", phone: "ruf an" })).data.error).toMatch(/Telefonnummer/);
    expect((await api("POST", C(), { kind: "vet", name: "X", email: "kein-at" })).data.error).toMatch(/E-Mail/);
  });

  it("shows them to every member, lets only admins change them, keeps other farms out", async () => {
    await api("POST", C(), { kind: "vet", name: "Dr. Maier", phone: "08031 12345" });
    for (const who of ["carl", "gina"]) {
      as = who;
      expect((await api("GET", C())).data).toHaveLength(1);
      expect((await api("POST", C(), { kind: "other", name: "X" })).status).toBe(403);
    }
    as = "bert";
    expect((await api("GET", C())).status).toBe(404);
    const [own] = (await api("GET", C(otherFarm))).data;
    expect(own).toBeUndefined();
    // A contact id of another farm is not found through Bert's farm.
    const [id] = await q<{ id: number }>("SELECT id FROM farm_contacts");
    expect((await api("DELETE", `${C(otherFarm)}/${id!.id}`)).status).toBe(404);
  });

  it("goes with the farm", async () => {
    await api("POST", C(), { kind: "vet", name: "Dr. Maier" });
    await q("DELETE FROM farms WHERE id = $1", [farmId]);
    expect(await q("SELECT id FROM farm_contacts")).toEqual([]);
  });
});
