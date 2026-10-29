/**
 * Passwort vergessen / ändern against a REAL Postgres, through the real auth
 * middleware: links by mail and from the owner, one use only, expiry, other
 * devices signed out, the same answer for unknown addresses.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (a throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { tokenPredatesPasswordChange } from "./passwordReset";

const { pushes } = vi.hoisted(() => ({ pushes: [] as Array<{ to: string; title: string }> }));
vi.mock("./webPush", () => ({
  sendPushToUser: (to: string, p: { title: string }) => {
    pushes.push({ to, title: p.title });
    return Promise.resolve(1);
  },
}));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe("tokenPredatesPasswordChange", () => {
  it("rejects tokens from before the change, keeps those from the same second on", () => {
    const changed = new Date("2026-10-29T10:00:00.700Z");
    expect(tokenPredatesPasswordChange(Date.parse("2026-10-29T09:59:59Z") / 1000, changed)).toBe(true);
    expect(tokenPredatesPasswordChange(Date.parse("2026-10-29T10:00:00Z") / 1000, changed)).toBe(false);
    expect(tokenPredatesPasswordChange(0, null)).toBe(false);
  });
});

describe.skipIf(!enabled)("Passwort vergessen (real database)", () => {
  let server: Server;
  let base = "";
  const mails: Array<{ to: string; text: string }> = [];
  const realFetch = globalThis.fetch;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  async function call(path: string, body: unknown, cookie?: string) {
    const res = await realFetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    const auth = /auth=([^;]*)/.exec(setCookie)?.[1];
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, cookie: auth ? `auth=${auth}` : undefined };
  }

  async function whoAmI(cookie: string) {
    const res = await realFetch(`${base}/me`, { headers: { Cookie: cookie } });
    return ((await res.json()) as { id: string | null }).id;
  }

  beforeAll(async () => {
    process.env["JWT_SECRET"] ??= "integration-test-secret-0123456789";
    const { authMiddleware } = await import("../middlewares/authMiddleware");
    const app = express();
    app.set("trust proxy", false);
    app.use(express.json());
    app.use(cookieParser());
    app.use(authMiddleware);
    app.use((await import("../routes/auth")).default);
    app.use((await import("../routes/password")).default);
    app.get("/me", (req, res) => {
      res.json({ id: req.user?.id ?? null });
    });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(async () => {
    const { resetRateLimits } = await import("../routes/password");
    resetRateLimits();
    mails.length = 0;
    pushes.length = 0;
    await q("TRUNCATE users, password_resets RESTART IDENTITY CASCADE");
    const { hashPassword } = await import("./password");
    await q(
      `INSERT INTO users (id, email, password_hash, approved, is_owner) VALUES
        ('chef', 'chef@example.org', $1, true, true),
        ('anna', 'anna@example.org', $2, true, false)`,
      [await hashPassword("chef-passwort"), await hashPassword("altes-passwort")],
    );
  });

  afterEach(() => {
    delete process.env["RESEND_API_KEY"];
    delete process.env["PUBLIC_BASE_URL"];
    globalThis.fetch = realFetch;
  });

  function withMailService() {
    process.env["RESEND_API_KEY"] = "re_test";
    process.env["PUBLIC_BASE_URL"] = "https://littlefarming.de";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://api.resend.com/")) {
        const body = JSON.parse(String(init?.body)) as { to: string[]; text: string };
        mails.push({ to: body.to[0]!, text: body.text });
        return new Response("{}", { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
  }

  function tokenFrom(text: string): string {
    const match = /\/passwort-neu\?token=([A-Za-z0-9_-]+)/.exec(text);
    expect(match).not.toBeNull();
    return match![1]!;
  }

  it("mails a link that sets the new password once and signs out other devices", async () => {
    withMailService();
    const oldDevice = (await call("/auth/login", { email: "anna@example.org", password: "altes-passwort" })).cookie!;
    expect(await whoAmI(oldDevice)).toBe("anna");
    // Token issue times are whole seconds: wait for the next one.
    await new Promise((r) => setTimeout(r, 1100));

    const asked = await call("/auth/password-reset", { email: " Anna@Example.org " });
    expect(asked).toMatchObject({ status: 200, body: { mail: true } });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("anna@example.org");
    expect(mails[0]!.text).toContain("https://littlefarming.de/passwort-neu?token=");
    const token = tokenFrom(mails[0]!.text);

    expect((await call("/auth/password-reset/check", { token })).body).toEqual({ valid: true });
    expect((await call("/auth/password-reset/confirm", { token, password: "kurz" })).status).toBe(400);

    const done = await call("/auth/password-reset/confirm", { token, password: "neues-passwort" });
    expect(done.status).toBe(200);
    expect((done.body["user"] as { id: string }).id).toBe("anna");
    expect(await whoAmI(done.cookie!)).toBe("anna");
    expect(await whoAmI(oldDevice)).toBeNull();

    // Once only.
    expect((await call("/auth/password-reset/check", { token })).body).toEqual({ valid: false });
    expect((await call("/auth/password-reset/confirm", { token, password: "noch-ein-passwort" })).status).toBe(400);

    expect((await call("/auth/login", { email: "anna@example.org", password: "altes-passwort" })).status).toBe(401);
    expect((await call("/auth/login", { email: "anna@example.org", password: "neues-passwort" })).status).toBe(200);
    const [row] = await q<{ token_hash: string }>("SELECT token_hash FROM password_resets");
    expect(row!.token_hash).not.toContain(token);
  });

  it("answers the same for unknown addresses and sends nothing", async () => {
    withMailService();
    const asked = await call("/auth/password-reset", { email: "niemand@example.org" });
    expect(asked).toMatchObject({ status: 200, body: { mail: true } });
    expect(mails).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it("limits mails per address", async () => {
    withMailService();
    for (let i = 0; i < 5; i++) {
      expect((await call("/auth/password-reset", { email: "anna@example.org" })).status).toBe(200);
    }
    expect(mails).toHaveLength(3);
  });

  it("without a mail service tells the owner, who creates a link to pass on", async () => {
    const asked = await call("/auth/password-reset", { email: "anna@example.org" });
    expect(asked.body).toEqual({ mail: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(pushes).toEqual([{ to: "chef", title: "Passwort vergessen" }]);

    const anna = (await call("/auth/login", { email: "anna@example.org", password: "altes-passwort" })).cookie!;
    expect((await call("/users/anna/password-reset-link", {}, anna)).status).toBe(403);

    const chef = (await call("/auth/login", { email: "chef@example.org", password: "chef-passwort" })).cookie!;
    expect((await call("/users/nobody/password-reset-link", {}, chef)).status).toBe(404);
    const link = await call("/users/anna/password-reset-link", {}, chef);
    expect(link.status).toBe(200);
    const token = tokenFrom(String(link.body["url"]));
    const hours = (Date.parse(String(link.body["expiresAt"])) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);

    expect((await call("/auth/password-reset/confirm", { token, password: "neues-passwort" })).status).toBe(200);
    expect((await call("/auth/login", { email: "anna@example.org", password: "neues-passwort" })).status).toBe(200);
  });

  it("an expired link does nothing", async () => {
    const { createResetToken } = await import("./passwordReset");
    const { token } = await createResetToken("anna", "mail", new Date(Date.now() - 2 * 60 * 60 * 1000));
    expect((await call("/auth/password-reset/check", { token })).body).toEqual({ valid: false });
    expect((await call("/auth/password-reset/confirm", { token, password: "neues-passwort" })).status).toBe(400);
    expect((await call("/auth/login", { email: "anna@example.org", password: "altes-passwort" })).status).toBe(200);
  });

  it("using one link voids the other open links of the account", async () => {
    const { createResetToken } = await import("./passwordReset");
    const first = await createResetToken("anna", "owner");
    const second = await createResetToken("anna", "owner");
    expect((await call("/auth/password-reset/confirm", { token: second.token, password: "neues-passwort" })).status).toBe(200);
    expect((await call("/auth/password-reset/check", { token: first.token })).body).toEqual({ valid: false });
  });

  it("changes the password when signed in, with the old one", async () => {
    const device = (await call("/auth/login", { email: "anna@example.org", password: "altes-passwort" })).cookie!;
    await new Promise((r) => setTimeout(r, 1100));
    expect((await call("/auth/password", { newPassword: "neues-passwort" })).status).toBe(401);
    expect((await call("/auth/password", { currentPassword: "falsch-falsch", newPassword: "neues-passwort" }, device)).status).toBe(400);
    const changed = await call("/auth/password", { currentPassword: "altes-passwort", newPassword: "neues-passwort" }, device);
    expect(changed.status).toBe(200);
    // The device that changed it stays signed in with its fresh token.
    expect(await whoAmI(changed.cookie!)).toBe("anna");
    expect(await whoAmI(device)).toBeNull();
    expect((await call("/auth/login", { email: "anna@example.org", password: "neues-passwort" })).status).toBe(200);
  });

  it("an account without a password (Google only) sets one without the old one", async () => {
    await q("UPDATE users SET password_hash = NULL WHERE id = 'anna'");
    const { createAuthToken } = await import("./token");
    const cookie = `auth=${await createAuthToken("anna")}`;
    expect((await call("/auth/password", { newPassword: "erstes-passwort" }, cookie)).status).toBe(200);
    expect((await call("/auth/login", { email: "anna@example.org", password: "erstes-passwort" })).status).toBe(200);
  });

  it("deleting the account removes its links", async () => {
    const { createResetToken } = await import("./passwordReset");
    await createResetToken("anna", "owner");
    const { deleteAccount } = await import("./accountDeletion");
    await deleteAccount("anna");
    expect(await q("SELECT * FROM password_resets")).toHaveLength(0);
  });
});
