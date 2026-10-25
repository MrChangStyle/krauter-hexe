/**
 * "Meine Farm" step 3 against a REAL Postgres, through the HTTP routes:
 * herds and animals, roles, isolation between farms, archive instead of
 * delete. Photo upload to Cloudinary is not exercised here (no credentials);
 * its validation is.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Meine Farm – herds and animals (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/farm-animals");
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
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
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`,
      [farm.anna, farm.bert],
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

  const animal = (overrides: Record<string, unknown> = {}) => ({
    name: "Lotte",
    species: "goat",
    breed: "Bunte Deutsche Edelziege",
    birthDate: "2023-04-12",
    sex: "female",
    registrationNumber: "DE 01 234 56789",
    ...overrides,
  });

  it("creates a herd and an animal in it, and lists them", async () => {
    const herd = await api("POST", `/farms/${farm.anna}/herds`, { name: "Ziegen", species: "goat" });
    expect(herd.status).toBe(201);
    const created = await api("POST", `/farms/${farm.anna}/animals`, animal({ herdId: herd.data.id }));
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ name: "Lotte", herdName: "Ziegen", birthDate: "2023-04-12", archivedAt: null });

    expect((await api("GET", `/farms/${farm.anna}/herds`)).data).toEqual([
      { id: herd.data.id, name: "Ziegen", species: "goat", notes: null, animalCount: 1 },
    ]);
    expect((await api("GET", `/farms/${farm.anna}/animals`)).data).toHaveLength(1);
  });

  it("keeps farms apart: no reading, no writing, no herd from another farm", async () => {
    const lotte = await api("POST", `/farms/${farm.anna}/animals`, animal());
    const annasHerd = await api("POST", `/farms/${farm.anna}/herds`, { name: "Ziegen", species: "goat" });
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/animals`)).status).toBe(404);
    // Bert's own farm does not reveal Anna's animal by id …
    expect((await api("GET", `/farms/${farm.bert}/animals/${lotte.data.id}`)).status).toBe(404);
    expect((await api("PATCH", `/farms/${farm.bert}/animals/${lotte.data.id}`, animal({ name: "Geklaut" }))).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/animals/${lotte.data.id}/archive`, { archived: true })).status).toBe(404);
    // … and cannot put his animal into Anna's herd.
    const smuggle = await api("POST", `/farms/${farm.bert}/animals`, animal({ herdId: annasHerd.data.id }));
    expect(smuggle.status).toBe(400);
    expect(await q("SELECT name FROM farm_animals WHERE farm_id = $1", [farm.anna])).toEqual([{ name: "Lotte" }]);
  });

  it("lets guests read but not write", async () => {
    await api("POST", `/farms/${farm.anna}/animals`, animal());
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/animals`)).data).toHaveLength(1);
    expect((await api("POST", `/farms/${farm.anna}/animals`, animal({ registrationNumber: "X2" }))).status).toBe(403);
    expect((await api("POST", `/farms/${farm.anna}/herds`, { name: "H", species: "goat" })).status).toBe(403);
  });

  it("refuses a registration number twice on the same farm, but allows it on another", async () => {
    expect((await api("POST", `/farms/${farm.anna}/animals`, animal())).status).toBe(201);
    const twice = await api("POST", `/farms/${farm.anna}/animals`, animal({ name: "Zweite" }));
    expect(twice.status).toBe(409);
    expect(twice.data.error).toMatch(/gibt es auf der Farm schon/);
    as = "bert";
    expect((await api("POST", `/farms/${farm.bert}/animals`, animal())).status).toBe(201);
  });

  it("creates an animal without name, ring or ear tag and photo, and keeps the name when edited without one", async () => {
    const path = `/farms/${farm.anna}/animals`;
    const bare = { species: "goat", birthDate: "2024-03-01", sex: "female" };
    const first = await api("POST", path, bare);
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ name: "Ziege 1", registrationNumber: null, imageUrl: null });
    // Blank counts as none; several animals may be without a tag; the next free number is taken.
    await q("UPDATE farm_animals SET name = 'Ziege 2' WHERE id = $1", [first.data.id]);
    expect((await api("POST", path, { ...bare, name: "  ", registrationNumber: " " })).data).toMatchObject({ name: "Ziege 1", registrationNumber: null });
    expect((await api("POST", path, { ...bare, species: "poultry" })).data.name).toBe("Huhn 1");
    // Editing without a name keeps the one it has; a tag can be added later.
    const edited = await api("PATCH", `${path}/${first.data.id}`, { ...bare, name: null, registrationNumber: "DE 01 999" });
    expect(edited.data).toMatchObject({ name: "Ziege 2", registrationNumber: "DE 01 999" });
  });

  it("validates input", async () => {
    const path = `/farms/${farm.anna}/animals`;
    expect((await api("POST", path, animal({ birthDate: "2999-01-01" }))).data.error).toMatch(/Zukunft/);
    expect((await api("POST", path, animal({ birthDate: "2023-02-30" }))).data.error).toMatch(/ungültig/);
    expect((await api("POST", path, animal({ name: "x".repeat(61) }))).status).toBe(400);
    expect((await api("POST", path, animal({ species: "dragon" }))).status).toBe(400);
    expect((await api("POST", path, animal({ registrationNumber: "x".repeat(41) }))).status).toBe(400);
  });

  it("archives instead of deleting and restores again", async () => {
    const lotte = await api("POST", `/farms/${farm.anna}/animals`, animal());
    const archived = await api("POST", `/farms/${farm.anna}/animals/${lotte.data.id}/archive`, { archived: true });
    expect(archived.data.archivedAt).not.toBeNull();
    // Still listed (the app shows archived ones on request) and not counted in its herd.
    expect((await api("GET", `/farms/${farm.anna}/animals`)).data).toHaveLength(1);
    const restored = await api("POST", `/farms/${farm.anna}/animals/${lotte.data.id}/archive`, { archived: false });
    expect(restored.data.archivedAt).toBeNull();
  });

  it("keeps animals when their herd is deleted", async () => {
    const herd = await api("POST", `/farms/${farm.anna}/herds`, { name: "Hühner", species: "poultry" });
    const henne = await api("POST", `/farms/${farm.anna}/animals`, animal({ species: "poultry", herdId: herd.data.id }));
    expect((await api("DELETE", `/farms/${farm.anna}/herds/${herd.data.id}`)).status).toBe(204);
    expect((await api("GET", `/farms/${farm.anna}/animals/${henne.data.id}`)).data).toMatchObject({ herdId: null, herdName: null });
  });

  it("rejects anything but a photo before trying to upload", async () => {
    const lotte = await api("POST", `/farms/${farm.anna}/animals`, animal());
    for (const imageData of ["data:text/html;base64,PHNjcmlwdD4=", "https://example.org/x.jpg", "data:image/svg+xml;base64,PHN2Zz4="]) {
      expect((await api("PUT", `/farms/${farm.anna}/animals/${lotte.data.id}/photo`, { imageData })).status).toBe(400);
    }
  });
});
