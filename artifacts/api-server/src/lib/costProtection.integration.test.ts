/**
 * Kostenschutz (docs/kostenschutz.md) against a REAL Postgres: the AI calls
 * that used to run without a daily limit – Pflanzendoc, Pflege-Guide and the
 * universal scan's first look – now count, refuse at the limit WITHOUT calling
 * the AI, and give the attempt back when the AI fails.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (a throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const ai = vi.hoisted(() => ({
  health: vi.fn(),
  guide: vi.fn(),
  classify: vi.fn(),
}));
vi.mock("./plantIdentification", async (orig) => ({
  ...(await orig<typeof import("./plantIdentification")>()),
  checkPlantHealth: (...args: unknown[]) => ai.health(...args),
  generateCareGuide: (...args: unknown[]) => ai.guide(...args),
  classifyScanSubject: (...args: unknown[]) => ai.classify(...args),
}));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

describe.skipIf(!enabled)("Kostenschutz: KI nur innerhalb der Tageslimits (real database)", () => {
  let server: Server;
  let base = "";
  let as = { id: "anna", isOwner: false };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }
  const attempts = async (type: string) =>
    Number((await q<{ n: string }>("SELECT count(*) AS n FROM scan_attempts WHERE user_id = $1 AND scan_type = $2", [as.id, type]))[0]!.n);
  const fill = (type: string, n: number) =>
    q("INSERT INTO scan_attempts (user_id, scan_type) SELECT $1, $2 FROM generate_series(1, $3)", [as.id, type, n]);

  async function post(path: string, body: unknown) {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  }

  beforeAll(async () => {
    process.env["GEMINI_API_KEY"] ??= "test-key-not-used";
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as.id, approved: true, isOwner: as.isOwner };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
      next();
    });
    app.use((await import("../routes/plants")).default);
    app.use((await import("../routes/care-guides")).default);
    app.use((await import("../routes/scan")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(async () => {
    as = { id: "anna", isOwner: false };
    ai.health.mockReset();
    ai.guide.mockReset();
    ai.classify.mockReset();
    // premium too: the Paket sets the limit (docs/bezahlung.md), and other files leave grants behind.
    await q("TRUNCATE users, scan_attempts, care_guides, premium RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('anna', 'anna@example.org', true, false), ('chef', 'chef@example.org', true, true)`);
  });

  it("Pflanzendoc counts like a plant scan and stops at the limit without asking the AI", async () => {
    ai.health.mockResolvedValue({ pflanzen_name: "Minze", gesundheits_score: 80, symptome: [], hausmittel: [], duenge_biologisch: "", duenge_chemisch: "" });
    expect((await post("/plants/health-check", { image: PHOTO })).status).toBe(200);
    expect(await attempts("plant")).toBe(1);

    await fill("plant", 14);
    const refused = await post("/plants/health-check", { image: PHOTO });
    expect(refused.status).toBe(429);
    expect(refused.data).toMatchObject({ limit: 15, error: "Du hast heute schon 15 KI-Anfragen gestellt. Morgen geht es weiter." });
    expect(ai.health).toHaveBeenCalledTimes(1);
  });

  it("a failing Pflanzendoc gives its attempt back", async () => {
    ai.health.mockRejectedValue(new Error("upstream"));
    expect((await post("/plants/health-check", { image: PHOTO })).status).toBe(503);
    expect(await attempts("plant")).toBe(0);
  });

  it("a Pflege-Guide counts like a plant scan and stops at the limit", async () => {
    ai.guide.mockResolvedValue({ targetHumidity: "50 %", potSizeRecommendation: "", recommendedPotDiameter: "", recommendedSoilType: "", dailyPlan: [] });
    const guide = { plantName: "Minze", healthScore: 80, symptoms: [], duengeBiologisch: "", duegeChemisch: "" };
    expect((await post("/care-guides", guide)).status).toBe(201);
    expect(await attempts("plant")).toBe(1);

    await fill("plant", 14);
    expect((await post("/care-guides", guide)).status).toBe(429);
    expect(ai.guide).toHaveBeenCalledTimes(1);

    ai.guide.mockRejectedValue(new Error("upstream"));
    await q("DELETE FROM scan_attempts");
    expect((await post("/care-guides", guide)).status).toBe(503);
    expect(await attempts("plant")).toBe(0);
  });

  it("the universal scan's first look has its own limit – photos without a subject cannot run up the bill", async () => {
    ai.classify.mockResolvedValue({ subject: "nichts" });
    expect((await post("/scan", { image: PHOTO })).status).toBe(422);
    expect(await attempts("classify")).toBe(1);

    await fill("classify", 44);
    const refused = await post("/scan", { image: PHOTO });
    // The same answer as the plant scan, so the offline queue pauses until midnight.
    expect(refused).toMatchObject({ status: 429, data: { error: "SCAN_LIMIT_REACHED", limit: 45 } });
    expect(ai.classify).toHaveBeenCalledTimes(1);
  });

  it("the first look stays out of the app-wide budget", async () => {
    process.env["SCAN_DAILY_BUDGET"] = "2";
    try {
      ai.classify.mockResolvedValue({ subject: "nichts" });
      await fill("classify", 5);
      ai.health.mockResolvedValue({ pflanzen_name: "Minze", gesundheits_score: 80, symptome: [], hausmittel: [], duenge_biologisch: "", duenge_chemisch: "" });
      expect((await post("/plants/health-check", { image: PHOTO })).status).toBe(200);
      expect((await post("/plants/health-check", { image: PHOTO })).status).toBe(200);
      const refused = await post("/plants/health-check", { image: PHOTO });
      expect(refused).toMatchObject({ status: 429, data: { error: "Die KI ist für heute ausgelastet. Bitte versuche es morgen wieder." } });
      // With the budget used up, the first look still works on its own counter.
      expect((await post("/scan", { image: PHOTO })).status).toBe(422);
    } finally {
      delete process.env["SCAN_DAILY_BUDGET"];
    }
  });

  it("the owner has no limit and leaves no attempts behind", async () => {
    as = { id: "chef", isOwner: true };
    ai.classify.mockResolvedValue({ subject: "nichts" });
    for (let i = 0; i < 3; i++) await post("/scan", { image: PHOTO });
    expect(ai.classify).toHaveBeenCalledTimes(3);
    expect(await attempts("classify")).toBe(0);
  });
});
