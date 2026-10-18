/**
 * Beet-Architekt step 3 against a REAL Postgres, through the HTTP routes,
 * with Cloudinary replaced: the bed photo, its compass heading and corners,
 * roles, isolation and photo clean-up.
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
let uploads = 0;
const uploadImage = vi.fn(async (_d: string) => `https://res.cloudinary.com/demo/image/upload/v1/beet-${++uploads}.jpg`);
const deleteImageByUrl = vi.fn(async (_u: string | null | undefined) => true);
vi.mock("./imageStorage", async (orig) => ({ ...(await orig<object>()), uploadImage, deleteImageByUrl }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const CORNERS = [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

describe.skipIf(!enabled)("Beet-Architekt – Foto mit Pflanzraster (real database)", () => {
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
    app.use(express.json({ limit: "15mb" }));
    app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use(router);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    uploadImage.mockClear();
    deleteImageByUrl.mockClear();
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
    );
    const [g] = await q<{ id: number }>(
      `INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Hochbeet', 'raised', 200, 120) RETURNING id`,
      [farm.anna],
    );
    bed = g!.id;
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
  const photo = () => `/farms/${farm.anna}/beds/${bed}/photo`;
  const corners = () => `/farms/${farm.anna}/beds/${bed}/photo-corners`;

  it("stores photo, compass heading and corners; a new photo asks for new corners", async () => {
    expect((await api("PUT", corners(), { corners: CORNERS })).data.error).toMatch(/kein Foto/);
    const first = await api("PUT", photo(), { imageData: PHOTO, heading: -30.4 });
    expect(first.data).toMatchObject({ photoUrl: expect.stringContaining("beet-1"), photoHeading: 330, photoCorners: null });
    expect((await api("PUT", corners(), { corners: CORNERS })).data.photoCorners).toEqual(CORNERS);
    const crossed = [CORNERS[0], CORNERS[2], CORNERS[1], CORNERS[3]];
    expect((await api("PUT", corners(), { corners: crossed })).data.error).toMatch(/kein Viereck/);

    const second = await api("PUT", photo(), { imageData: PHOTO });
    expect(second.data).toMatchObject({ photoUrl: expect.stringContaining("beet-2"), photoHeading: null, photoCorners: null });
    expect(deleteImageByUrl).toHaveBeenCalledWith(expect.stringContaining("beet-1"));
    expect((await api("PUT", photo(), { imageData: "data:text/html;base64,PGI+" })).status).toBe(400);
  });

  it("removes the photo with the bed, and on request", async () => {
    await api("PUT", photo(), { imageData: PHOTO });
    expect((await api("DELETE", photo())).data).toMatchObject({ photoUrl: null });
    expect(deleteImageByUrl).toHaveBeenCalledTimes(1);
    await api("PUT", photo(), { imageData: PHOTO });
    const { farmPhotoUrls } = await import("./farmMembers");
    expect(await farmPhotoUrls([farm.anna])).toEqual([expect.stringContaining("beet-")]);
    await api("DELETE", `/farms/${farm.anna}/beds/${bed}`);
    expect(deleteImageByUrl).toHaveBeenCalledTimes(2);
  });

  it("lets guests only look and strangers nothing", async () => {
    as = "gast";
    expect((await api("PUT", photo(), { imageData: PHOTO })).status).toBe(403);
    as = "bert";
    expect((await api("PUT", `/farms/${farm.bert}/beds/${bed}/photo`, { imageData: PHOTO })).status).toBe(404);
    expect((await api("PUT", `/farms/${farm.bert}/beds/${bed}/photo-corners`, { corners: CORNERS })).status).toBe(404);
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
