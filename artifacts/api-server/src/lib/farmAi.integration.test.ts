/**
 * "Meine Farm" step 5 against a REAL Postgres, through the HTTP routes, with
 * the Gemini call replaced: species suggestion, Haltungs-Wiki cache, the plant
 * archive bridge, feed analysis with the medical history, the daily AI limit,
 * roles and isolation.
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

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe.skipIf(!enabled)("Meine Farm – AI features (real database, AI replaced)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let pferd = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  async function plant(german: string, botanical: string, animals: object, poultryStatus = "safe") {
    await q(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details,
         animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits, animals)
       VALUES ($1, $2, 'poisonous', 'poisonous', $3, '', 'Alte Angabe', '', '', '', $4)`,
      [german, botanical, poultryStatus, JSON.stringify(animals)],
    );
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/farm-ai");
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: false };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
      next();
    });
    app.use(router);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    runModelChain.mockReset();
    await q("TRUNCATE farms, farm_memberships, users, plants, husbandry_guides, scan_attempts RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
    );
    const [p] = await q<{ id: number }>(
      `INSERT INTO farm_animals (farm_id, name, species, sex, registration_number) VALUES ($1, 'Blitz', 'horse', 'male', 'DE 7') RETURNING id`,
      [farm.anna],
    );
    pferd = p!.id;
    await q(
      `INSERT INTO medical_records (farm_id, animal_id, date, diagnosis, medication) VALUES ($1, $2, '2026-09-01', 'Hufrehe', 'Phenylbutazon')`,
      [farm.anna, pferd],
    );
    as = "anna";
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

  const attempts = async () => (await q<{ n: number }>("SELECT count(*)::int AS n FROM scan_attempts WHERE scan_type = 'farm'"))[0]!.n;

  it("suggests species and breed, counting one AI request", async () => {
    runModelChain.mockResolvedValueOnce({ istTier: true, tierart: "horse", rasse: "Haflinger", sicherheit: 0.86 });
    const res = await api("POST", `/farms/${farm.anna}/ai/species`, { imageData: PHOTO });
    expect(res.data).toEqual({ isAnimal: true, species: "horse", breed: "Haflinger", confidence: 0.86 });
    expect(await attempts()).toBe(1);
  });

  it("stops at the daily limit, gives a failed request back and keeps guests out", async () => {
    runModelChain.mockRejectedValueOnce(new Error("503 high demand"));
    const failed = await api("POST", `/farms/${farm.anna}/ai/species`, { imageData: PHOTO });
    expect(failed.status).toBe(502);
    expect(await attempts()).toBe(0);

    await q("INSERT INTO scan_attempts (user_id, scan_type) SELECT 'anna', 'farm' FROM generate_series(1, 15)");
    const limited = await api("POST", `/farms/${farm.anna}/ai/species`, { imageData: PHOTO });
    expect(limited.status).toBe(429);
    expect(limited.data.error).toMatch(/15 KI-Anfragen/);

    as = "gast";
    expect((await api("POST", `/farms/${farm.anna}/ai/species`, { imageData: PHOTO })).status).toBe(403);
    expect((await api("POST", `/farms/${farm.anna}/animals/${pferd}/feed`, { imageData: PHOTO })).status).toBe(403);
    expect(runModelChain).toHaveBeenCalledTimes(1);
  });

  it("refuses anything but a photo before calling the AI", async () => {
    expect((await api("POST", `/farms/${farm.anna}/ai/species`, { imageData: "data:text/html;base64,PGI+" })).status).toBe(400);
    expect(runModelChain).not.toHaveBeenCalled();
    expect(await attempts()).toBe(0);
  });

  it("generates the Haltungs-Wiki once per species and then serves it from the cache", async () => {
    const guide = { summary: "S", nutrition: "N", housing: "H", care: "C", health: "G", lifeExpectancy: "25–30 Jahre" };
    runModelChain.mockResolvedValueOnce(guide);
    const first = await api("GET", `/farms/${farm.anna}/husbandry/horse`);
    expect(first.data).toMatchObject({ species: "horse", ...guide });
    as = "gast";
    const second = await api("GET", `/farms/${farm.anna}/husbandry/horse`);
    expect(second.data).toEqual(first.data);
    expect(runModelChain).toHaveBeenCalledTimes(1);
    expect((await api("GET", `/farms/${farm.anna}/husbandry/other`)).status).toBe(400);
    expect((await api("GET", `/farms/${farm.anna}/husbandry/dragon`)).status).toBe(404);
  });

  it("lists archive plants poisonous for a species, legacy poultry rows included", async () => {
    await plant("Eibe", "Taxus baccata", { horse: { status: "poisonous", toxicityLevel: "lethal", toxicityDetails: "Taxin", benefits: "" } });
    await plant("Eibe (Duplikat)", "Taxus baccata L.", { horse: { status: "poisonous", toxicityDetails: "Taxin", benefits: "" } });
    await plant("Löwenzahn", "Taraxacum officinale", { horse: { status: "safe", toxicityDetails: "", benefits: "" } });
    await plant("Altes Kraut", "Herba antiqua", {}, "poisonous");
    expect((await api("GET", `/farms/${farm.anna}/toxic-plants/horse`)).data).toEqual([
      { plantId: 1, germanName: "Eibe", botanicalName: "Taxus baccata", status: "poisonous", toxicityLevel: "lethal", details: "Taxin" },
    ]);
    expect((await api("GET", `/farms/${farm.anna}/toxic-plants/poultry`)).data.map((p: { germanName: string }) => p.germanName)).toEqual([
      "Altes Kraut",
    ]);
    expect((await api("GET", `/farms/${farm.anna}/toxic-plants/goat`)).data).toEqual([]);
  });

  it("analyses feed with the medical history, trusts the archive's 'poisonous' and stores the result", async () => {
    await plant("Eibe", "Taxus baccata", { horse: { status: "poisonous", toxicityLevel: "lethal", toxicityDetails: "Taxin", benefits: "" } });
    runModelChain.mockResolvedValueOnce({
      istFutter: true,
      bestandteile: [
        { name: "Heu", botanisch: null, giftig: false },
        { name: "Eibenzweig", botanisch: "Taxus baccata", giftig: false },
      ],
      naehrstoffe: { rohfaser: "hoch" },
      einschaetzung: "Heu passt.",
      hinweiseKrankenakte: ["Bei Hufrehe zuckerarmes Heu wählen."],
      bewertung: "good",
    });
    const res = await api("POST", `/farms/${farm.anna}/animals/${pferd}/feed`, { imageData: PHOTO });
    expect(res.status).toBe(201);
    expect(res.data.analysis.items[1]).toMatchObject({ name: "Eibenzweig", aiPoisonous: false, poisonous: true });
    expect(res.data.analysis.verdict).toBe("unsuitable");
    expect(JSON.stringify(runModelChain.mock.calls[0]![0])).toContain("Hufrehe (Medikament: Phenylbutazon)");

    expect((await api("GET", `/farms/${farm.anna}/animals/${pferd}/feed`)).data).toHaveLength(1);
    as = "bert";
    expect((await api("GET", `/farms/${farm.bert}/animals/${pferd}/feed`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/animals/${pferd}/feed`, { imageData: PHOTO })).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/feed/${res.data.id}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `/farms/${farm.anna}/feed/${res.data.id}`)).status).toBe(204);
  });

  it("answers 422 when the photo shows no feed, without using up the request", async () => {
    runModelChain.mockResolvedValueOnce({ istFutter: false });
    const res = await api("POST", `/farms/${farm.anna}/animals/${pferd}/feed`, { imageData: PHOTO });
    expect(res.status).toBe(422);
    expect(await attempts()).toBe(0);
    expect(await q("SELECT id FROM food_logs")).toEqual([]);
  });
});
