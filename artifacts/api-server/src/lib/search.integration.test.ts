/**
 * Suche against a REAL Postgres, through the HTTP route: archive for everyone,
 * farm data only for members and only from granted modules.
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

describe.skipIf(!enabled)("Suche (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let farmId = 0;

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/search")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users, plants, insects RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('carl', 'c@x.de', true), ('bert', 'b@x.de', true)`);
    for (const [german, botanical] of [["Wilde Tomate", "Solanum pimpinellifolium"], ["Tomate", "Solanum lycopersicum"], ["Brennnessel", "Urtica dioica"]]) {
      await q(
        `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits)
         VALUES ($1, $2, 'medicinal', 'edible', 'safe', '', '', '', '', '')`,
        [german, botanical],
      );
    }
    await q(`INSERT INTO insects (german_name, scientific_name, category, relation_status, description) VALUES ('Tomatenminiermotte', 'Tuta absoluta', 'beetle', 'neutral', '')`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof') RETURNING id");
    farmId = f!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role, modules) VALUES ($1, 'anna', 'admin', null), ($1, 'carl', 'caretaker', '["feed"]')`, [farmId]);
    await q(`INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Tomte', 'goat', 'DE-TOM-1')`, [farmId]);
    await q(`INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Tomatenbeet', 'raised', 200, 100)`, [farmId]);
    await q(`INSERT INTO medicines (farm_id, name, unit, amount) VALUES ($1, 'Tomaten-Salbe', 'g', 10)`, [farmId]);
    await q(`INSERT INTO farm_contacts (farm_id, kind, name, role) VALUES ($1, 'vet', 'Dr. Tom', 'Tierarzt')`, [farmId]);
    as = "anna";
  });

  const find = async (text: string, farm?: number | string) => {
    const res = await fetch(`${base}/search?q=${encodeURIComponent(text)}${farm !== undefined ? `&farmId=${farm}` : ""}`);
    return { status: res.status, data: (await res.json()) as { groups: { kind: string; items: { title: string; href: string }[] }[] } };
  };
  const kinds = (r: Awaited<ReturnType<typeof find>>) => r.data.groups.map((g) => g.kind);

  it("finds the archive and the farm in one go, names that start with the query first", async () => {
    const r = await find("tom", farmId);
    expect(kinds(r)).toEqual(["plants", "insects", "animals", "beds", "medicines", "contacts"]);
    expect(r.data.groups[0]!.items.map((i) => i.title)).toEqual(["Tomate", "Wilde Tomate"]);
    expect(r.data.groups.find((g) => g.kind === "animals")!.items[0]).toMatchObject({ title: "Tomte", href: `/farm/${farmId}/tier/1` });
    // By registration number and botanical name too.
    expect(kinds(await find("DE-TOM", farmId))).toEqual(["animals"]);
    expect((await find("urtica")).data.groups[0]!.items[0]!.title).toBe("Brennnessel");
  });

  it("keeps the farm to its members and their granted modules", async () => {
    as = "carl";
    expect(kinds(await find("tom", farmId))).toEqual(["plants", "insects", "animals", "contacts"]);
    as = "bert";
    expect(kinds(await find("tom", farmId))).toEqual(["plants", "insects"]);
  });

  it("finds active bee colonies with the Bienen grant", async () => {
    await q(`INSERT INTO bee_colonies (farm_id, name, apiary, status) VALUES ($1, 'Lindenvolk', 'Obstwiese', 'active'), ($1, 'Lindenalt', null, 'lost')`, [farmId]);
    const bees = (await find("linden", farmId)).data.groups.find((g) => g.kind === "bees");
    expect(bees?.items).toEqual([{ title: "Lindenvolk", subtitle: "Obstwiese", href: expect.stringMatching(/^\/farm\/bienen\/\d+$/) }]);
    as = "carl";
    expect(kinds(await find("linden", farmId))).not.toContain("bees");
  });

  it("ignores too short queries, wildcards and odd farm ids", async () => {
    expect((await find("t")).data.groups).toEqual([]);
    expect((await find("%")).data.groups).toEqual([]);
    expect((await find("_o")).data.groups).toEqual([]);
    expect((await find("tom", "1.5")).status).toBe(200);
    expect(kinds(await find("tom", "1.5"))).toEqual(["plants", "insects"]);
  });
});
