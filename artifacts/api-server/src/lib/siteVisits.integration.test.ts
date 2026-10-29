/**
 * Besucher der Homepage against a REAL Postgres, through the HTTP routes:
 * counted per day, page and origin; bots, unknown pages and ANALYTICS=off
 * not; the owner's report.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const BROWSER = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";

describe.skipIf(!enabled)("Besucher der Homepage (real database)", () => {
  let server: Server;
  let base = "";
  let owner = false;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = owner ? { id: "owner", approved: true, isOwner: true } : undefined;
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => owner;
      next();
    });
    app.use((await import("../routes/monitoring")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    delete process.env["ANALYTICS"];
    server?.close();
  });

  beforeEach(async () => {
    delete process.env["ANALYTICS"];
    owner = false;
    await q("TRUNCATE site_visits");
  });

  const visit = (body: unknown, ua = BROWSER) =>
    fetch(`${base}/site/visit`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": ua, Host: "littlefarming.de" }, body: JSON.stringify(body) });

  it("counts page views per day, page and origin – and nothing else", async () => {
    expect((await visit({ path: "/", campaign: "Instagram" })).status).toBe(204);
    await visit({ path: "/", campaign: "instagram" });
    await visit({ path: "/preise/", referrer: "https://www.google.de/search?q=huehner" });
    await visit({ path: "/preise", referrer: "http://127.0.0.1/" });
    await visit({ path: "/modul-finder" });
    // Not counted: an app page, a bot, a made-up page.
    await visit({ path: "/farm/tiere" });
    await visit({ path: "/" }, "Googlebot/2.1 (+http://www.google.com/bot.html)");
    await visit({ path: "/../etc/passwd" });

    const rows = await q<{ path: string; source: string; count: number }>("SELECT path, source, count FROM site_visits ORDER BY path, source");
    expect(rows).toEqual([
      { path: "/", source: "instagram", count: 2 },
      { path: "/modul-finder", source: "direkt", count: 1 },
      { path: "/preise", source: "127.0.0.1", count: 1 },
      { path: "/preise", source: "google.de", count: 1 },
    ]);
    // Nothing but these columns exists to hold anything about a person.
    expect(Object.keys((await q("SELECT * FROM site_visits LIMIT 1"))[0]!).sort()).toEqual(["count", "day", "path", "source"]);
  });

  it("is off with ANALYTICS=off and reports to the owner only", async () => {
    process.env["ANALYTICS"] = "off";
    await visit({ path: "/" });
    expect(await q("SELECT * FROM site_visits")).toEqual([]);
    delete process.env["ANALYTICS"];
    await visit({ path: "/", campaign: "zeitung" });

    expect((await fetch(`${base}/admin/site-visits`)).status).toBe(401);
    owner = true;
    const report = (await (await fetch(`${base}/admin/site-visits`)).json()) as any;
    expect(report).toMatchObject({ enabled: true, days: 30, perPath: [{ path: "/", visits: 1 }], perSource: [{ source: "zeitung", visits: 1 }] });
    expect(report.perDay).toHaveLength(1);
  });
});
