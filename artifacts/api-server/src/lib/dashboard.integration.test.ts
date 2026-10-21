/**
 * Hof-Dashboard against a REAL Postgres, through the HTTP routes: the default
 * (no choice yet), saving a choice in its order, unknown and doubled widgets,
 * back to the default, privacy between accounts and account deletion.
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

describe.skipIf(!enabled)("Hof-Dashboard (real database)", () => {
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
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: false };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/dashboard")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE users, dashboard_layouts RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'anna@x.de', true), ('bert', 'bert@x.de', true)`);
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

  it("keeps each account's choice in its order and goes back to the default", async () => {
    expect((await api("GET", "/dashboard")).data).toEqual({ widgets: null });
    expect((await api("PUT", "/dashboard", { widgets: ["animals", "plant-tasks", "animals", "yields"] })).data).toEqual({ widgets: ["animals", "plant-tasks", "yields"] });
    expect((await api("GET", "/dashboard")).data).toEqual({ widgets: ["animals", "plant-tasks", "yields"] });
    expect((await api("PUT", "/dashboard", { widgets: ["weather-radar"] })).status).toBe(400);
    expect((await api("PUT", "/dashboard", {})).status).toBe(400);
    // Nothing at all is a choice too.
    expect((await api("PUT", "/dashboard", { widgets: [] })).data).toEqual({ widgets: [] });
    // A widget the app no longer has drops out when read.
    await q(`UPDATE dashboard_layouts SET widgets = '["old-widget", "duties"]' WHERE user_id = 'anna'`);
    expect((await api("GET", "/dashboard")).data).toEqual({ widgets: ["duties"] });
    as = "bert";
    expect((await api("GET", "/dashboard")).data).toEqual({ widgets: null });
    as = "anna";
    expect((await api("PUT", "/dashboard", { widgets: null })).data).toEqual({ widgets: null });
    expect(await q("SELECT * FROM dashboard_layouts")).toEqual([]);
  });

  it("goes with the account", async () => {
    await api("PUT", "/dashboard", { widgets: ["animals"] });
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");
    expect(await q("SELECT * FROM dashboard_layouts")).toEqual([]);
  });
});
