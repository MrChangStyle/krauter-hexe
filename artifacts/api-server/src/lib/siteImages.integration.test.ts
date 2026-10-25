/**
 * Homepage-Bilder against a REAL Postgres, through the HTTP routes: the
 * public list, the owner generating (model fallback), replacing and removing
 * pictures, and everyone else kept out. Google's image models and the image
 * storage are stand-ins – nothing leaves the test.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const generateContent = vi.fn();
const generateImages = vi.fn();
vi.mock("./geminiClient", () => ({ ai: { models: { generateContent, generateImages } } }));
let uploads = 0;
const uploadImage = vi.fn(async (_data: string) => `https://res.cloudinary.com/x/image/upload/site-${++uploads}.png`);
const deleteImageByUrl = vi.fn(async (_url: string) => true);
vi.mock("./imageStorage", async (orig) => ({ ...(await orig<object>()), uploadImage, deleteImageByUrl }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Homepage-Bilder (real database)", () => {
  let server: Server;
  let base = "";
  let owner = true;

  async function q(text: string) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text)).rows;
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: "chef", approved: true, isOwner: owner };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/site-images")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE site_images");
    owner = true;
    uploads = 0;
    for (const f of [generateContent, generateImages, uploadImage, deleteImageByUrl]) f.mockClear();
    generateContent.mockReset();
    generateImages.mockReset();
  });

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };
  const slot = (list: any[], key: string) => list.find((s) => s.slot === key);

  it("lets the owner make a picture, replace it and remove it; everyone sees it", async () => {
    expect((await api("GET", "/site-images")).data).toEqual({});
    const before = (await api("GET", "/admin/site-images")).data;
    expect(before.length).toBeGreaterThanOrEqual(10);
    expect(slot(before, "bees")).toMatchObject({ title: "Bienen", aspect: "4:3", url: null });

    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: "Hier" }, { inlineData: { mimeType: "image/png", data: "iVBOR" } }] } }] });
    let r = await api("POST", "/admin/site-images/bees", { extra: "im Frühling" });
    expect(r.status).toBe(200);
    expect(slot(r.data, "bees")).toMatchObject({ url: "https://res.cloudinary.com/x/image/upload/site-1.png", model: "gemini-2.5-flash-image" });
    expect(generateContent.mock.calls[0]![0]).toMatchObject({ model: "gemini-2.5-flash-image", config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } } });
    expect(generateContent.mock.calls[0]![0].contents).toMatch(/beehives.*im Frühling.*Realistic photograph/);
    expect(uploadImage.mock.calls[0]![0]).toBe("data:image/png;base64,iVBOR");
    expect((await api("GET", "/site-images")).data).toEqual({ bees: "https://res.cloudinary.com/x/image/upload/site-1.png" });

    // The first model fails: Imagen steps in, the old picture goes.
    generateContent.mockRejectedValue(new Error("quota"));
    generateImages.mockResolvedValue({ generatedImages: [{ image: { imageBytes: "AAAA", mimeType: "image/jpeg" } }] });
    r = await api("POST", "/admin/site-images/bees");
    expect(slot(r.data, "bees")).toMatchObject({ url: "https://res.cloudinary.com/x/image/upload/site-2.png", model: "imagen-4.0-generate-001" });
    expect(deleteImageByUrl).toHaveBeenCalledWith("https://res.cloudinary.com/x/image/upload/site-1.png");

    r = await api("DELETE", "/admin/site-images/bees");
    expect(slot(r.data, "bees").url).toBeNull();
    expect((await api("GET", "/site-images")).data).toEqual({});
  });

  it("says so when no model delivers, and knows only its slots", async () => {
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: "Kein Bild" }] } }] });
    generateImages.mockRejectedValue(new Error("not on this tier"));
    const r = await api("POST", "/admin/site-images/hero");
    expect(r.status).toBe(502);
    expect(r.data.error).toMatch(/kein Bild geliefert/);
    expect(uploadImage).not.toHaveBeenCalled();
    expect((await api("POST", "/admin/site-images/nope")).status).toBe(404);
    expect((await api("POST", "/admin/site-images/hero", { extra: "x".repeat(301) })).status).toBe(400);
  });

  it("keeps everyone but the owner out of the admin routes", async () => {
    owner = false;
    expect((await api("GET", "/admin/site-images")).status).toBe(403);
    expect((await api("POST", "/admin/site-images/hero")).status).toBe(403);
    expect((await api("DELETE", "/admin/site-images/hero")).status).toBe(403);
    expect((await api("GET", "/site-images")).status).toBe(200);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
