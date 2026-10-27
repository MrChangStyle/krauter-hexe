/**
 * Tests for DELETE /auth/user – deleting your own account.
 *
 * deleteAccount itself is covered by lib/accountDeletion.test.ts; here it is
 * faked so the tests can focus on who may trigger it and how they prove it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const { state } = vi.hoisted(() => ({
  state: {
    signedInAs: null as string | null,
    row: null as null | { email: string | null; passwordHash: string | null; isOwner: boolean },
    deleted: [] as string[],
    cookieCleared: 0,
  },
}));

vi.mock("drizzle-orm", () => {
  const sql = Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ __sql: true }),
    { raw: () => ({ __sql: true }) },
  );
  const op = () => ({ __op: true });
  return { sql, eq: op, and: op, ne: op, gte: op };
});

vi.mock("@workspace/db", () => {
  const usersTable = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => ({ __name: String(prop) }),
  });
  const db = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(state.row ? [state.row] : []) }),
    }),
  };
  return { db, usersTable };
});

vi.mock("@workspace/api-zod", () => ({
  GetCurrentAuthUserResponse: { parse: (value: unknown) => value },
}));

vi.mock("../lib/accounts", () => ({
  publicUserColumns: {},
  promoteFirstOwner: () => Promise.resolve(null),
  approveIfFreeTesterSlot: () => Promise.resolve(null),
}));

vi.mock("../lib/accountDeletion", () => {
  class OwnerAccountDeletionError extends Error {}
  return {
    OwnerAccountDeletionError,
    deleteAccount: (userId: string) => {
      state.deleted.push(userId);
      return Promise.resolve(true);
    },
  };
});

vi.mock("../lib/password", () => ({
  MIN_PASSWORD_LENGTH: 8,
  hashPassword: () => Promise.resolve("hashed"),
  verifyPassword: (password: string) => Promise.resolve(password === "richtiges-passwort"),
  spendVerificationTime: () => Promise.resolve(),
}));

vi.mock("../lib/token", () => ({
  createAuthToken: () => Promise.resolve("token"),
}));

vi.mock("../lib/auth", () => ({
  setAuthCookie: () => undefined,
  clearAuthCookie: () => {
    state.cookieCleared += 1;
  },
}));

import authRouter from "./auth";

let baseUrl = "";
const app = express()
  .set("trust proxy", 1)
  .use(express.json())
  .use((req, _res, next) => {
    // Stand-in for authMiddleware.
    const id = state.signedInAs;
    (req as unknown as { user?: { id: string } }).user = id ? { id } : undefined;
    (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => !!id;
    next();
  })
  .use(authRouter);
const server = createServer(app);

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

let ipCounter = 0;

beforeEach(() => {
  state.signedInAs = "user-1";
  state.row = { email: "anna@example.org", passwordHash: "hash", isOwner: false };
  state.deleted = [];
  state.cookieCleared = 0;
  ipCounter += 1;
});

function deleteOwnAccount(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/auth/user`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      // A fresh address per test keeps the lock-out of one test from leaking.
      "X-Forwarded-For": `192.0.2.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

describe("DELETE /auth/user", () => {
  it("requires a signed-in user", async () => {
    state.signedInAs = null;
    const res = await deleteOwnAccount({ password: "richtiges-passwort" });
    expect(res.status).toBe(401);
    expect(state.deleted).toHaveLength(0);
  });

  it("deletes the account with the right password and signs out", async () => {
    const res = await deleteOwnAccount({ password: "richtiges-passwort" });
    expect(res.status).toBe(204);
    expect(state.deleted).toEqual(["user-1"]);
    expect(state.cookieCleared).toBe(1);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const res = await deleteOwnAccount({ password: "falsch-falsch" });
    expect(res.status).toBe(403);
    expect(state.deleted).toHaveLength(0);
  });

  it("does not accept the email address instead of an existing password", async () => {
    const res = await deleteOwnAccount({ confirmEmail: "anna@example.org" });
    expect(res.status).toBe(403);
    expect(state.deleted).toHaveLength(0);
  });

  it("lets a Google-only account confirm with its email address", async () => {
    state.row = { email: "anna@example.org", passwordHash: null, isOwner: false };
    const res = await deleteOwnAccount({ confirmEmail: "  Anna@Example.org " });
    expect(res.status).toBe(204);
    expect(state.deleted).toEqual(["user-1"]);
  });

  it("refuses a Google-only account with a different email address", async () => {
    state.row = { email: "anna@example.org", passwordHash: null, isOwner: false };
    const res = await deleteOwnAccount({ confirmEmail: "bert@example.org" });
    expect(res.status).toBe(403);
    expect(state.deleted).toHaveLength(0);
  });

  it("never deletes the owner account", async () => {
    state.row = { email: "owner@example.org", passwordHash: "hash", isOwner: true };
    const res = await deleteOwnAccount({ password: "richtiges-passwort" });
    expect(res.status).toBe(400);
    expect(state.deleted).toHaveLength(0);
  });

  it("locks out after too many wrong passwords, even with the right one afterwards", async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await deleteOwnAccount({ password: "falsch-falsch" })).status).toBe(403);
    }
    const res = await deleteOwnAccount({ password: "richtiges-passwort" });
    expect(res.status).toBe(429);
    expect(state.deleted).toHaveLength(0);
  });
});
