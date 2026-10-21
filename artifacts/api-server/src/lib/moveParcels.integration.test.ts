/**
 * Umzug über das Konto against a REAL Postgres, through the HTTP routes:
 * upload, status, fetching in order, deleting, limits and privacy.
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

describe.skipIf(!enabled)("Umzug über das Konto (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/move")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE move_parcels, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true)`);
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
  const photo = (id: string) => ({ images: [{ id, dataUrl: "data:image/png;base64,AAAA" }] });

  it("keeps the parcels in order until the new address took them", async () => {
    expect((await api("GET", "/move/status")).data).toEqual({ parcels: 0, entries: 0 });
    expect((await api("POST", "/move/parcels", { batch: { queue: [], local: {} }, entries: 0 })).status).toBe(201);
    await api("POST", "/move/parcels", { batch: photo("a"), entries: 1 });
    const r = await api("POST", "/move/parcels", { batch: photo("b"), entries: 1 });
    expect(r.data).toEqual({ parcels: 3, entries: 2 });

    let after = 0;
    const got: unknown[] = [];
    for (;;) {
      const next = await api("GET", `/move/parcels/next?after=${after}`);
      if (next.status === 204) break;
      got.push(next.data.batch);
      after = next.data.id;
    }
    expect(got).toEqual([{ queue: [], local: {} }, photo("a"), photo("b")]);

    expect((await api("DELETE", "/move/parcels")).status).toBe(204);
    expect((await api("GET", "/move/status")).data).toEqual({ parcels: 0, entries: 0 });
  });

  it("keeps accounts apart and refuses nonsense", async () => {
    await api("POST", "/move/parcels", { batch: photo("a"), entries: 1 });
    as = "bert";
    expect((await api("GET", "/move/status")).data).toEqual({ parcels: 0, entries: 0 });
    expect((await api("GET", "/move/parcels/next?after=0")).status).toBe(204);
    await api("DELETE", "/move/parcels");
    expect(await q("SELECT user_id FROM move_parcels")).toEqual([{ user_id: "anna" }]);
    expect((await api("POST", "/move/parcels", { batch: [1, 2], entries: 1 })).status).toBe(400);
    expect((await api("POST", "/move/parcels", { batch: photo("x"), entries: -1 })).status).toBe(400);
  });

  it("removes parcels nobody picked up after two weeks", async () => {
    await api("POST", "/move/parcels", { batch: photo("a"), entries: 1 });
    await q("UPDATE move_parcels SET created_at = now() - interval '15 days'");
    expect((await api("GET", "/move/status")).data).toEqual({ parcels: 0, entries: 0 });
  });
});
