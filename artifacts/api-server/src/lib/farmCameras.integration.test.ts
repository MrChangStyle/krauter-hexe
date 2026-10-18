/**
 * "Meine Farm" step 6 against a REAL Postgres, through the HTTP routes, with
 * AI, Cloudinary, push, DNS and the relay call replaced: camera management,
 * the webhook (secret, throttle, alarm, cooldown, relay, push), roles and
 * isolation.
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
const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
const uploadImage = vi.fn(async (_dataUrl: string) => "https://res.cloudinary.com/demo/image/upload/v1/kamera.jpg");
vi.mock("./plantIdentification", async (orig) => ({
  ...(await orig<object>()),
  runModelChain: (...args: unknown[]) => runModelChain(...args),
}));
vi.mock("./webPush", () => ({ sendPushToUser }));
vi.mock("./imageStorage", async (orig) => ({
  ...(await orig<object>()),
  uploadImage,
  deleteImageByUrl: vi.fn(async () => true),
}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const RELAY = "https://relay.example.org/relay/0?turn=on";

describe.skipIf(!enabled)("Meine Farm – Wildtier-Radar (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  const relayCalls: string[] = [];
  const realFetch = globalThis.fetch;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    // Calls to the test server go through; everything else is "the relay".
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://127.0.0.1")) return realFetch(input, init);
      relayCalls.push(url);
      return new Response("ok");
    });
    const { default: router } = await import("../routes/farm-cameras");
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

  afterAll(() => {
    vi.restoreAllMocks();
    server?.close();
  });

  beforeEach(async () => {
    runModelChain.mockReset();
    sendPushToUser.mockClear();
    uploadImage.mockClear();
    relayCalls.length = 0;
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(
      `INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true),
       ('gast', 'g@x.de', true), ('pfleger', 'p@x.de', true)`,
    );
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'),
       ($1, 'gast', 'guest'), ($1, 'pfleger', 'caretaker')`,
      [farm.anna, farm.bert],
    );
    as = "anna";
  });

  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined && typeof body !== "string" && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };

  const newCamera = async (overrides: Record<string, unknown> = {}) =>
    (await api("POST", `/farms/${farm.anna}/cameras`, { name: "Hühnerstall", relayUrl: RELAY, cooldownSeconds: 300, ...overrides })).data as {
      camera: { id: number };
      secret: string;
    };

  const send = (secret: string, body: unknown = { image: PHOTO }) =>
    api("POST", "/webhooks/camera", body, { Authorization: `Bearer ${secret}` });

  /** Lets the per-camera photo throttle pass by moving older events back. */
  const age = () => q("UPDATE camera_events SET created_at = created_at - interval '1 minute'");

  it("shows the secret once, stores only its hash, and hides the relay URL from non-admins", async () => {
    const { camera, secret } = await newCamera();
    expect(secret).toMatch(/^lfcam_/);
    const [row] = await q<{ secret_hash: string }>("SELECT secret_hash FROM cameras");
    expect(row!.secret_hash).toHaveLength(64);
    expect(row!.secret_hash).not.toContain(secret);
    expect((await api("GET", `/farms/${farm.anna}/cameras`)).data[0]).toMatchObject({ id: camera.id, relayUrl: RELAY, hasRelay: true });
    expect(JSON.stringify((await api("GET", `/farms/${farm.anna}/cameras`)).data)).not.toContain("lfcam_");

    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/cameras`)).data[0]).toMatchObject({ relayUrl: null, hasRelay: true });
    as = "pfleger";
    expect((await api("POST", `/farms/${farm.anna}/cameras`, { name: "X", cooldownSeconds: 300 })).status).toBe(403);
    expect((await api("POST", `/farms/${farm.anna}/cameras/${camera.id}/secret`)).status).toBe(403);
  });

  it("refuses relay addresses in a private network", async () => {
    const res = await api("POST", `/farms/${farm.anna}/cameras`, { name: "X", relayUrl: "http://192.168.178.40/relay/0?turn=on", cooldownSeconds: 300 });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/Heimnetz/);
  });

  it("does nothing without a valid secret – no AI request, no upload", async () => {
    await newCamera();
    expect((await api("POST", "/webhooks/camera", { image: PHOTO })).status).toBe(401);
    expect((await send("lfcam_falsch")).status).toBe(401);
    expect(runModelChain).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("raises the alarm on a confident predator: relay, push to every member, event with photo", async () => {
    const { camera, secret } = await newCamera();
    runModelChain.mockResolvedValueOnce({ predatorDetected: true, species: "Fuchs", confidence: 0.91 });
    const res = await send(secret);
    expect(res.data).toMatchObject({ predatorDetected: true, species: "Fuchs", confidence: 0.91, alarm: true, relayTriggered: true });
    expect(relayCalls).toEqual([RELAY]);
    expect(sendPushToUser.mock.calls.map(([u]) => u).sort()).toEqual(["anna", "gast", "pfleger"]);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({ title: "Wildtier-Alarm: Fuchs", url: "/farm/kameras" });

    const events = (await api("GET", `/farms/${farm.anna}/camera-events`)).data;
    expect(events).toEqual([
      expect.objectContaining({ cameraId: camera.id, cameraName: "Hühnerstall", imageUrl: expect.stringContaining("cloudinary"), relayTriggered: true }),
    ]);
  });

  it("keeps quiet during the cooldown and below 70 % confidence, but stores every event", async () => {
    const { secret } = await newCamera();
    runModelChain.mockResolvedValue({ predatorDetected: true, species: "Marder", confidence: 0.95 });
    await send(secret);
    await age();
    const second = await send(secret);
    expect(second.data).toMatchObject({ predatorDetected: true, alarm: false, relayTriggered: false });

    await q("UPDATE cameras SET last_triggered_at = now() - interval '10 minutes'");
    await age();
    runModelChain.mockResolvedValue({ predatorDetected: true, species: "Katze", confidence: 0.5 });
    expect((await send(secret)).data).toMatchObject({ alarm: false });
    expect(relayCalls).toHaveLength(1);
    expect(sendPushToUser).toHaveBeenCalledTimes(3);
    expect((await api("GET", `/farms/${farm.anna}/camera-events`)).data).toHaveLength(3);
  });

  it("throttles a camera sending too fast – without asking the AI", async () => {
    const { secret } = await newCamera();
    runModelChain.mockResolvedValue({ predatorDetected: false, species: null, confidence: 0.1 });
    expect((await send(secret)).status).toBe(200);
    expect((await send(secret)).status).toBe(429);
    expect(runModelChain).toHaveBeenCalledTimes(1);
  });

  it("takes a raw JPEG body and refuses anything else", async () => {
    const { secret } = await newCamera();
    runModelChain.mockResolvedValue({ predatorDetected: false, species: null, confidence: 0 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect((await api("POST", "/webhooks/camera", jpeg, { Authorization: `Bearer ${secret}`, "Content-Type": "image/jpeg" })).status).toBe(200);
    expect(uploadImage.mock.calls[0]![0]).toMatch(/^data:image\/jpeg;base64,/);
    expect((await send(secret, { image: "nicht base64!" })).status).toBe(400);
    expect((await api("POST", "/webhooks/camera", "<html>", { Authorization: `Bearer ${secret}`, "Content-Type": "text/html" })).status).toBe(400);
  });

  it("stops the old secret at once when a new one is made", async () => {
    const { camera, secret } = await newCamera();
    const rotated = (await api("POST", `/farms/${farm.anna}/cameras/${camera.id}/secret`)).data;
    expect(rotated.secret).not.toBe(secret);
    runModelChain.mockResolvedValue({ predatorDetected: false, species: null, confidence: 0 });
    expect((await send(secret)).status).toBe(401);
    expect((await send(rotated.secret)).status).toBe(200);
  });

  it("keeps farms apart and deletes a camera with its events", async () => {
    const { camera, secret } = await newCamera();
    runModelChain.mockResolvedValue({ predatorDetected: false, species: null, confidence: 0 });
    await send(secret);
    as = "bert";
    expect((await api("GET", `/farms/${farm.bert}/cameras`)).data).toEqual([]);
    expect((await api("GET", `/farms/${farm.bert}/camera-events`)).data).toEqual([]);
    expect((await api("PATCH", `/farms/${farm.bert}/cameras/${camera.id}`, { name: "Weg", cooldownSeconds: 60 })).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/cameras/${camera.id}`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/cameras/${camera.id}/secret`)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.anna}/cameras`)).status).toBe(404);

    as = "anna";
    expect((await api("DELETE", `/farms/${farm.anna}/cameras/${camera.id}`)).status).toBe(204);
    expect(await q("SELECT id FROM camera_events")).toEqual([]);
  });
});
