/**
 * Alltagsnotizen (docs/alltagsnotizen.md) against a REAL Postgres, through
 * the HTTP routes: the own list, sharing with a team member or by e-mail,
 * what the person it is shared with may do (tick off, add – not delete), and
 * the AI plan.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const runModelChain = vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
  return vi.fn();
});
vi.mock("./plantIdentification", async (orig) => ({ ...(await orig<object>()), runModelChain }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Alltagsnotizen (real database)", () => {
  let server: Server;
  let base = "";
  let as = "stefan";

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
    app.use((await import("../routes/notes")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE daily_notes, note_shares, farms, farm_memberships, users, scan_attempts RESTART IDENTITY CASCADE");
    await q(
      `INSERT INTO users (id, email, approved, first_name) VALUES ('stefan', 's@x.de', true, 'Stefan'), ('maria', 'm@x.de', true, 'Maria'), ('oma', 'Oma@X.de', true, 'Oma'), ('neu', 'n@x.de', false, 'Neu'), ('bert', 'b@x.de', true, 'Bert')`,
    );
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Auberg') RETURNING id");
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'stefan', 'admin'), ($1, 'maria', 'caretaker')`, [f!.id]);
    as = "stefan";
    runModelChain.mockReset();
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

  it("keeps the own list: kind and section from the words, ticking off, clearing the done ones", async () => {
    let r = await api("POST", "/notes", { text: "Zahnbürsten" });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ text: "Zahnbürsten", kind: "einkauf", category: "drogerie", isOwnList: true, listOwnerName: "Stefan", addedByName: "Stefan", done: false });
    await api("POST", "/notes", { text: "Oma anrufen" });
    r = await api("POST", "/notes", { text: "Fleisch", kind: "einkauf", category: "lebensmittel" });
    r = await api("PATCH", `/notes/${r.data.id}`, { done: true });
    expect(r.data).toMatchObject({ done: true, doneByName: "Stefan" });
    r = await api("GET", "/notes");
    expect(r.data.map((n: { text: string }) => n.text)).toEqual(["Oma anrufen", "Zahnbürsten", "Fleisch"]);
    expect(r.data[0]).toMatchObject({ kind: "merken", category: null });
    r = await api("POST", "/notes/clear-done");
    expect(r.data).toEqual({ removed: 1 });
    expect((await api("GET", "/notes")).data).toHaveLength(2);
    expect((await api("POST", "/notes", { text: "" })).status).toBe(400);
    expect((await api("POST", "/notes", { text: "x".repeat(121) })).status).toBe(400);
  });

  it("shares the list with a team member and by e-mail; who it is shared with ticks off and adds but never deletes", async () => {
    const { data: brush } = await api("POST", "/notes", { text: "Zahnbürsten" });
    // Not yet shared: Maria sees nothing and cannot add to it.
    as = "maria";
    expect((await api("GET", "/notes")).data).toEqual([]);
    expect((await api("PATCH", `/notes/${brush.id}`, { done: true })).status).toBe(404);
    expect((await api("POST", "/notes", { text: "Brot", listOwnerId: "stefan" })).status).toBe(403);

    as = "stefan";
    let r = await api("POST", "/notes/shares", { userId: "maria" });
    expect(r.data.sharedWith).toEqual([{ userId: "maria", name: "Maria" }]);
    // Family off the farm, by e-mail (any case).
    r = await api("POST", "/notes/shares", { email: " oma@x.de " });
    expect(r.data.sharedWith.map((p: { name: string }) => p.name)).toEqual(["Maria", "Oma"]);
    // No account, not approved, not on a farm of mine, myself.
    expect((await api("POST", "/notes/shares", { email: "fremd@x.de" })).status).toBe(400);
    expect((await api("POST", "/notes/shares", { email: "n@x.de" })).status).toBe(400);
    expect((await api("POST", "/notes/shares", { userId: "bert" })).status).toBe(400);
    expect((await api("POST", "/notes/shares", { userId: "stefan" })).status).toBe(400);

    as = "maria";
    r = await api("GET", "/notes/shares");
    expect(r.data.sharedWithMe).toEqual([{ userId: "stefan", name: "Stefan" }]);
    r = await api("GET", "/notes");
    expect(r.data[0]).toMatchObject({ text: "Zahnbürsten", isOwnList: false, listOwnerName: "Stefan" });
    // Tick off and add: yes.
    expect((await api("PATCH", `/notes/${brush.id}`, { done: true })).data).toMatchObject({ done: true, doneByName: "Maria" });
    const { data: bread } = await api("POST", "/notes", { text: "Brot", listOwnerId: "stefan" });
    expect(bread).toMatchObject({ listOwnerId: "stefan", addedByName: "Maria", isOwnList: false });
    // Change what she wrote: yes; what Stefan wrote: no. Delete: never.
    expect((await api("PATCH", `/notes/${bread.id}`, { text: "2 Brote" })).data.text).toBe("2 Brote");
    expect((await api("PATCH", `/notes/${brush.id}`, { text: "Zahnpasta" })).status).toBe(403);
    expect((await api("DELETE", `/notes/${bread.id}`)).status).toBe(403);
    expect((await api("DELETE", `/notes/${brush.id}`)).status).toBe(403);
    // "Erledigte entfernen" only touches her own list.
    expect((await api("POST", "/notes/clear-done")).data).toEqual({ removed: 0 });

    // The owner deletes anything on his list.
    as = "stefan";
    expect((await api("DELETE", `/notes/${bread.id}`)).status).toBe(204);
    expect((await api("POST", "/notes/clear-done")).data).toEqual({ removed: 1 });

    // Stop sharing; Maria could also leave by herself.
    r = await api("DELETE", "/notes/shares/maria");
    expect(r.data.sharedWith.map((p: { name: string }) => p.name)).toEqual(["Oma"]);
    as = "oma";
    r = await api("DELETE", "/notes/shares/stefan");
    expect(r.data.sharedWithMe).toEqual([]);
    as = "maria";
    expect((await api("GET", "/notes")).data).toEqual([]);
  });

  it("plans notes from free speech with the AI and saves nothing", async () => {
    runModelChain.mockResolvedValue({ notizen: [{ text: "Zahnbürsten", art: "einkauf", bereich: "drogerie" }, { text: "Fleisch", art: "einkauf", bereich: "lebensmittel" }, { text: "Oma anrufen", art: "merken" }] });
    const r = await api("POST", "/notes/plan", { text: "Ich muss Zahnbürsten kaufen, Fleisch holen und Oma anrufen" });
    expect(r.status).toBe(200);
    expect(r.data.notes).toEqual([
      { text: "Zahnbürsten", kind: "einkauf", category: "drogerie" },
      { text: "Fleisch", kind: "einkauf", category: "lebensmittel" },
      { text: "Oma anrufen", kind: "merken", category: null },
    ]);
    expect(await q("SELECT id FROM daily_notes")).toEqual([]);
    expect(await q("SELECT scan_type FROM scan_attempts")).toEqual([{ scan_type: "farm" }]);
    runModelChain.mockResolvedValue({ notizen: [] });
    expect((await api("POST", "/notes/plan", { text: "Hallo" })).status).toBe(422);
    expect(await q("SELECT scan_type FROM scan_attempts")).toHaveLength(1);
  });
});
