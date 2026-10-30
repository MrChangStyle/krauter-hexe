/**
 * Düngung (docs/bio.md, B7) against a REAL Postgres, through the HTTP routes:
 * logging, listing and deleting, checks, roles, isolation, and the entries
 * going with their bed.
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

describe.skipIf(!enabled)("Beet-Architekt – Düngung (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let bed = 0;
  const today = new Date().toISOString().slice(0, 10);

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/garden");
    const app = express();
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use(router);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
    );
    const [g] = await q<{ id: number }>(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Beet', 'bed', 300, 120) RETURNING id`,
      [farm.anna],
    );
    bed = g!.id;
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

  const F = () => `/farms/${farm.anna}/fertilizings`;
  const add = (body: object, b = bed, f = farm.anna) => api("POST", `/farms/${f}/beds/${b}/fertilizings`, body);

  it("logs, lists newest first and deletes", async () => {
    const first = await add({ date: "2026-03-10", kind: "manure_own", label: "Ziegenmist", amountKg: 30.04 });
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ bedId: bed, bedName: "Beet", kind: "manure_own", label: "Ziegenmist", amountKg: 30 });
    expect((await add({ date: today, kind: "green_manure", label: "Phacelia" })).data).toMatchObject({ amountKg: null, label: "Phacelia" });
    const list = await api("GET", F());
    expect(list.data.map((f: { kind: string }) => f.kind)).toEqual(["green_manure", "manure_own"]);
    expect((await api("DELETE", `${F()}/${first.data.id}`)).status).toBe(204);
    expect((await api("GET", F())).data).toHaveLength(1);
    expect((await api("DELETE", `${F()}/${first.data.id}`)).status).toBe(404);
  });

  it("checks kind, date and amount", async () => {
    const error = async (body: object) => (await add({ date: "2026-03-10", kind: "compost", ...body })).status;
    expect(await error({ kind: "kunstduenger" })).toBe(400);
    expect(await error({ date: "2999-01-01" })).toBe(400);
    expect(await error({ date: "10.03.2026" })).toBe(400);
    expect(await error({ amountKg: 0 })).toBe(400);
    expect(await error({ amountKg: 200_000 })).toBe(400);
  });

  it("keeps farms apart, lets guests read only, and goes with the bed", async () => {
    await add({ date: "2026-03-10", kind: "mineral" });
    as = "gast";
    expect((await api("GET", F())).data).toHaveLength(1);
    expect((await add({ date: "2026-03-10", kind: "compost" })).status).toBe(403);
    as = "bert";
    expect((await api("GET", F())).status).toBe(404);
    // Anna's bed is not Bert's, not even through his own farm.
    expect((await add({ date: "2026-03-10", kind: "compost" }, bed, farm.bert)).status).toBe(404);
    as = "anna";
    await q("DELETE FROM garden_beds WHERE id = $1", [bed]);
    expect((await api("GET", F())).data).toEqual([]);
  });
});
