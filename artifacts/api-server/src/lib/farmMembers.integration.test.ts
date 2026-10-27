/**
 * "Meine Farm" step 2 against a REAL Postgres, through the HTTP routes: own
 * farm on first visit, members, roles, leaving, renaming and deleting.
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

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Meine Farm – farms and members (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: farmsRouter } = await import("../routes/farms");
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use(farmsRouter);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    const { resetInviteCounters } = await import("./farmMembers");
    resetInviteCounters();
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, first_name, approved, blocked_at) VALUES
      ('anna', 'anna@example.org', 'Anna', true, null),
      ('bert', 'Bert@Example.org', 'Bert', true, null),
      ('cleo', 'cleo@example.org', 'Cleo', true, null),
      ('wait', 'wait@example.org', null, false, null),
      ('troll', 'troll@example.org', null, false, now())`);
    as = "anna";
  });

  const api = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  const json = async (res: Response | globalThis.Response) => (await (res as globalThis.Response).json()) as any;

  async function ownFarmId(): Promise<number> {
    const farms = await json(await api("POST", "/farms/ensure-own"));
    return farms[0].id as number;
  }

  it("creates exactly one own farm on first visit, even when asked twice at once", async () => {
    const [a, b] = await Promise.all([api("POST", "/farms/ensure-own"), api("POST", "/farms/ensure-own")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await q("SELECT 1 FROM farms")).toHaveLength(1);
    expect(await json(await api("GET", "/farms"))).toEqual([
      { id: expect.any(Number), name: "Meine Farm", role: "admin", accessUntil: null, modules: null, ownerName: null },
    ]);
  });

  it("adds members by email (case-insensitive) and refuses unknown, unapproved and blocked accounts", async () => {
    const farm = await ownFarmId();
    const added = await api("POST", `/farms/${farm}/members`, { email: " bert@EXAMPLE.org ", role: "caretaker" });
    expect(added.status).toBe(200);
    expect((await json(added)).map((m: any) => m.displayName)).toEqual(["Anna", "Bert"]);

    for (const email of ["nobody@example.org", "wait@example.org", "troll@example.org"]) {
      expect((await api("POST", `/farms/${farm}/members`, { email, role: "guest" })).status).toBe(404);
    }
    expect((await api("POST", `/farms/${farm}/members`, { email: "bert@example.org", role: "guest" })).status).toBe(409);
  });

  it("shows email addresses to admins only", async () => {
    const farm = await ownFarmId();
    await api("POST", `/farms/${farm}/members`, { email: "bert@example.org", role: "guest" });
    expect((await json(await api("GET", `/farms/${farm}/members`)))[1].email).toBe("Bert@Example.org");
    as = "bert";
    const seenByGuest = await json(await api("GET", `/farms/${farm}/members`));
    expect(seenByGuest.every((m: any) => m.email === null)).toBe(true);
    expect(seenByGuest.find((m: any) => m.isMe).displayName).toBe("Bert");
  });

  it("lets only admins manage members, rename and delete", async () => {
    const farm = await ownFarmId();
    await api("POST", `/farms/${farm}/members`, { email: "bert@example.org", role: "caretaker" });
    await api("POST", `/farms/${farm}/members`, { email: "cleo@example.org", role: "guest" });
    as = "bert";
    expect((await api("POST", `/farms/${farm}/members`, { email: "x@example.org", role: "guest" })).status).toBe(403);
    expect((await api("PATCH", `/farms/${farm}/members/cleo`, { role: "admin" })).status).toBe(403);
    expect((await api("DELETE", `/farms/${farm}/members/cleo`)).status).toBe(403);
    expect((await api("PATCH", `/farms/${farm}`, { name: "Meins" })).status).toBe(403);
    expect((await api("DELETE", `/farms/${farm}`, { confirmName: "Meine Farm" })).status).toBe(403);
  });

  it("always keeps an admin", async () => {
    const farm = await ownFarmId();
    await api("POST", `/farms/${farm}/members`, { email: "bert@example.org", role: "caretaker" });
    // Anna is the only admin: she can neither step down nor leave.
    expect((await api("PATCH", `/farms/${farm}/members/anna`, { role: "caretaker" })).status).toBe(409);
    expect((await api("DELETE", `/farms/${farm}/members/anna`)).status).toBe(409);
    // After making Bert admin, both work.
    expect((await api("PATCH", `/farms/${farm}/members/bert`, { role: "admin" })).status).toBe(200);
    expect((await api("DELETE", `/farms/${farm}/members/anna`)).status).toBe(204);
    expect(await q("SELECT user_id, role FROM farm_memberships WHERE farm_id = $1", [farm])).toEqual([
      { user_id: "bert", role: "admin" },
    ]);
  });

  it("lets any member leave, but not the last one", async () => {
    const farm = await ownFarmId();
    await api("POST", `/farms/${farm}/members`, { email: "cleo@example.org", role: "guest" });
    as = "cleo";
    expect((await api("DELETE", `/farms/${farm}/members/cleo`)).status).toBe(204);
    expect((await api("GET", `/farms/${farm}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `/farms/${farm}/members/anna`)).status).toBe(409);
  });

  it("renames, and deletes only with the exact name, taking the animals along", async () => {
    const farm = await ownFarmId();
    expect(await json(await api("PATCH", `/farms/${farm}`, { name: "  Hof   Sonnenblick " }))).toMatchObject({
      name: "Hof Sonnenblick",
    });
    await q(`INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Lotte', 'goat', 'Z1')`, [farm]);
    expect((await api("DELETE", `/farms/${farm}`, { confirmName: "Hof" })).status).toBe(400);
    expect((await api("DELETE", `/farms/${farm}`, { confirmName: "Hof Sonnenblick" })).status).toBe(204);
    expect(await q("SELECT 1 FROM farm_animals")).toHaveLength(0);
    // The next visit gives Anna a fresh own farm again.
    expect(await json(await api("POST", "/farms/ensure-own"))).toHaveLength(1);
  });

  it("limits farms run as admin", async () => {
    await ownFarmId();
    for (let i = 2; i <= 5; i += 1) {
      expect((await api("POST", "/farms", { name: `Farm ${i}` })).status).toBe(201);
    }
    expect((await api("POST", "/farms", { name: "Farm 6" })).status).toBe(409);
  });

  it("does not let a member of one farm act on another", async () => {
    const annas = await ownFarmId();
    as = "bert";
    const berts = await ownFarmId();
    expect((await api("POST", `/farms/${annas}/members`, { email: "cleo@example.org", role: "admin" })).status).toBe(404);
    expect((await api("DELETE", `/farms/${annas}/members/anna`)).status).toBe(404);
    expect((await api("GET", `/farms/${berts}/members`)).status).toBe(200);
  });
});
