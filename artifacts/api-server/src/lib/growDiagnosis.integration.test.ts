/**
 * Grow KI-Check against a REAL Postgres, through the HTTP routes, with the AI
 * replaced: Premium only, health and trichome checks kept on the plant without the photo,
 * the Tagebuch facts, trichomes only in the bloom, unreadable photos, the daily
 * limit, privacy between accounts and deleting a check.
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
const runModelChain = vi.fn();
vi.mock("./plantIdentification", async (orig) => ({
  ...(await orig<object>()),
  runModelChain: (...args: unknown[]) => runModelChain(...args),
}));
let fixedDay = "2026-04-01";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe.skipIf(!enabled)("Grow KI-Check (real database, AI replaced)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let plantId = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "owner" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
      next();
    });
    app.use((await import("../routes/grow")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };
  const open = async (who: string) => {
    as = who;
    await api("POST", "/grow/access", { adults: 1 });
  };
  const plant = { name: "Lemon 1", strainType: "hybrid", flowering: "photo", seedSex: "feminized", startedOn: "2026-03-01" };

  beforeEach(async () => {
    await q("TRUNCATE users, grow_access, grows, scan_attempts, premium RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('owner', 'o@x.de', true, true), ('anna', 'anna@x.de', true, false), ('bert', 'bert@x.de', true, false)`);
    fixedDay = "2026-04-01";
    runModelChain.mockReset();
    await q("INSERT INTO premium (user_id) VALUES ('anna'), ('bert')");
    await open("anna");
    const growId = (await api("POST", "/grow/grows", { name: "Zelt", environment: "indoor", medium: "soil" })).data.grows[0].id;
    plantId = (await api("POST", `/grow/grows/${growId}/plants`, plant)).data.id;
  });

  it("checks the health with the Tagebuch and keeps only the result", async () => {
    await api("POST", `/grow/plants/${plantId}/logs`, { date: "2026-03-30", ph: 7.5, note: "gelbe Spitzen" });
    runModelChain.mockResolvedValueOnce({
      istPflanze: true,
      status: "problem",
      zusammenfassung: "Gelbe Blattspitzen, vermutlich pH-bedingt.",
      befunde: [{ name: "Calcium-/Magnesiummangel", kategorie: "deficiency", wahrscheinlich: true, anzeichen: "rostbraune Flecken", massnahmen: ["pH auf 6,2–6,8 bringen", "Cal-Mag geben"] }],
    });
    const r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ kind: "health", date: "2026-04-01", trichomes: null, health: { status: "problem", findings: [{ name: "Calcium-/Magnesiummangel", likely: true }] } });
    expect(r.data.health.facts[0]).toMatch(/^pH 7,5 \(Tagebuch 30\.03\.\) liegt außerhalb des Ziels 6,2–6,8/);
    // The model got the plant's context and the photo.
    const prompt = runModelChain.mock.calls[0]![0][0].parts[0].text as string;
    expect(prompt).toContain("Phase: Wachstum (Tag 31 seit dem Keimen");
    expect(prompt).toContain("Indoor (Zelt), Substrat Erde");
    expect(prompt).toContain("pH 7.5, Notiz „gelbe Spitzen“");
    expect(runModelChain.mock.calls[0]![0][0].parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" });
    // Kept with the plant, without the photo.
    const detail = (await api("GET", `/grow/plants/${plantId}`)).data;
    expect(detail.checks).toEqual([r.data]);
    expect(JSON.stringify(await q("SELECT * FROM grow_checks"))).not.toContain("base64");
    expect(await q("SELECT scan_type FROM scan_attempts")).toEqual([{ scan_type: "grow" }]);
    // Not a plant: 422, nothing kept, the attempt given back.
    runModelChain.mockResolvedValueOnce({ istPflanze: false });
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO })).status).toBe(422);
    expect(await q("SELECT count(*)::int AS n FROM grow_checks")).toEqual([{ n: 1 }]);
    expect(await q("SELECT count(*)::int AS n FROM scan_attempts")).toEqual([{ n: 1 }]);
    // AI down: 502.
    runModelChain.mockRejectedValueOnce(new Error("boom"));
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO })).status).toBe(502);
    // Not a photo.
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: "data:text/plain;base64,aGk=" })).status).toBe(400);
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "x", imageData: PHOTO })).status).toBe(400);
    // Delete.
    expect((await api("DELETE", `/grow/checks/${r.data.id}`)).status).toBe(204);
    expect((await api("GET", `/grow/plants/${plantId}`)).data.checks).toEqual([]);
  });

  it("needs Premium – granted without end, until a day, or the owner", async () => {
    // After the Testphase, for an account created after it (not a tester).
    process.env["TEST_PHASE_END"] = "2020-01-01";
    await q("DELETE FROM premium WHERE user_id = 'anna'");
    let r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO });
    expect(r).toEqual({ status: 402, data: { error: "Der KI-Check gehört zu Premium.", premium: false } });
    expect(runModelChain).not.toHaveBeenCalled();
    expect(await q("SELECT * FROM scan_attempts")).toEqual([]);
    // Expired yesterday: still no.
    await q("INSERT INTO premium (user_id, active_until) VALUES ('anna', now() - interval '1 day')");
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO })).status).toBe(402);
    // Until tomorrow: yes.
    await q("UPDATE premium SET active_until = now() + interval '1 day' WHERE user_id = 'anna'");
    runModelChain.mockResolvedValueOnce({ istPflanze: true, status: "healthy", befunde: [] });
    r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO });
    expect(r.status).toBe(201);
    delete process.env["TEST_PHASE_END"];
  });

  it("is open for everyone during the Testphase", async () => {
    delete process.env["TEST_PHASE_END"];
    await q("DELETE FROM premium WHERE user_id = 'anna'");
    runModelChain.mockResolvedValueOnce({ istPflanze: true, status: "healthy", befunde: [] });
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO })).status).toBe(201);
  });

  it("reads the trichomes only in the bloom", async () => {
    let r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "trichomes", imageData: PHOTO });
    expect(r.status).toBe(409);
    expect(runModelChain).not.toHaveBeenCalled();
    fixedDay = "2026-06-05";
    runModelChain.mockResolvedValueOnce({ sichtbar: true, klar: 10, milchig: 75, bernstein: 15, zusammenfassung: "Überwiegend milchig." });
    r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "trichomes", imageData: PHOTO });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ kind: "trichomes", health: null, trichomes: { clear: 10, milky: 75, amber: 15, stage: "window" } });
    runModelChain.mockResolvedValueOnce({ sichtbar: false });
    r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "trichomes", imageData: PHOTO });
    expect(r.data.error).toMatch(/^Die Trichome sind nicht scharf genug/);
  });

  it("keeps to the daily limit and to the account", async () => {
    await q(`INSERT INTO scan_attempts (user_id, scan_type) SELECT 'anna', 'grow' FROM generate_series(1, 15)`);
    const r = await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO });
    expect(r.status).toBe(429);
    expect(r.data.error).toBe("Du hast heute schon 15 KI-Anfragen für den Grow gestellt. Morgen geht es weiter.");
    expect(runModelChain).not.toHaveBeenCalled();
    // Bert neither checks nor deletes Anna's.
    await q("DELETE FROM scan_attempts");
    runModelChain.mockResolvedValue({ istPflanze: true, status: "healthy", befunde: [] });
    const id = (await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO })).data.id;
    await open("bert");
    expect((await api("POST", `/grow/plants/${plantId}/checks`, { kind: "health", imageData: PHOTO })).status).toBe(404);
    expect((await api("DELETE", `/grow/checks/${id}`)).status).toBe(404);
    // Gone with the plant.
    as = "anna";
    await api("DELETE", `/grow/plants/${plantId}`);
    expect(await q("SELECT * FROM grow_checks")).toEqual([]);
  });
});
