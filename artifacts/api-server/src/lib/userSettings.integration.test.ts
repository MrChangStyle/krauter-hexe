/**
 * Module settings against a REAL Postgres, through the HTTP routes: nothing
 * hidden at first, hiding and showing modules, unknown and doubled ids, the
 * first-start assistant flag, privacy between accounts and account deletion.
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

describe.skipIf(!enabled)("Module settings (real database)", () => {
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
    app.use((await import("../routes/settings")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE users, user_settings RESTART IDENTITY CASCADE");
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

  it("hides and shows modules and remembers the assistant", async () => {
    expect((await api("GET", "/settings")).data).toEqual({ hiddenModules: [], onboarded: false, pushOff: [], quietHours: null, seasonalCare: true, organicTips: false, organicFarm: null, hiddenAnimals: [], shareFindSpots: null });
    expect((await api("PUT", "/settings", { hiddenModules: ["grow", "wildlife", "grow"] })).data).toEqual({ hiddenModules: ["grow", "wildlife"], onboarded: false, pushOff: [], quietHours: null, seasonalCare: true, organicTips: false, organicFarm: null, hiddenAnimals: [], shareFindSpots: null });
    // Only the assistant: the modules stay.
    expect((await api("PUT", "/settings", { onboarded: true })).data).toEqual({ hiddenModules: ["grow", "wildlife"], onboarded: true, pushOff: [], quietHours: null, seasonalCare: true, organicTips: false, organicFarm: null, hiddenAnimals: [], shareFindSpots: null });
    expect((await api("PUT", "/settings", { hiddenModules: [] })).data).toEqual({ hiddenModules: [], onboarded: true, pushOff: [], quietHours: null, seasonalCare: true, organicTips: false, organicFarm: null, hiddenAnimals: [], shareFindSpots: null });
    expect((await api("PUT", "/settings", { hiddenModules: ["rocket-science"] })).status).toBe(400);
    // A module the app no longer has drops out when read.
    await q(`UPDATE user_settings SET hidden_modules = '["old", "feed"]' WHERE user_id = 'anna'`);
    expect((await api("GET", "/settings")).data.hiddenModules).toEqual(["feed"]);
    // The assistant again (e.g. "Einrichtung erneut starten").
    expect((await api("PUT", "/settings", { onboarded: false })).data.onboarded).toBe(false);
    as = "bert";
    expect((await api("GET", "/settings")).data).toEqual({ hiddenModules: [], onboarded: false, pushOff: [], quietHours: null, seasonalCare: true, organicTips: false, organicFarm: null, hiddenAnimals: [], shareFindSpots: null });
  });

  it("keeps Meine Tierarten: known kinds once, everything else stays", async () => {
    const r = await api("PUT", "/settings", { hiddenAnimals: ["horse", "cattle", "horse"] });
    expect(r.data).toMatchObject({ hiddenAnimals: ["horse", "cattle"], hiddenModules: [] });
    expect((await api("PUT", "/settings", { hiddenAnimals: ["unicorn"] })).status).toBe(400);
    expect((await api("PUT", "/settings", { organicTips: true })).data.hiddenAnimals).toEqual(["horse", "cattle"]);
    // A kind the archive no longer has drops out when read.
    await q(`UPDATE user_settings SET hidden_animals = '["dodo", "pig"]' WHERE user_id = 'anna'`);
    expect((await api("GET", "/settings")).data.hiddenAnimals).toEqual(["pig"]);
    expect((await api("PUT", "/settings", { hiddenAnimals: [] })).data.hiddenAnimals).toEqual([]);
  });

  it("keeps which pushes come and when it is quiet", async () => {
    let r = await api("PUT", "/settings", { pushOff: ["feed", "weather", "feed"], quietHours: { from: "22:00", to: "06:30" } });
    expect(r.data).toMatchObject({ pushOff: ["feed", "weather"], quietHours: { from: "22:00", to: "06:30" } });
    expect((await api("PUT", "/settings", { quietHours: { from: "25:00", to: "06:00" } })).status).toBe(400);
    r = await api("PUT", "/settings", { quietHours: null });
    expect(r.data).toMatchObject({ pushOff: ["feed", "weather"], quietHours: null });

    const { pushAllowed } = await import("./userSettings");
    await api("PUT", "/settings", { quietHours: { from: "22:00", to: "06:30" } });
    // 23:30 Berlin (CEST, UTC+2) – quiet; 08:00 – not.
    const night = new Date("2026-07-01T21:30:00Z");
    const morning = new Date("2026-07-01T06:00:00Z");
    expect(await pushAllowed("anna", "farm-tasks", night)).toBe(false);
    expect(await pushAllowed("anna", "farm-tasks", morning)).toBe(true);
    // The predator alarm still comes at night; switched-off topics never.
    expect(await pushAllowed("anna", "wildlife", night)).toBe(true);
    expect(await pushAllowed("anna", "feed", morning)).toBe(false);
    // Accounts without settings get everything.
    expect(await pushAllowed("bert", "feed", night)).toBe(true);
  });

  it("goes with the account", async () => {
    await api("PUT", "/settings", { hiddenModules: ["grow"] });
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");
    expect(await q("SELECT * FROM user_settings")).toEqual([]);
  });
});
