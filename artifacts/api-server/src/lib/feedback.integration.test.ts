/**
 * Feedback against a REAL Postgres, through the HTTP routes: everyone sends,
 * only the owner reads, marks and deletes; the owner gets a push; limits.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const pushes: { userId: string; title: string; url?: string }[] = [];
vi.mock("./webPush", () => ({
  sendPushToUser: async (userId: string, p: { title: string; url?: string }) => {
    pushes.push({ userId, title: p.title, url: p.url });
    return 1;
  },
}));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Feedback (real database)", () => {
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
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "owner" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/feedback")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE feedback, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, username, approved, is_owner) VALUES ('owner', 'o@x.de', 'chef', true, true), ('anna', 'anna@x.de', 'anna', true, false)`);
    as = "anna";
    pushes.length = 0;
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

  it("delivers ideas to the owner, who reads, marks and deletes them", async () => {
    expect((await api("POST", "/feedback", { text: "  Bitte eine Dunkel-Ansicht ", page: "/farm/futter", voice: true })).status).toBe(201);
    expect(pushes).toEqual([{ userId: "owner", title: "Neues Feedback", url: "/verwaltung#feedback" }]);
    expect((await api("GET", "/feedback")).status).toBe(403);

    as = "owner";
    let r = await api("GET", "/feedback");
    expect(r.data.unread).toBe(1);
    expect(r.data.items[0]).toMatchObject({ text: "Bitte eine Dunkel-Ansicht", page: "/farm/futter", voice: true, author: "anna", email: "anna@x.de", readAt: null });
    const id = r.data.items[0].id;
    r = await api("PUT", `/feedback/${id}`, { read: true });
    expect(r.data.unread).toBe(0);
    expect(r.data.items[0].readAt).not.toBeNull();
    r = await api("DELETE", `/feedback/${id}`);
    expect(r.data).toEqual({ items: [], unread: 0 });
    expect((await api("DELETE", `/feedback/${id}`)).status).toBe(404);

    // The owner's own test message sends no push.
    await api("POST", "/feedback", { text: "Selbsttest" });
    expect(pushes).toHaveLength(1);
  });

  it("checks the input and limits the number per day", async () => {
    expect((await api("POST", "/feedback", { text: "" })).status).toBe(400);
    expect((await api("POST", "/feedback", { text: "ok" })).status).toBe(400);
    // A full URL as page is dropped, not stored.
    await api("POST", "/feedback", { text: "Mit Link", page: "https://evil.example/x" });
    expect(await q("SELECT page FROM feedback")).toEqual([{ page: null }]);
    for (let i = 0; i < 19; i++) await api("POST", "/feedback", { text: `Idee ${i}` });
    expect((await api("POST", "/feedback", { text: "Noch eine" })).status).toBe(429);
  });
});
