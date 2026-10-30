/**
 * Betrieb against a REAL Postgres: error groups and the owner's push, the
 * error handler, error logs, app error reports, the status notice, daily
 * usage totals, and who may see what.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const sendPushToUser = vi.fn(async (_u: string, _p: { title: string; body: string }) => 1);
vi.mock("./webPush", async (orig) => ({ ...(await orig<object>()), sendPushToUser }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Betrieb – Fehlerüberwachung, Status, Statistik (real database)", () => {
  let server: Server;
  let base = "";
  let as: string | null = "chef";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/monitoring");
    const { errorHandler } = await import("../middlewares/errorHandler");
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      if (as) (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "chef" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => as !== null;
      next();
    });
    app.use(router);
    app.get("/boom/:id", () => {
      throw new Error("Kaputt bei 17");
    });
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    sendPushToUser.mockClear();
    await q("TRUNCATE users, error_groups, app_status, usage_daily RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('chef', 'c@x.de', true, true), ('anna', 'a@x.de', true, false), ('neu', 'n@x.de', false, false)`);
    as = "chef";
  });

  const api = async (method: string, path: string, body?: unknown, ip = "10.0.0.1") => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "X-Forwarded-For": ip, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };
  const monitor = () => import("./monitoring");

  it("groups errors, counts them and tells the owner once", async () => {
    const { recordError, flushErrors, resolveErrorGroup } = await monitor();
    recordError({ source: "server", message: "Beet 12 kaputt", location: "GET /x" });
    recordError({ source: "server", message: "Beet 99 kaputt", location: "GET /x" });
    await flushErrors();
    const [group] = await q<any>("SELECT * FROM error_groups");
    expect(group).toMatchObject({ message: "Beet 12 kaputt", count: 2, resolved_at: null });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser.mock.calls[0]).toEqual(["chef", expect.objectContaining({ title: "Neuer Fehler in Little Farming", body: "Server: Beet 12 kaputt", url: "/mehr" })]);

    // Fixed, then back within the hour: open again, but no second push yet.
    await resolveErrorGroup(group.fingerprint);
    recordError({ source: "server", message: "Beet 7 kaputt", location: "GET /x" });
    await flushErrors();
    expect((await q<any>("SELECT count, resolved_at FROM error_groups"))[0]).toEqual({ count: 3, resolved_at: null });
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    // Later on, it is worth a push again.
    await q("UPDATE error_groups SET resolved_at = now(), notified_at = now() - interval '2 hours'");
    recordError({ source: "server", message: "Beet 8 kaputt", location: "GET /x" });
    await flushErrors();
    expect(sendPushToUser.mock.calls[1]![1]).toMatchObject({ title: "Fehler wieder aufgetreten" });
    expect((await q<any>("SELECT value FROM usage_daily WHERE metric = 'errors'"))[0].value).toBe(4);
  });

  it("answers unhandled route errors in German and records where they happened", async () => {
    const res = await api("GET", "/boom/5");
    expect(res).toEqual({ status: 500, data: { error: "Da ist etwas schiefgelaufen. Bitte versuche es später noch einmal." } });
    await (await monitor()).flushErrors();
    expect(await q("SELECT source, message, location FROM error_groups")).toEqual([{ source: "server", message: "Kaputt bei 17", location: "GET /boom/:id" }]);
  });

  it("turns logger.error calls into reports", async () => {
    const { logger, setErrorSink } = await import("./logger");
    const { errorFromLog, recordError, flushErrors } = await monitor();
    setErrorSink((obj, msg) => {
      const r = errorFromLog(obj, msg);
      if (r) recordError(r);
    });
    logger.error({ err: new Error("timeout") }, "Frost forecast failed");
    logger.warn({ err: new Error("ignored") }, "Only a warning");
    setErrorSink(null);
    await flushErrors();
    expect(await q("SELECT message FROM error_groups")).toEqual([{ message: "Frost forecast failed: timeout" }]);
  });

  it("takes app error reports without sign-in, but only a few per address", async () => {
    as = null;
    expect((await api("POST", "/client-errors", { message: "Cannot read properties of undefined", path: "/beete/3/7?ki=x", release: "abc1234" })).status).toBe(204);
    expect((await api("POST", "/client-errors", { stack: "x" })).status).toBe(400);
    await (await monitor()).flushErrors();
    expect(await q("SELECT source, location, release FROM error_groups")).toEqual([{ source: "client", location: "/beete/:id/:id", release: "abc1234" }]);
    for (let i = 0; i < 19; i += 1) await api("POST", "/client-errors", { message: `x ${i}` }, "10.0.0.9");
    expect((await api("POST", "/client-errors", { message: "die zwanzigste" }, "10.0.0.9")).status).toBe(204);
    expect((await api("POST", "/client-errors", { message: "eine zu viel" }, "10.0.0.9")).status).toBe(429);
    expect((await api("POST", "/client-errors", { message: "andere Adresse" }, "10.0.0.10")).status).toBe(204);
    await (await monitor()).flushErrors();
  });

  it("shows the status notice to everyone; only the owner sets it", async () => {
    as = null;
    expect((await api("GET", "/status")).data).toEqual({ message: null, level: "info", updatedAt: null });
    expect((await api("PUT", "/admin/status", { message: "Wartung", level: "warning" })).status).toBe(401);
    as = "anna";
    expect((await api("PUT", "/admin/status", { message: "Wartung", level: "warning" })).status).toBe(403);
    as = "chef";
    expect((await api("PUT", "/admin/status", { message: "  Die KI ist gerade gestört.  ", level: "warning" })).data).toMatchObject({ message: "Die KI ist gerade gestört.", level: "warning" });
    as = null;
    expect((await api("GET", "/status")).data.message).toBe("Die KI ist gerade gestört.");
    as = "chef";
    await api("PUT", "/admin/status", { message: "", level: "info" });
    expect((await api("GET", "/status")).data.message).toBeNull();
  });

  it("counts active users once a day and gives the owner daily totals", async () => {
    const { markActive, berlinDay, bumpUsage } = await monitor();
    const today = berlinDay();
    await markActive({ id: "anna", approved: true, lastActiveOn: null });
    await markActive({ id: "anna", approved: true, lastActiveOn: "2020-01-01" }); // stale copy: no double count
    await markActive({ id: "anna", approved: true, lastActiveOn: today });
    await markActive({ id: "neu", approved: false, lastActiveOn: null });
    await bumpUsage("ai_actions");
    await bumpUsage("ai_actions");
    expect((await q<any>("SELECT last_active_on::text AS d FROM users WHERE id = 'anna'"))[0].d).toBe(today);
    const usage = await api("GET", "/admin/usage");
    expect(usage.data).toHaveLength(14);
    expect(usage.data[0]).toEqual({ day: today, activeUsers: 1, newUsers: 3, aiActions: 2, aiTimeouts: 0, errors: 0 });
    as = "anna";
    expect((await api("GET", "/admin/usage")).status).toBe(403);
    expect((await api("GET", "/admin/errors")).status).toBe(403);
  });

  it("lets the owner list errors and mark them fixed", async () => {
    const { recordError, flushErrors } = await monitor();
    recordError({ source: "client", message: "A", location: "/a" });
    recordError({ source: "server", message: "B", location: "GET /b" });
    await flushErrors();
    const list = (await api("GET", "/admin/errors")).data;
    expect(list).toHaveLength(2);
    expect((await api("POST", `/admin/errors/${list[0].fingerprint}/resolve`)).status).toBe(204);
    expect((await api("POST", "/admin/errors/nicht-da/resolve")).status).toBe(404);
    const after = (await api("GET", "/admin/errors")).data;
    expect(after[1]).toMatchObject({ fingerprint: list[0].fingerprint, resolvedAt: expect.any(String) });
  });
});
