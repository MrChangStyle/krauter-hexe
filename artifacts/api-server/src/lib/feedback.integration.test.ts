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
      // "besuch": a visitor of the homepage, not signed in.
      if (as !== "besuch") (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "owner" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => as !== "besuch";
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
    (await import("./feedback")).resetSiteFeedbackLimits();
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

  it("takes ideas and problems from homepage visitors, without an account", async () => {
    as = "besuch";
    expect((await api("POST", "/feedback/site", { text: "Die Preise sind mir nicht klar", page: "/preise", kind: "problem", contact: "gast@example.org", website: "" })).status).toBe(201);
    expect(pushes).toEqual([{ userId: "owner", title: "Problem gemeldet (Homepage)", url: "/verwaltung#feedback" }]);
    expect((await api("POST", "/feedback/site", { text: "Mehr Bilder bitte" })).status).toBe(201);
    expect(pushes.at(-1)!.title).toBe("Idee von der Homepage");
    // Checks: the address, too short, the honeypot (accepted, not stored).
    expect((await api("POST", "/feedback/site", { text: "Hallo Team", contact: "keine-adresse" })).data.error).toMatch(/E-Mail-Adresse/);
    expect((await api("POST", "/feedback/site", { text: "Hi" })).status).toBe(400);
    expect((await api("POST", "/feedback/site", { text: "Billig kaufen hier", website: "https://spam.example" })).status).toBe(201);
    // Not readable without being the owner.
    expect((await api("GET", "/feedback")).status).toBe(401);

    as = "owner";
    const items = (await api("GET", "/feedback")).data.items;
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ text: "Die Preise sind mir nicht klar", page: "/preise", kind: "problem", visitor: true, author: "Besuch der Homepage", email: "gast@example.org" });
    expect(items[0]).toMatchObject({ kind: "idea", visitor: true, email: null });

    // Signed in on the homepage, it goes with the account.
    as = "anna";
    await api("POST", "/feedback/site", { text: "Schöne Seite", kind: "idea" });
    as = "owner";
    expect((await api("GET", "/feedback")).data.items[0]).toMatchObject({ visitor: false, author: "anna", email: "anna@x.de", kind: "idea" });
  });

  it("limits a visitor to five messages an hour", async () => {
    as = "besuch";
    for (let i = 0; i < 5; i++) expect((await api("POST", "/feedback/site", { text: `Idee Nummer ${i}` })).status).toBe(201);
    const r = await api("POST", "/feedback/site", { text: "Noch eine Idee" });
    expect(r.status).toBe(429);
    expect(r.data.error).toMatch(/nächste Stunde/);
  });

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

  it("keeps a screenshot privately for the owner and checks it is an image", async () => {
    // A 1×1 PNG.
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    expect((await api("POST", "/feedback", { text: "Knopf fehlt", page: "/farm", screenshot: png })).status).toBe(201);
    expect((await api("POST", "/feedback", { text: "Ohne Bild" })).status).toBe(201);
    expect((await api("POST", "/feedback", { text: "Kein Bild", screenshot: "data:text/html;base64,PGgxPg==" })).status).toBe(400);

    // Only the owner gets it – as an image, not as JSON.
    const [row] = await q<{ id: number }>("SELECT id FROM feedback WHERE text = 'Knopf fehlt'");
    expect((await fetch(`${base}/feedback/${row!.id}/screenshot`)).status).toBe(403);
    as = "owner";
    const list = (await api("GET", "/feedback")).data.items;
    expect(list.map((f: any) => [f.text, f.hasScreenshot])).toEqual([["Ohne Bild", false], ["Knopf fehlt", true]]);
    const img = await fetch(`${base}/feedback/${row!.id}/screenshot`);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await img.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
    const none = list.find((f: any) => !f.hasScreenshot);
    expect((await fetch(`${base}/feedback/${none.id}/screenshot`)).status).toBe(404);
  });
});
