/**
 * Fundorte (docs/fundorte.md) against a REAL Postgres, through the HTTP routes:
 * nothing without consent, only own scans, cells instead of positions,
 * protected species coarse, saying no and deleting the account remove the finds.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Fundorte (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let plantId = 0;
  let orchidId = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: false };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/settings")).default);
    app.use((await import("../routes/find-spots")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  const plant = async (name: string) =>
    (
      await q<{ id: number }>(
        `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status,
           edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
         VALUES ($1, $1, 'medicinal', 'edible', 'safe', '', '', '', '', '') RETURNING id`,
        [name],
      )
    )[0]!.id;

  beforeEach(async () => {
    await q("TRUNCATE users, user_settings, find_spots, plant_scans, plants, insect_scans, insects RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'anna@x.de', true), ('bert', 'bert@x.de', true)`);
    plantId = await plant("Urtica dioica");
    orchidId = await plant("Ophrys apifera");
    await q(`INSERT INTO plant_scans (user_id, plant_id) VALUES ('anna', $1), ('anna', $2), ('bert', $1)`, [plantId, orchidId]);
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
  const find = (speciesId: number, lat = 47.8723, lon = 12.1189) => api("POST", "/find-spots", { kind: "plant", speciesId, lat, lon });
  const map = (speciesId: number) => api("GET", `/find-spots?kind=plant&speciesId=${speciesId}`);

  it("stores nothing without a yes, and only the cell, never the position", async () => {
    expect((await find(plantId)).data).toEqual({ saved: false });
    expect((await api("PUT", "/settings", { shareFindSpots: false })).data.shareFindSpots).toBe(false);
    expect((await find(plantId)).data).toEqual({ saved: false });
    await api("PUT", "/settings", { shareFindSpots: true });
    expect((await find(plantId)).data).toEqual({ saved: true });
    // Again in the same cell: still one point.
    expect((await find(plantId, 47.8724, 12.119)).data).toEqual({ saved: true });
    const rows = await q("SELECT * FROM find_spots");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!)).not.toContain("lat");
    const m = (await map(plantId)).data;
    expect(m).toMatchObject({ cellKm: 2, protectedSpecies: false, finds: 1 });
    expect(m.cells[0].lat).not.toBe(47.8723);
    expect(JSON.stringify(m)).not.toContain("anna");
  });

  it("only own scans go on the map", async () => {
    as = "bert";
    await api("PUT", "/settings", { shareFindSpots: true });
    expect((await find(orchidId)).data).toEqual({ saved: false });
    expect((await find(plantId)).data).toEqual({ saved: true });
  });

  it("shows protected species on the coarse grid", async () => {
    await api("PUT", "/settings", { shareFindSpots: true });
    await find(orchidId);
    expect((await map(orchidId)).data).toMatchObject({ cellKm: 25, protectedSpecies: true, finds: 1 });
  });

  it("saying no removes the own finds, the others stay", async () => {
    await api("PUT", "/settings", { shareFindSpots: true });
    await find(plantId);
    as = "bert";
    await api("PUT", "/settings", { shareFindSpots: true });
    await find(plantId, 48.14, 11.58);
    as = "anna";
    await api("PUT", "/settings", { shareFindSpots: false });
    expect((await map(plantId)).data.finds).toBe(1);
  });

  it("deleting the species removes its finds; unknown species is 404", async () => {
    await api("PUT", "/settings", { shareFindSpots: true });
    await find(plantId);
    await q("DELETE FROM plants WHERE id = $1", [plantId]);
    expect(await q("SELECT * FROM find_spots")).toEqual([]);
    expect((await map(plantId)).status).toBe(404);
    expect((await api("GET", "/find-spots?kind=plant&speciesId=abc")).status).toBe(400);
  });
  it("Archiv → Karte: all plants on one map, everyone's or only my own", async () => {
    for (const who of ["anna", "bert"]) {
      as = who;
      await api("PUT", "/settings", { shareFindSpots: true });
    }
    as = "anna";
    await find(plantId);
    await find(orchidId);
    await find(plantId, 52.52, 13.405);
    as = "bert";
    await find(plantId);

    const all = (await api("GET", "/find-spots/overview?scope=all")).data;
    expect(all).toMatchObject({ finds: 4, species: 2 });
    // Rosenheim: nettle by both, in the same 2-km cell; the orchid only on the 25-km grid.
    const nettle = all.cells.find((c: any) => c.km === 2 && c.finds === 2);
    expect(nettle.species).toEqual([{ kind: "plant", id: plantId, name: "Urtica dioica", finds: 2 }]);
    const orchid = all.cells.find((c: any) => c.km === 25);
    expect(orchid.species).toEqual([{ kind: "plant", id: orchidId, name: "Ophrys apifera", finds: 1 }]);
    expect(all.cells).toHaveLength(3);

    as = "anna";
    const mine = (await api("GET", "/find-spots/overview?scope=mine")).data;
    expect(mine).toMatchObject({ finds: 3, species: 2 });
    // Own finds stay at their own 2-km cell, the orchid too.
    expect(mine.cells.every((c: any) => c.km === 2)).toBe(true);
    expect(mine.cells.flatMap((c: any) => c.species.map((sp: any) => sp.finds))).toEqual([1, 1, 1]);

    expect((await api("GET", "/find-spots/overview?scope=nobody")).status).toBe(400);

    // Older scans kept only the nearest town: on the own map, approximately and marked.
    const mint = await plant("Mentha aquatica");
    const thyme = await plant("Thymus vulgaris");
    await q(`UPDATE plants SET scanned_by_user_id = 'anna', location_region = 'Rosenheim' WHERE id IN ($1, $2)`, [mint, plantId]);
    await q(`UPDATE plants SET scanned_by_user_id = 'anna', location_region = 'Irgendwo' WHERE id = $1`, [thyme]);
    const withOlder = (await api("GET", "/find-spots/overview?scope=mine")).data;
    // The nettle already has a real find – no second, approximate one; the unknown place is left out.
    expect(withOlder).toMatchObject({ finds: 4, species: 3 });
    const approx = withOlder.cells.filter((c: any) => c.approx);
    expect(approx).toHaveLength(1);
    expect(approx[0]).toMatchObject({ place: "Rosenheim", lat: 47.856, lon: 12.129, species: [{ kind: "plant", id: mint, name: "Mentha aquatica", finds: 1 }] });
    // Never on the shared map.
    expect((await api("GET", "/find-spots/overview?scope=all")).data.cells.some((c: any) => c.approx)).toBe(false);

    // Insect scans too: a real find and an older one with only its town.
    const [{ id: bee }] = await q<{ id: number }>(
      `INSERT INTO insects (german_name, scientific_name, category, relation_status, description) VALUES ('Honigbiene', 'Apis mellifera', 'beetle', 'neutral', '') RETURNING id`,
    );
    const [{ id: ladybird }] = await q<{ id: number }>(
      `INSERT INTO insects (german_name, scientific_name, category, relation_status, description, scanned_by_user_id, location_region)
       VALUES ('Marienkäfer', 'Coccinella septempunctata', 'beetle', 'neutral', '', 'anna', 'Rosenheim') RETURNING id`,
    );
    await q(`INSERT INTO insect_scans (user_id, insect_id) VALUES ('anna', $1)`, [bee]);
    expect((await api("POST", "/find-spots", { kind: "insect", speciesId: bee, lat: 47.8723, lon: 12.1189 })).data).toEqual({ saved: true });
    const withInsects = (await api("GET", "/find-spots/overview?scope=mine")).data;
    expect(withInsects).toMatchObject({ finds: 6, species: 5 });
    const species = withInsects.cells.flatMap((c: any) => c.species);
    expect(species).toContainEqual({ kind: "insect", id: bee, name: "Honigbiene", finds: 1 });
    expect(withInsects.cells.find((c: any) => c.approx).species).toContainEqual({ kind: "insect", id: ladybird, name: "Marienkäfer", finds: 1 });
    expect((await api("GET", "/find-spots/overview?scope=all")).data).toMatchObject({ finds: 5, species: 3 });
  });
});
