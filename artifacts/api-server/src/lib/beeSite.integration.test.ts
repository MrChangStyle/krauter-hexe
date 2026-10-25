/**
 * Bienen – Standort against a REAL Postgres, through the HTTP routes: the
 * photo of a colony's stand (replaced, removed, gone with the colony) and the
 * Standort-Check by the (mocked) AI – kept with its photo, counted as a farm
 * AI request, refused before counting when the photo is no photo, roles and
 * farm isolation.
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
const runModelChain = vi.fn(async (_contents: unknown, _models: unknown, _config?: unknown): Promise<unknown> => ({}));
vi.mock("./plantIdentification", async (orig) => ({ ...(await orig<object>()), runModelChain }));
let uploads = 0;
const uploadImage = vi.fn(async (_d: string) => `https://res.cloudinary.com/demo/image/upload/v1/biene-${++uploads}.jpg`);
const deleteImageByUrl = vi.fn(async (_url: string) => true);
vi.mock("./imageStorage", async (orig) => ({ ...(await orig<object>()), uploadImage, deleteImageByUrl }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const ANSWER = {
  gesamt: "Guter Stand, aber zu feucht.",
  ausrichtung: "Fluglöcher nach Südosten – gut.",
  schutz: "Hecke im Westen hält den Wind ab.",
  bepflanzung: "Obstbäume und Wiese.",
  feuchtigkeit: "Senke mit nassem Gras – Beuten höher stellen.",
  nachbarn: "Kein Weg in der Flugbahn.",
  tipps: ["Beuten 40 cm hoch stellen"],
};

describe.skipIf(!enabled)("Bienen – Standort (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let colony = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/bees");
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: false };
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
    uploadImage.mockClear();
    uploads = 0;
    deleteImageByUrl.mockClear();
    await q("TRUNCATE farms, farm_memberships, users, scan_attempts RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`, [farm.anna, farm.bert]);
    const [c] = await q<{ id: number }>("INSERT INTO bee_colonies (farm_id, name, apiary) VALUES ($1, 'Linde', 'Obstwiese') RETURNING id", [farm.anna]);
    colony = c!.id;
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

  it("keeps a photo of the colony's stand, replaces and removes it, and lets it go with the colony", async () => {
    const P = `/farms/${farm.anna}/bees/${colony}/photo`;
    let d = (await api("PUT", P, { imageData: PHOTO })).data;
    expect(d.colony.photoUrl).toBe("https://res.cloudinary.com/demo/image/upload/v1/biene-1.jpg");
    expect((await api("GET", `/farms/${farm.anna}/bees`)).data.colonies[0].photoUrl).toBe(d.colony.photoUrl);
    d = (await api("PUT", P, { imageData: PHOTO })).data;
    expect(d.colony.photoUrl).toMatch(/biene-2/);
    expect(deleteImageByUrl).toHaveBeenLastCalledWith("https://res.cloudinary.com/demo/image/upload/v1/biene-1.jpg");
    expect((await api("PUT", P, { imageData: "data:text/plain;base64,aGk=" })).data.error).toBe("Das ist kein gültiges Foto.");
    expect((await api("DELETE", P)).data.colony.photoUrl).toBeNull();
    expect(deleteImageByUrl).toHaveBeenLastCalledWith(expect.stringMatching(/biene-2/));
    // A new one, then the colony goes – with its photo.
    await api("PUT", P, { imageData: PHOTO });
    await api("DELETE", `/farms/${farm.anna}/bees/${colony}`);
    expect(deleteImageByUrl).toHaveBeenLastCalledWith(expect.stringMatching(/biene-3/));
    // Guests look, others' farms stay closed.
    const [c] = await q<{ id: number }>("INSERT INTO bee_colonies (farm_id, name) VALUES ($1, 'Raps') RETURNING id", [farm.anna]);
    as = "gast";
    expect((await api("PUT", `/farms/${farm.anna}/bees/${c!.id}/photo`, { imageData: PHOTO })).status).toBe(403);
    as = "bert";
    expect((await api("PUT", `/farms/${farm.bert}/bees/${c!.id}/photo`, { imageData: PHOTO })).status).toBe(404);
  });

  it("has the AI look at a photo of a stand, keeps photo and answer, and counts it as a farm AI request", async () => {
    const S = `/farms/${farm.anna}/bees/site-checks`;
    runModelChain.mockResolvedValueOnce(ANSWER);
    const r = await api("POST", S, { imageData: PHOTO, heading: 495, apiary: "Obstwiese", question: "Zu feucht?" });
    expect(r.status).toBe(201);
    expect(r.data).toEqual([
      {
        id: expect.any(Number),
        apiary: "Obstwiese",
        photoUrl: "https://res.cloudinary.com/demo/image/upload/v1/biene-1.jpg",
        heading: 135,
        question: "Zu feucht?",
        analysis: expect.objectContaining({ overall: "Guter Stand, aber zu feucht.", moisture: "Senke mit nassem Gras – Beuten höher stellen.", tips: ["Beuten 40 cm hoch stellen"] }),
        createdAt: expect.any(String),
      },
    ]);
    // The prompt carries the compass direction and the question; the photo goes inline.
    const sent = JSON.stringify(runModelChain.mock.calls[0]![0]);
    expect(sent).toContain("nach Südosten (135°)");
    expect(sent).toContain("Frage des Imkers: Zu feucht?");
    expect(sent).toContain('"mimeType":"image/jpeg"');
    expect(await attempts()).toBe(1);

    // No photo: refused before the AI is asked or counted.
    expect((await api("POST", S, { imageData: "kein Foto" })).data.error).toBe("Das ist kein gültiges Foto.");
    // An incomplete answer is not kept, and the attempt is given back.
    runModelChain.mockResolvedValueOnce({ gesamt: "nur das" });
    expect((await api("POST", S, { imageData: PHOTO })).status).toBe(502);
    expect(await attempts()).toBe(1);
    expect((await api("GET", S)).data).toHaveLength(1);
    // The daily limit.
    await q(`INSERT INTO scan_attempts (user_id, scan_type) SELECT 'anna', 'farm' FROM generate_series(1, 14)`);
    expect((await api("POST", S, { imageData: PHOTO })).status).toBe(429);
  });

  it("lets guests read the checks; caretakers delete them with their photo; farms stay apart", async () => {
    const S = `/farms/${farm.anna}/bees/site-checks`;
    runModelChain.mockResolvedValueOnce(ANSWER);
    const id = (await api("POST", S, { imageData: PHOTO })).data[0].id;
    as = "gast";
    expect((await api("GET", S)).data).toHaveLength(1);
    expect((await api("POST", S, { imageData: PHOTO })).status).toBe(403);
    expect((await api("DELETE", `${S}/${id}`)).status).toBe(403);
    as = "bert";
    expect((await api("DELETE", `/farms/${farm.bert}/bees/site-checks/${id}`)).status).toBe(404);
    as = "anna";
    expect((await api("DELETE", `${S}/${id}`)).data).toEqual([]);
    expect(deleteImageByUrl).toHaveBeenCalledWith("https://res.cloudinary.com/demo/image/upload/v1/biene-1.jpg");
  });
});
