/**
 * Beet-Architekt step 5 (KI) against a REAL Postgres, through the HTTP routes,
 * with the model replaced: crop drafts and their approval by the owner, the
 * corner suggestion, the photo analysis, the planting suggestion, the daily
 * AI limit, roles and isolation.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
const runModelChain = vi.fn(async (_contents: unknown, _models: unknown, _config?: unknown, _opts?: unknown): Promise<unknown> => ({}));
vi.mock("./plantIdentification", async (orig) => ({ ...(await orig<object>()), runModelChain }));
vi.mock("./imageStorage", async (orig) => ({ ...(await orig<object>()), deleteImageByUrl: vi.fn(async () => true) }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const TOPINAMBUR = {
  name: "Topinambur",
  botanicalName: "Helianthus tuberosus",
  group: "vegetable",
  family: "Korbblütler",
  feeder: "medium",
  spacingCm: 50,
  rowSpacingCm: 75,
  light: "partial",
  frostHardy: true,
  sowIndoor: null,
  directSow: null,
  plantOut: { from: -4, to: 2 },
  harvest: { from: 10, to: 3 },
  good: ["mais"],
  bad: ["tomate"],
};

const promptOf = (contents: unknown) => JSON.stringify(contents);

describe.skipIf(!enabled)("Beet-Architekt – KI (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let bed = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/garden");
    const app = express();
    app.use(express.json());
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "chef" };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { log: unknown }).log = { error: () => {} };
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
    await q("TRUNCATE farms, farm_memberships, users, garden_crops, scan_attempts, plants RESTART IDENTITY CASCADE");
    await q(
      `INSERT INTO users (id, email, approved, is_owner) VALUES ('anna', 'a@x.de', true, false), ('bert', 'b@x.de', true, false), ('gast', 'g@x.de', true, false), ('chef', 'c@x.de', true, true)`,
    );
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
    );
    const [g] = await q<{ id: number }>(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm, sun_hours, photo_url) VALUES ($1, 'Hochbeet', 'raised', 300, 120, 7, $2) RETURNING id`,
      [farm.anna, PHOTO],
    );
    bed = g!.id;
    as = "anna";
    const { loadApprovedCrops } = await import("./gardenCrops");
    await loadApprovedCrops(true);
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
  const attempts = async () => (await q<{ n: number }>("SELECT count(*)::int AS n FROM scan_attempts WHERE scan_type = 'garden'"))[0]!.n;

  it("drafts a crop with the AI, and only the owner's approval makes it count", async () => {
    runModelChain.mockResolvedValue(TOPINAMBUR);
    const first = await api("POST", "/garden/crop-requests", { name: "Topinambur" });
    expect(first.status).toBe(200);
    expect(first.data).toMatchObject({ existing: false, draft: { status: "draft", crop: { key: "topinambur", family: "Korbblütler", good: ["mais"] } } });
    expect(promptOf(runModelChain.mock.calls[0]![0])).toContain("Topinambur");
    expect(await attempts()).toBe(1);
    // Asking again costs nothing; a catalog crop is answered from the catalog.
    expect((await api("POST", "/garden/crop-requests", { name: "Topinambur" })).data.existing).toBe(true);
    expect((await api("POST", "/garden/crop-requests", { name: "tomate" })).data).toMatchObject({ existing: true, draft: { status: "approved", crop: { key: "tomate" } } });
    expect(runModelChain).toHaveBeenCalledTimes(1);
    expect((await api("POST", "/garden/crop-requests", {})).status).toBe(400);

    // Not in the catalog yet, not plantable.
    expect((await api("GET", "/garden/catalog")).data.some((c: any) => c.key === "topinambur")).toBe(false);
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/plantings`, { cropKey: "topinambur", x: 0, y: 0 })).status).toBe(400);
    // An archive plant of that species is planted without data meanwhile.
    const [plant] = await q<{ id: number }>(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details,
         animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
       VALUES ('Erdbirne', 'Helianthus tuberosus L.', 'edible', 'edible', 'safe', '', '', '', '', '') RETURNING id`,
    );
    const archived = await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/plantings`, { plantId: plant!.id, x: 5, y: 0 });
    expect(archived.data).toMatchObject({ cropKey: null, w: 1 });

    expect((await api("GET", "/garden/crop-drafts")).status).toBe(403);
    expect((await api("POST", "/garden/crop-drafts/topinambur/approve")).status).toBe(403);
    as = "chef";
    expect((await api("GET", "/garden/crop-drafts")).data.map((d: any) => d.crop.key)).toEqual(["topinambur"]);
    expect((await api("POST", "/garden/crop-drafts/topinambur/approve")).data.status).toBe("approved");
    expect((await api("POST", "/garden/crop-drafts/topinambur/approve")).status).toBe(404);
    expect((await api("GET", "/garden/crop-drafts")).data).toEqual([]);

    as = "anna";
    expect((await api("GET", "/garden/catalog")).data.find((c: any) => c.key === "topinambur")).toMatchObject({ name: "Topinambur" });
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/plantings`, { cropKey: "topinambur", x: 0, y: 0 })).data).toMatchObject({ w: 2, h: 2 });
    // The archive planting got the new data; the calendar knows the crop now.
    expect((await q("SELECT crop_key FROM bed_plantings WHERE id = $1", [archived.data.id]))[0]).toEqual({ crop_key: "topinambur" });
    const cal = await api("GET", `/farms/${farm.anna}/garden/seasons/2026/calendar`);
    expect(cal.data.filter((e: any) => e.cropKey === "topinambur").map((e: any) => e.kind)).toContain("harvest");
  });

  it("lets the owner throw a draft away", async () => {
    runModelChain.mockResolvedValue({ ...TOPINAMBUR, name: "Yacon", botanicalName: "Smallanthus sonchifolius" });
    await api("POST", "/garden/crop-requests", { name: "Yacon" });
    as = "chef";
    expect((await api("DELETE", "/garden/crop-drafts/yacon")).status).toBe(204);
    expect((await api("DELETE", "/garden/crop-drafts/yacon")).status).toBe(404);
  });

  it("gives the attempt back when the AI fails or answers nonsense", async () => {
    runModelChain.mockRejectedValueOnce(new Error("503"));
    expect((await api("POST", "/garden/crop-requests", { name: "Topinambur" })).status).toBe(502);
    runModelChain.mockResolvedValueOnce({ name: "Topinambur" });
    expect((await api("POST", "/garden/crop-requests", { name: "Topinambur" })).status).toBe(502);
    expect(await attempts()).toBe(0);
    await q(
      `INSERT INTO scan_attempts (user_id, scan_type) SELECT 'anna', 'garden' FROM generate_series(1, 15)`,
    );
    expect((await api("POST", "/garden/crop-requests", { name: "Topinambur" })).status).toBe(429);
  });

  it("suggests the corners on the photo, in grid order", async () => {
    runModelChain.mockResolvedValue({ beetSichtbar: true, ecken: [{ x: 0.9, y: 0.85 }, { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.85 }, { x: 0.7, y: 0.3 }] });
    const res = await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/corner-suggestion`);
    expect(res.data.corners).toEqual([{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.9, y: 0.85 }, { x: 0.1, y: 0.85 }]);
    // The photo went to the model as inline data.
    expect(promptOf(runModelChain.mock.calls[0]![0])).toContain('"mimeType":"image/jpeg"');
    runModelChain.mockResolvedValue({ beetSichtbar: false, ecken: [] });
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/corner-suggestion`)).data).toEqual({ corners: null });
    await q("UPDATE garden_beds SET photo_url = NULL");
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/corner-suggestion`)).status).toBe(400);
  });

  it("stores the photo analysis until the photo goes", async () => {
    runModelChain.mockResolvedValue({ schatten: "Nachmittags Schatten vom Baum.", boden: "Locker, dunkel.", unkraut: "Etwas Giersch.", tipps: ["Mulchen"] });
    const res = await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/analysis`);
    expect(res.status).toBe(200);
    expect(res.data.photoAnalysis).toMatchObject({ shade: "Nachmittags Schatten vom Baum.", tips: ["Mulchen"], createdAt: expect.any(String) });
    expect((await api("GET", `/farms/${farm.anna}/beds/${bed}`)).data.photoAnalysis.weeds).toBe("Etwas Giersch.");
    await api("DELETE", `/farms/${farm.anna}/beds/${bed}/photo`);
    expect((await api("GET", `/farms/${farm.anna}/beds/${bed}`)).data.photoAnalysis).toBeNull();
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/analysis`)).status).toBe(400);
  });

  it("suggests plantings that pass the fixed rules, without saving them", async () => {
    await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/plantings`, { cropKey: "kartoffel", x: 0, y: 0 });
    runModelChain.mockResolvedValue({
      pflanzen: [
        { cropKey: "tomate", x: 2, y: 0 },
        { cropKey: "buschbohne", x: 4, y: 0 },
        { cropKey: "salat", x: 4, y: 3 },
      ],
      hinweis: "Bohnen lockern den Boden.",
    });
    const res = await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/suggestion`, { wishes: "Viel Salat" });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      items: [
        { cropKey: "buschbohne", label: "Buschbohne", x: 4, y: 0, w: 1, h: 1 },
        { cropKey: "salat", label: "Kopfsalat", x: 4, y: 3, w: 1, h: 1 },
      ],
      dropped: [{ label: "Tomate", reason: "verträgt sich nicht mit Kartoffel" }],
      notes: "Bohnen lockern den Boden.",
      fodderShare: null,
    });
    const prompt = promptOf(runModelChain.mock.calls[0]![0]);
    expect(prompt).toContain("Viel Salat");
    expect(prompt).toContain("Kartoffel (x 0–1, y 0–1)");
    // Never spins for ever: a time budget, minimal thinking and room for the answer.
    expect(runModelChain.mock.calls[0]![2]).toMatchObject({ maxOutputTokens: 8192 });
    expect(runModelChain.mock.calls[0]![3]).toEqual({ timeoutMs: 45_000, attemptTimeoutMs: 25_000, quick: true });
    expect((await api("GET", `/farms/${farm.anna}/beds/${bed}/seasons/2026/plantings`)).data).toHaveLength(1);
  });

  it("answers a too slow AI with a clear message instead of spinning", async () => {
    const { AiTimeoutError } = await import("./aiTimeout");
    runModelChain.mockRejectedValueOnce(new AiTimeoutError());
    const res = await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/suggestion`, {});
    expect(res.status).toBe(502);
    expect(res.data.error).toContain("zu lange gebraucht");
  });

  it("splits kitchen and fodder as asked, and only suitable crops count as fodder", async () => {
    runModelChain.mockResolvedValue({
      pflanzen: [
        { cropKey: "mangold", x: 0, y: 0, zweck: "futter" },
        { cropKey: "salat", x: 1, y: 0, zweck: "futter" },
        { cropKey: "buschbohne", x: 2, y: 0, zweck: "futter" }, // not fodder for the animals → kitchen
        { cropKey: "radieschen", x: 3, y: 0, zweck: "kueche" },
      ],
      hinweis: "Mangold und Salat für die Hühner.",
    });
    const res = await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/suggestion`, { wishes: null, animalShare: 50 });
    expect(res.status).toBe(200);
    expect(res.data.items.map((i: { cropKey: string; purpose: string }) => [i.cropKey, i.purpose])).toEqual([
      ["mangold", "fodder"],
      ["salat", "fodder"],
      ["buschbohne", "kitchen"],
      ["radieschen", "kitchen"],
    ]);
    expect(res.data.fodderShare).toBe(50);
    const prompt = promptOf(runModelChain.mock.calls.at(-1)![0]);
    expect(prompt).toContain("Etwa 50 % der neu bepflanzten Felder sollen Tierfutter sein");
    expect(prompt).toContain("zweck");
    expect(prompt).not.toContain("Buschbohne (Schlüssel");
    // Without a share nothing about fodder goes to the AI.
    await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/suggestion`, { animalShare: 0 });
    expect(promptOf(runModelChain.mock.calls.at(-1)![0])).not.toContain("Tierfutter");
  });

  it("keeps the garden AI to caretakers of the farm", async () => {
    runModelChain.mockResolvedValue({ pflanzen: [], hinweis: "" });
    as = "gast";
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/analysis`)).status).toBe(403);
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/seasons/2026/suggestion`, {})).status).toBe(403);
    as = "bert";
    expect((await api("POST", `/farms/${farm.anna}/beds/${bed}/photo/corner-suggestion`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/beds/${bed}/photo/corner-suggestion`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/beds/${bed}/seasons/2026/suggestion`, {})).status).toBe(404);
    expect(runModelChain).not.toHaveBeenCalled();
    expect(await attempts()).toBe(0);
  });
});
