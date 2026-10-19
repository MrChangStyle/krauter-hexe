/**
 * Futterplaner (step 1) against a REAL Postgres, through the HTTP routes: own
 * feeds, rations for an animal and a herd, the check, the warnings that
 * cannot be dismissed (toxic plant, foreign mineral feed, withdrawal period),
 * roles and isolation.
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

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Futterplaner (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  const ids = { hens: 0, sheep: 0, lamm: 0, hase: 0 };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const { default: router } = await import("../routes/feed");
    const app = express();
    app.use(express.json());
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
    await q("TRUNCATE farms, farm_memberships, users, plants RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true)`);
    const [a, b] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna'), ('Hof Bert') RETURNING id");
    farm.anna = a!.id;
    farm.bert = b!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($2, 'bert', 'admin'), ($1, 'gast', 'guest')`, [farm.anna, farm.bert]);
    const [h] = await q<{ id: number }>(`INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Legehennen', 'poultry') RETURNING id`, [farm.anna]);
    ids.hens = h!.id;
    await q(
      `INSERT INTO farm_animals (farm_id, herd_id, name, species, registration_number, archived_at)
       VALUES ($1, $2, 'Berta', 'poultry', 'H1', NULL), ($1, $2, 'Frieda', 'poultry', 'H2', NULL), ($1, $2, 'Alte', 'poultry', 'H3', now())`,
      [farm.anna, ids.hens],
    );
    const [s, l, k] = await q<{ id: number }>(
      `INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Wolke', 'sheep', 'S1'), ($1, 'Lämmchen', 'sheep', 'S2'), ($1, 'Hoppel', 'rabbit', 'K1') RETURNING id`,
      [farm.anna],
    );
    ids.sheep = s!.id;
    ids.lamm = l!.id;
    ids.hase = k!.id;
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
  const ration = (body: object, farmId = farm.anna) => api("PUT", `/farms/${farmId}/rations`, body);

  it("checks a herd's ration per animal and adds up for the group", async () => {
    const res = await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 80 }, { feedKey: "koernermix", grams: 40 }], times: ["abends", "morgens"] });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      target: { kind: "herd", name: "Legehennen", species: "poultry", count: 2 },
      stage: "laying",
      times: ["morgens", "abends"],
      need: { dmIntakeKg: 0.105, waterL: 0.25 },
      group: { feedKg: 0.24, waterL: 0.5 },
      warnings: [],
    });
    expect(res.data.checks.find((c: any) => c.nutrient === "calcium")).toMatchObject({ status: "low", severe: true, tip: expect.stringMatching(/Muschelkalk/) });
    // Saving again replaces the ration instead of adding a second one.
    await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"] });
    const list = (await api("GET", `/farms/${farm.anna}/rations`)).data;
    expect(list).toHaveLength(1);
    expect(list[0].checks.every((c: any) => c.status === "ok")).toBe(true);
    expect((await ration({ herdId: ids.hens, stage: "lactation", items: [{ feedKey: "legehennen", grams: 120 }], times: [] })).status).toBe(400);
    expect((await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "gibtsnicht", grams: 120 }], times: [] })).status).toBe(400);
    expect((await ration({ herdId: ids.hens, stage: "laying", items: [], times: [] })).status).toBe(400);
  });

  it("warns, without a way to dismiss it, about foreign mineral feed and copper for sheep", async () => {
    const res = await ration({ animalId: ids.sheep, stage: "maintenance", items: [{ feedKey: "heu", grams: 1700 }, { feedKey: "mineral_rind", grams: 20 }], times: ["morgens"] });
    expect(res.data.warnings.map((w: any) => w.kind)).toEqual(["foreignMineral", "copper"]);
    expect(res.data.warnings[0].text).toMatch(/für Rinder gemacht, nicht für Schafe – zu viel Kupfer ist für Schafe giftig/);
  });

  it("warns about a plant the archive marks poisonous for the species", async () => {
    await q(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details, animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits, animals)
       VALUES ('Eibe', 'Taxus baccata L.', 'poisonous', 'poisonous', 'poisonous', '', '', '', '', '', $1)`,
      [JSON.stringify({ rabbit: { status: "poisonous", toxicityLevel: "high", toxicityDetails: "Taxin – schon kleine Mengen tödlich" } })],
    );
    const feed = await api("POST", `/farms/${farm.anna}/feeds`, {
      name: "Heckenschnitt",
      category: "fresh",
      dryMatter: 40,
      label: { crudeProtein: 4, crudeFat: 1, crudeFibre: 12, calcium: 0.3, phosphorus: 0.1 },
      botanicalName: "Taxus baccata",
    });
    expect(feed.status).toBe(201);
    const res = await ration({ animalId: ids.hase, stage: "maintenance", items: [{ feedKey: "heu", grams: 120 }, { feedId: feed.data.id, grams: 10 }], times: ["morgens"] });
    expect(res.data.warnings).toEqual([{ kind: "toxic", text: "Heckenschnitt ist laut Pflanzenarchiv giftig für Kaninchen: Taxin – schon kleine Mengen tödlich" }]);
    // A feed in a ration cannot be deleted.
    expect((await api("DELETE", `/farms/${farm.anna}/feeds/${feed.data.id}`)).status).toBe(409);
  });

  it("shows a running withdrawal period from the health record", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await q(
      `INSERT INTO medical_records (farm_id, animal_id, date, diagnosis, medication, withdrawal_period_days) VALUES ($1, $2, $3, 'Moderhinke', 'Oxytetracyclin', 14), ($1, $2, '2020-01-01', 'Alt', 'X', 7)`,
      [farm.anna, ids.lamm, today],
    );
    const res = await ration({ animalId: ids.lamm, stage: "growth", items: [{ feedKey: "heu", grams: 800 }, { feedKey: "mineral_schaf", grams: 10 }], times: ["morgens"] });
    expect(res.data.warnings).toHaveLength(1);
    expect(res.data.warnings[0]).toMatchObject({ kind: "withdrawal", text: expect.stringMatching(/^Lämmchen: Wartezeit nach Oxytetracyclin bis/) });
  });

  it("keeps own feeds as values per kg dry matter", async () => {
    const res = await api("POST", `/farms/${farm.anna}/feeds`, {
      name: "Mein Legemehl",
      category: "compound",
      dryMatter: 88,
      label: { crudeProtein: 16.5, crudeFat: 4.4, crudeFibre: 4, calcium: 3.6, phosphorus: 0.5, copper: 15 },
      forSpecies: ["poultry"],
    });
    expect(res.data).toMatchObject({ name: "Mein Legemehl", values: { dryMatter: 88, crudeProtein: 18.75, calcium: 40.91 }, forSpecies: ["poultry"] });
    expect((await api("POST", `/farms/${farm.anna}/feeds`, { name: "X", category: "compound", dryMatter: 88, label: { crudeProtein: 60, crudeFat: 30, crudeFibre: 10, calcium: 1, phosphorus: 1 } })).status).toBe(400);
    expect((await api("GET", `/farms/${farm.anna}/feeds`)).data).toHaveLength(1);
    expect((await api("DELETE", `/farms/${farm.anna}/feeds/${res.data.id}`)).status).toBe(204);
  });

  it("lets guests read, keeps farms apart", async () => {
    await ration({ animalId: ids.hase, stage: "maintenance", items: [{ feedKey: "heu", grams: 120 }], times: [] });
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/rations`)).data).toHaveLength(1);
    expect((await ration({ animalId: ids.hase, stage: "maintenance", items: [{ feedKey: "heu", grams: 100 }], times: [] })).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/rations`)).status).toBe(404);
    // His farm cannot feed Anna's rabbit.
    expect((await ration({ animalId: ids.hase, stage: "maintenance", items: [{ feedKey: "heu", grams: 100 }], times: [] }, farm.bert)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.bert}/rations`)).data).toEqual([]);
  });
});
