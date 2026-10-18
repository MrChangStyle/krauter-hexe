/**
 * Unit tests for requireFarm: who gets into a farm's data and who does not.
 * The membership lookup is faked; the real query is covered by
 * farm.integration.test.ts.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const { state } = vi.hoisted(() => ({
  state: {
    user: null as null | { id: string; approved: boolean },
    /** "userId:farmId" -> role */
    memberships: new Map<string, string>(),
    lookups: 0,
    lastWhere: { userId: "", farmId: 0 },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { name: string }, value: unknown) => ({ col: col.name, value }),
  and: (...conds: Array<{ col: string; value: unknown }>) => conds,
}));

vi.mock("@workspace/db", () => ({
  farmMembershipsTable: { farmId: { name: "farmId" }, userId: { name: "userId" }, role: { name: "role" } },
  db: {
    select: () => ({
      from: () => ({
        where: (conds: Array<{ col: string; value: unknown }>) => {
          state.lookups += 1;
          const farmId = conds.find((c) => c.col === "farmId")!.value as number;
          const userId = conds.find((c) => c.col === "userId")!.value as string;
          state.lastWhere = { userId, farmId };
          const role = state.memberships.get(`${userId}:${farmId}`);
          return Promise.resolve(role ? [{ role }] : []);
        },
      }),
    }),
  },
}));

import { parseFarmId, requireFarm, roleAtLeast } from "./requireFarm";

const app = express();
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user?: unknown }).user = state.user ?? undefined;
  (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => !!state.user;
  next();
});
app.get("/farms/:farmId/read", requireFarm("guest"), (req, res) => res.json(req.farm));
app.post("/farms/:farmId/write", requireFarm("caretaker"), (req, res) => res.json(req.farm));
app.delete("/farms/:farmId/admin", requireFarm("admin"), (req, res) => res.json(req.farm));

let base = "";
const server = createServer(app);
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  state.user = { id: "anna", approved: true };
  state.memberships = new Map([
    ["anna:1", "admin"],
    ["anna:2", "guest"],
    ["bert:3", "admin"],
  ]);
  state.lookups = 0;
});

const call = (method: string, path: string) => fetch(`${base}${path}`, { method });

describe("requireFarm", () => {
  it("lets a member in and tells the handler which farm and role", async () => {
    const res = await call("GET", "/farms/1/read");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ farmId: 1, userId: "anna", role: "admin" });
    expect(state.lastWhere).toEqual({ userId: "anna", farmId: 1 });
  });

  it("answers 404 – not 403 – for someone else's farm, so it cannot be probed", async () => {
    expect((await call("GET", "/farms/3/read")).status).toBe(404);
    expect((await call("GET", "/farms/999/read")).status).toBe(404);
  });

  it("refuses a role that is too low with 403", async () => {
    expect((await call("POST", "/farms/2/write")).status).toBe(403); // guest
    expect((await call("DELETE", "/farms/2/admin")).status).toBe(403);
    expect((await call("POST", "/farms/1/write")).status).toBe(200); // admin
  });

  it("rejects malformed farm ids without asking the database", async () => {
    for (const id of ["0", "-1", "1.5", "abc", "1%20OR%201%3D1", "9999999999"]) {
      expect((await call("GET", `/farms/${id}/read`)).status).toBe(404);
    }
    expect(state.lookups).toBe(0);
  });

  it("needs a signed-in, approved account first", async () => {
    state.user = null;
    expect((await call("GET", "/farms/1/read")).status).toBe(401);
    state.user = { id: "anna", approved: false };
    expect((await call("GET", "/farms/1/read")).status).toBe(403);
    expect(state.lookups).toBe(0);
  });

  it("gives the app owner no automatic access", async () => {
    state.user = { id: "owner", approved: true, isOwner: true } as never;
    expect((await call("GET", "/farms/1/read")).status).toBe(404);
  });
});

describe("helpers", () => {
  it("orders roles admin > caretaker > guest", () => {
    expect(roleAtLeast("admin", "caretaker")).toBe(true);
    expect(roleAtLeast("caretaker", "caretaker")).toBe(true);
    expect(roleAtLeast("guest", "caretaker")).toBe(false);
  });

  it("parses only plain positive integers", () => {
    expect(parseFarmId("42")).toBe(42);
    expect(parseFarmId("042")).toBeNull();
    expect(parseFarmId(undefined)).toBeNull();
  });
});
