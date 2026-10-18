/**
 * Tests for POST /auth/register – the rules that come with public sign-up:
 *   - consent to Datenschutz/Nutzungsbedingungen is required and stored,
 *   - OPEN_REGISTRATION decides whether a new account is approved at once,
 *   - a configured Turnstile check must pass,
 *   - per-address limit and daily cap stop floods of new accounts.
 *
 * The database, password hashing and token minting are faked; the route runs
 * in a real Express app over HTTP.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const { state } = vi.hoisted(() => ({
  state: {
    /** Accounts created in the last 24 hours, as the daily-cap query sees it. */
    recentAccounts: 0,
    inserted: [] as Array<Record<string, unknown>>,
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
  const col = (name: string) => ({ __name: name });
  const usersTable = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => col(String(prop)),
  });
  const db = {
    select: (columns?: Record<string, unknown>) => ({
      from: () => ({
        where: () =>
          Promise.resolve(
            columns && "count" in columns
              ? [{ count: state.recentAccounts }]
              : [], // no existing account with this email
          ),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: () => {
          state.inserted.push(values);
          return Promise.resolve([
            {
              id: `user-${state.inserted.length}`,
              email: values["email"],
              approved: values["approved"] ?? false,
              isOwner: false,
            },
          ]);
        },
      }),
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
}));

// Account deletion is not under test here (see auth.delete.test.ts); its
// table lists would need the full schema mock.
vi.mock("../lib/accountDeletion", () => ({
  OwnerAccountDeletionError: class extends Error {},
  deleteAccount: () => Promise.resolve(true),
}));

vi.mock("../lib/password", () => ({
  MIN_PASSWORD_LENGTH: 8,
  hashPassword: () => Promise.resolve("hashed"),
  verifyPassword: () => Promise.resolve(false),
  spendVerificationTime: () => Promise.resolve(),
}));

vi.mock("../lib/token", () => ({
  createAuthToken: () => Promise.resolve("token"),
}));

vi.mock("../lib/auth", () => ({
  setAuthCookie: () => undefined,
  clearAuthCookie: () => undefined,
}));

import authRouter from "./auth";
import { LEGAL_VERSION, resetRegistrationCounters } from "../lib/registrationPolicy";

let baseUrl = "";
const server = createServer(
  express()
    .set("trust proxy", 1)
    .use(express.json())
    .use(authRouter),
);

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const realFetch = globalThis.fetch;

beforeEach(() => {
  state.recentAccounts = 0;
  state.inserted = [];
  resetRegistrationCounters();
  delete process.env["OPEN_REGISTRATION"];
  delete process.env["REGISTRATION_CODE"];
  delete process.env["TURNSTILE_SITE_KEY"];
  delete process.env["TURNSTILE_SECRET_KEY"];
  delete process.env["REGISTRATION_DAILY_CAP"];
  globalThis.fetch = realFetch;
});

let emailCounter = 0;

function register(body: Record<string, unknown>, ip = "203.0.113.7") {
  emailCounter += 1;
  return realFetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({
      email: `person${emailCounter}@example.org`,
      password: "langes-passwort",
      ...body,
    }),
  });
}

describe("POST /auth/register", () => {
  it("refuses a registration without consent and creates nothing", async () => {
    const res = await register({});
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it("stores consent time and version with the new account", async () => {
    const res = await register({ acceptTerms: true });
    expect(res.status).toBe(201);
    expect(state.inserted[0]?.["termsVersion"]).toBe(LEGAL_VERSION);
    expect(state.inserted[0]?.["termsAcceptedAt"]).toBeInstanceOf(Date);
  });

  it("keeps new accounts waiting for approval in family mode", async () => {
    await register({ acceptTerms: true });
    expect(state.inserted[0]?.["approved"]).toBe(false);
  });

  it("approves new accounts right away with OPEN_REGISTRATION=true", async () => {
    process.env["OPEN_REGISTRATION"] = "true";
    const res = await register({ acceptTerms: true });
    expect(res.status).toBe(201);
    expect(state.inserted[0]?.["approved"]).toBe(true);
  });

  it("rejects a registration whose Turnstile token Cloudflare does not confirm", async () => {
    process.env["TURNSTILE_SITE_KEY"] = "site";
    process.env["TURNSTILE_SECRET_KEY"] = "secret";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );

    const res = await register({ acceptTerms: true, turnstileToken: "fake" });
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it("accepts a registration whose Turnstile token Cloudflare confirms", async () => {
    process.env["TURNSTILE_SITE_KEY"] = "site";
    process.env["TURNSTILE_SECRET_KEY"] = "secret";
    const verify = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    globalThis.fetch = verify;

    const res = await register({ acceptTerms: true, turnstileToken: "echt" });
    expect(res.status).toBe(201);
    expect(verify).toHaveBeenCalledOnce();
  });

  it("stops the sixth new account from the same address within an hour", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await register({ acceptTerms: true }, "198.51.100.1")).status).toBe(201);
    }
    const blocked = await register({ acceptTerms: true }, "198.51.100.1");
    expect(blocked.status).toBe(429);
    // Another address is not affected.
    expect((await register({ acceptTerms: true }, "198.51.100.2")).status).toBe(201);
  });

  it("stops new accounts once the daily cap is reached with open registration", async () => {
    process.env["OPEN_REGISTRATION"] = "true";
    process.env["REGISTRATION_DAILY_CAP"] = "3";
    state.recentAccounts = 3;
    const res = await register({ acceptTerms: true });
    expect(res.status).toBe(429);
    expect(state.inserted).toHaveLength(0);
  });
});
