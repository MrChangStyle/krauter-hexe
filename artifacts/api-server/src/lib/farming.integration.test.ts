/**
 * Bewirtschaftung (docs/bio.md) against a REAL Postgres, through the HTTP
 * routes: conventional by default, switching to natural or organic and back
 * (admin only), the certificate data, and which accounts then get organic
 * plant advice – their own switch, or a farm of theirs (never the demo farm).
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The farm routes reach the Futterplaner (Hof einrichten), which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
vi.mock("./webPush", () => ({ sendPushToUser: async () => 1, sendPushToUsers: async () => 1 }));
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => "2026-10-30" }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Bewirtschaftung (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let farmId = 0;

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
    app.use((await import("../routes/farms")).default);
    app.use((await import("../routes/settings")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  // Other files reuse the ids "anna" and "pia": a natural farm left behind would give them organic advice.
  afterAll(async () => {
    await q("TRUNCATE farms, farm_memberships, user_settings RESTART IDENTITY CASCADE");
    server?.close();
  });

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users, user_settings RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('pia', 'p@x.de', true), ('olaf', 'o@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Sonnenblick') RETURNING id");
    farmId = f!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'pia', 'caretaker')`, [farmId]);
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

  it("is conventional until the admin switches – and can always switch back", async () => {
    expect((await api("GET", `/farms/${farmId}/farming`)).data).toEqual({ level: "conventional", controlBody: null, organicSince: null });

    const bio = await api("PUT", `/farms/${farmId}/farming`, { level: "organic", controlBody: " DE-ÖKO-006 ", organicSince: "2025-03-01" });
    expect(bio.data).toEqual({ level: "organic", controlBody: "DE-ÖKO-006", organicSince: "2025-03-01" });

    // A caretaker reads, but does not switch.
    as = "pia";
    expect((await api("GET", `/farms/${farmId}/farming`)).data.level).toBe("organic");
    expect((await api("PUT", `/farms/${farmId}/farming`, { level: "conventional" })).status).toBe(403);

    // Back to conventional: the certificate data goes with it.
    as = "anna";
    expect((await api("PUT", `/farms/${farmId}/farming`, { level: "conventional" })).data).toEqual({ level: "conventional", controlBody: null, organicSince: null });
    expect((await q("SELECT organic_control_body, organic_since FROM farms"))[0]).toEqual({ organic_control_body: null, organic_since: null });
  });

  it("refuses unknown levels and conversion dates in the future", async () => {
    expect((await api("PUT", `/farms/${farmId}/farming`, { level: "biodynamisch" })).status).toBe(400);
    const future = await api("PUT", `/farms/${farmId}/farming`, { level: "organic", organicSince: "2026-12-01" });
    expect(future.status).toBe(400);
    expect(future.data.error).toContain("Umstellung");
    // Natural keeps no certificate data, even when sent.
    expect((await api("PUT", `/farms/${farmId}/farming`, { level: "natural", controlBody: "DE-ÖKO-006" })).data).toEqual({ level: "natural", controlBody: null, organicSince: null });
  });

  it("gives organic plant advice by the account's own switch or by a natural/organic farm – not by the demo farm", async () => {
    const { organicTipsOn } = await import("./farming");
    // Conventional farm, switch off: both kinds of advice.
    expect(await organicTipsOn("anna")).toBe(false);
    expect((await api("GET", "/settings")).data).toMatchObject({ organicTips: false, organicFarm: null });

    // Olaf has no farm and switches it on for himself – and off again.
    as = "olaf";
    expect((await api("PUT", "/settings", { organicTips: true })).data).toMatchObject({ organicTips: true, organicFarm: null });
    expect(await organicTipsOn("olaf")).toBe(true);
    await api("PUT", "/settings", { organicTips: false });
    expect(await organicTipsOn("olaf")).toBe(false);

    // The farm goes natural: all its members get organic advice.
    as = "anna";
    await api("PUT", `/farms/${farmId}/farming`, { level: "natural" });
    expect(await organicTipsOn("anna")).toBe(true);
    expect(await organicTipsOn("pia")).toBe(true);
    expect((await api("GET", "/settings")).data).toMatchObject({ organicTips: false, organicFarm: "Hof Sonnenblick" });

    // A natural demo farm does not count.
    const [demo] = await q<{ id: number }>("INSERT INTO farms (name, is_demo, farming) VALUES ('Demo-Hof', true, 'natural') RETURNING id");
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'olaf', 'admin')`, [demo!.id]);
    expect(await organicTipsOn("olaf")).toBe(false);
  });
});
