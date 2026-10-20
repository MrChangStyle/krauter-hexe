/**
 * Premium against a REAL Postgres, through the HTTP routes: the account's own
 * status, the owner granting it by e-mail without end or until a day, taking
 * it back, and account deletion.
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

describe.skipIf(!enabled)("Premium (real database)", () => {
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
    app.use((await import("../routes/premium")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE users, premium RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, username, approved, is_owner) VALUES ('owner', 'o@x.de', 'chef', true, true), ('anna', 'anna@x.de', 'anna', true, false), ('bert', 'bert@x.de', null, true, false)`);
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

  it("is granted and taken back by the owner only", async () => {
    expect((await api("GET", "/premium")).data).toEqual({ active: false, until: null, source: null });
    expect((await api("PUT", "/admin/premium", { email: "anna@x.de", active: true })).status).toBe(403);
    expect((await api("GET", "/admin/premium")).status).toBe(403);
    as = "owner";
    expect((await api("GET", "/premium")).data).toEqual({ active: true, until: null, source: "owner" });
    let r = await api("PUT", "/admin/premium", { email: " ANNA@x.de ", active: true });
    expect(r.data).toEqual([{ email: "anna@x.de", username: "anna", source: "manual", until: null, active: true, grantedAt: expect.any(String) }]);
    r = await api("PUT", "/admin/premium", { email: "bert@x.de", active: true, until: "2099-12-31" });
    expect(r.data[1]).toMatchObject({ email: "bert@x.de", until: "2099-12-31T22:59:59.000Z", active: true });
    expect((await api("PUT", "/admin/premium", { email: "bert@x.de", active: true, until: "2020-01-01" })).status).toBe(400);
    expect((await api("PUT", "/admin/premium", { email: "bert@x.de", active: true, until: "31.12.2099" })).status).toBe(400);
    expect((await api("PUT", "/admin/premium", { email: "nobody@x.de", active: true })).status).toBe(404);
    expect((await api("PUT", "/admin/premium", { email: "o@x.de", active: true })).status).toBe(409);
    as = "anna";
    expect((await api("GET", "/premium")).data).toEqual({ active: true, until: null, source: "manual" });
    as = "bert";
    expect((await api("GET", "/premium")).data).toEqual({ active: true, until: "2099-12-31T22:59:59.000Z", source: "manual" });
    // Run out: listed, but no longer active.
    await q("UPDATE premium SET active_until = now() - interval '1 minute' WHERE user_id = 'bert'");
    expect((await api("GET", "/premium")).data.active).toBe(false);
    as = "owner";
    expect((await api("GET", "/admin/premium")).data[1]).toMatchObject({ email: "bert@x.de", active: false });
    // Taken back.
    r = await api("PUT", "/admin/premium", { email: "anna@x.de", active: false });
    expect(r.data.map((e: any) => e.email)).toEqual(["bert@x.de"]);
  });

  it("goes with the account", async () => {
    await q("INSERT INTO premium (user_id) VALUES ('anna')");
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");
    expect(await q("SELECT * FROM premium")).toEqual([]);
  });
});
