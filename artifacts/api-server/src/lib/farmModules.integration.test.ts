/**
 * Modul-Freigaben against a REAL Postgres, through the HTTP routes: the admin
 * grants modules, the server blocks the rest, push recipients follow suit.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Modul-Freigaben (real database)", () => {
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
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    for (const r of ["farms", "farm-tasks", "feed", "farm-contacts", "farm-animals"]) app.use((await import(`../routes/${r}`)).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('carl', 'c@x.de', true), ('gina', 'g@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof') RETURNING id");
    farmId = f!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'carl', 'caretaker'), ($1, 'gina', 'guest')`, [farmId]);
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
  const F = (p = "") => `/farms/${farmId}${p}`;

  it("lets the admin grant modules and the server blocks the rest", async () => {
    let r = await api("PUT", F("/members/carl/modules"), { modules: ["feed", "grow", "feed"] });
    expect(r.status).toBe(200);
    expect(r.data.find((m: { userId: string }) => m.userId === "carl").modules).toEqual(["feed"]);

    as = "carl";
    expect((await api("GET", F("/feeds"))).status).toBe(200);
    expect((await api("GET", F("/tasks"))).status).toBe(403);
    expect((await api("GET", F("/tasks"))).data.error).toMatch(/nicht freigegeben/);
    expect((await api("GET", F("/members"))).status).toBe(403);
    // Basics and emergency numbers stay open.
    expect((await api("GET", F("/animals"))).status).toBe(200);
    expect((await api("GET", F("/contacts"))).status).toBe(200);
    // The farm list tells the app what to show.
    expect((await api("GET", "/farms")).data[0]).toMatchObject({ id: farmId, role: "caretaker", modules: ["feed"] });
    // Members cannot grant themselves more.
    expect((await api("PUT", F("/members/carl/modules"), { modules: null })).status).toBe(403);

    as = "anna";
    // Admins always have everything, whatever is stored.
    await q("UPDATE farm_memberships SET modules = '[]' WHERE user_id = 'anna'");
    expect((await api("GET", F("/tasks"))).status).toBe(200);
    expect((await api("GET", F("/members"))).data.find((m: { userId: string }) => m.userId === "anna").modules).toBeNull();
    // Back to everything.
    await api("PUT", F("/members/carl/modules"), { modules: null });
    as = "carl";
    expect((await api("GET", F("/tasks"))).status).toBe(200);
    // Leaving stays possible without the members module.
    as = "anna";
    await api("PUT", F("/members/carl/modules"), { modules: [] });
    as = "carl";
    expect((await api("DELETE", F("/members/carl"))).status).toBe(204);
  });

  it("refuses unknown members and bad input", async () => {
    expect((await api("PUT", F("/members/nobody/modules"), { modules: [] })).status).toBe(404);
    expect((await api("PUT", F("/members/carl/modules"), { modules: ["kein-modul"] })).status).toBe(400);
    expect((await api("PUT", F("/members/carl/modules"), {})).status).toBe(400);
  });

  it("sends reminders only to members with the module", async () => {
    const { db, farmMembershipsTable } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const { grantedSql } = await import("./farmModules");
    await api("PUT", F("/members/carl/modules"), { modules: ["feed"] });
    const who = async (m: "feed" | "farm-tasks") =>
      (await db.select({ u: farmMembershipsTable.userId }).from(farmMembershipsTable).where(and(eq(farmMembershipsTable.farmId, farmId), grantedSql(m)))).map((r) => r.u).sort();
    expect(await who("feed")).toEqual(["anna", "carl", "gina"]);
    expect(await who("farm-tasks")).toEqual(["anna", "gina"]);
  });
});
