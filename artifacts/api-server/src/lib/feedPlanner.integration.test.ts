/**
 * Futterplaner (steps 1–3) against a REAL Postgres, through the HTTP routes:
 * own feeds, rations for an animal and a herd, the check, the warnings that
 * cannot be dismissed (toxic plant, foreign mineral feed, coccidiostat,
 * withdrawal period), the label read by the (mocked) AI, summer and winter
 * rations with the step-by-step change, the feeding reminders, roles and
 * isolation.
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
const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
// "Today" for the season tests; null = the real day.
let fixedDay: string | null = null;
vi.mock("./monitoring", async (orig) => {
  const real = await orig<typeof import("./monitoring")>();
  return { ...real, berlinDay: () => fixedDay ?? real.berlinDay() };
});

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const KUEKEN_LABEL = {
  istEtikett: true,
  name: "Kükenstarter",
  art: "compound",
  tierarten: ["poultry"],
  feuchtigkeit: 12,
  werte: { rohprotein: 20, rohfett: 4, rohfaser: 3.5, calcium: 1, phosphor: 0.65, kupfer: 15 },
  zusatzstoffe: ["Vitamin D3 3000 I.E.", "Monensin-Natrium 100 mg"],
};

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
      (req as unknown as { user: unknown }).user = { id: as, approved: true, isOwner: as === "chef" };
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
    runModelChain.mockReset();
    fixedDay = null;
    await q("TRUNCATE farms, farm_memberships, users, plants, feed_recipes RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('bert', 'b@x.de', true), ('gast', 'g@x.de', true), ('chef', 'c@x.de', true)`);
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

  it("reads a label with the AI, saves nothing until confirmed, and warns about Monensin for a horse", async () => {
    runModelChain.mockResolvedValueOnce(KUEKEN_LABEL);
    const read = await api("POST", `/farms/${farm.anna}/feeds/label`, { imageData: PHOTO });
    expect(read.status).toBe(200);
    expect(read.data).toMatchObject({ name: "Kükenstarter", dryMatter: 88, forSpecies: ["poultry"], label: { crudeProtein: 20, copper: 15 }, ionophores: ["Monensin"] });
    expect(JSON.stringify(runModelChain.mock.calls[0]![0])).toContain("Etikett");
    expect((await api("GET", `/farms/${farm.anna}/feeds`)).data).toEqual([]);
    // The user confirms the values: saved like any own feed, with the additives.
    const saved = await api("POST", `/farms/${farm.anna}/feeds`, {
      name: read.data.name,
      category: read.data.category,
      dryMatter: read.data.dryMatter,
      label: read.data.label,
      forSpecies: read.data.forSpecies,
      additives: read.data.additives,
    });
    expect(saved.data).toMatchObject({ additives: ["Vitamin D3 3000 I.E.", "Monensin-Natrium 100 mg"], values: { crudeProtein: 22.73 } });
    const [pony] = await q<{ id: number }>(`INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Pony', 'horse', 'P1') RETURNING id`, [farm.anna]);
    const horse = await ration({ animalId: pony!.id, stage: "maintenance", items: [{ feedKey: "heu", grams: 9000 }, { feedId: saved.data.id, grams: 200 }], times: ["morgens"] });
    expect(horse.data.warnings.map((w: any) => w.kind)).toEqual(["foreignMineral", "ionophore"]);
    expect(horse.data.warnings[1].text).toBe("Kükenstarter enthält Monensin (Kokzidiostatikum) – schon kleine Mengen sind für Pferde tödlich.");
    // The chicks it is made for get no warning.
    const hens = await ration({ herdId: ids.hens, stage: "growth", items: [{ feedId: saved.data.id, grams: 60 }], times: ["morgens"] });
    expect(hens.data.warnings).toEqual([]);
  });

  it("answers 422 without a label and keeps reading the label to caretakers", async () => {
    runModelChain.mockResolvedValueOnce({ istEtikett: false });
    expect((await api("POST", `/farms/${farm.anna}/feeds/label`, { imageData: PHOTO })).status).toBe(422);
    expect((await api("POST", `/farms/${farm.anna}/feeds/label`, { imageData: "data:text/plain;base64,AAAA" })).status).toBe(400);
    as = "gast";
    expect((await api("POST", `/farms/${farm.anna}/feeds/label`, { imageData: PHOTO })).status).toBe(403);
    expect(runModelChain).toHaveBeenCalledTimes(1);
  });

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

  it("asks for more feed when the forecast at the farm gets colder than the animals cope with", async () => {
    fixedDay = "2027-01-10";
    // Bright Sky: −6 °C the night after, otherwise mild.
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("https://api.brightsky.dev/weather")) return realFetch(input, init);
      const weather = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
        const d = new Date("2027-01-10T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + i);
        const date = d.toISOString().slice(0, 10);
        return Array.from({ length: 24 }, (_, h) => ({ timestamp: `${date}T${String(h).padStart(2, "0")}:00:00+01:00`, temperature: h === 4 && i === 1 ? -6 : 4, precipitation: 0, wind_gust_speed: 10, icon: "cloudy" }));
      });
      return Promise.resolve(new Response(JSON.stringify({ weather })));
    });
    try {
      const hens = await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"] });
      // No location yet: nothing about the cold.
      expect(hens.data.cold).toBeNull();
      await q("UPDATE farms SET latitude = 47.3, longitude = 11.4 WHERE id = $1", [farm.anna]);
      const list = (await api("GET", `/farms/${farm.anna}/rations`)).data;
      // Hens: limit 5 °C, −6 °C → 11 % more.
      expect(list[0].cold).toEqual({
        date: "2027-01-11",
        minTemp: -6,
        percent: 11,
        extra: [{ name: expect.any(String), grams: 13 }],
        text: expect.stringMatching(/^Kälte bis −6 °C: etwa 11 % mehr Körner und Legefutter: \+13 g .* je Tier und Tag\.$/),
      });
    } finally {
      vi.stubGlobal("fetch", realFetch);
    }
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

  it("switches to the winter ration step by step at the end of October", async () => {
    fixedDay = "2026-10-10";
    const all = await ration({ animalId: ids.hase, stage: "maintenance", items: [{ feedKey: "heu", grams: 120 }, { feedKey: "kaninchenpellets", grams: 20 }], times: ["morgens"] });
    // October: no more advice to start a summer ration.
    expect(all.data).toMatchObject({ season: "all", active: true, transition: null, hints: [] });
    const winter = await ration({ animalId: ids.hase, season: "winter", stage: "winter", items: [{ feedKey: "heu", grams: 140 }, { feedKey: "moehre", grams: 40 }], times: ["morgens"] });
    expect(winter.data).toMatchObject({ season: "winter", active: false, transition: null, hints: [] });

    fixedDay = "2026-10-25";
    const list = (await api("GET", `/farms/${farm.anna}/rations`)).data;
    const now = list.find((r: any) => r.season === "all");
    expect(now.transition).toEqual({
      reason: "season",
      toSeason: "winter",
      startedOn: "2026-10-22",
      endsOn: "2026-10-31",
      days: 10,
      day: 4,
      newShare: 0.5,
      phases: [
        { fromDay: 1, toDay: 3, newShare: 0.25 },
        { fromDay: 4, toDay: 5, newShare: 0.5 },
        { fromDay: 6, toDay: 8, newShare: 0.75 },
        { fromDay: 9, toDay: 10, newShare: 1 },
      ],
      items: [{ name: "Wiesenheu", grams: 130 }, { name: "Möhren", grams: 20 }, { name: "Kaninchen-Alleinfutter (Pellets)", grams: 10 }],
    });

    fixedDay = "2026-11-02";
    const later = (await api("GET", `/farms/${farm.anna}/rations`)).data;
    expect(later.map((r: any) => [r.season, r.active, r.transition])).toEqual([["all", false, null], ["winter", true, null]]);
    expect(later[1].hints).toEqual([expect.stringMatching(/Bei Frost/)]);
  });

  it("spreads a change of feeds over some days, unless told not to", async () => {
    fixedDay = "2026-12-01";
    await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"] });
    const changed = await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 100 }, { feedKey: "koernermix", grams: 20 }], times: ["morgens"] });
    expect(changed.data.transition).toMatchObject({ reason: "change", startedOn: "2026-12-01", days: 7, day: 1, newShare: 0.25, items: [{ name: "Legehennen-Alleinfutter", grams: 115 }, { name: "Körnermischung Geflügel", grams: 5 }] });
    // Only the amounts changed: the running change goes on.
    fixedDay = "2026-12-03";
    const tweak = await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 105 }, { feedKey: "koernermix", grams: 15 }], times: ["morgens"] });
    expect(tweak.data.transition).toMatchObject({ startedOn: "2026-12-01", day: 3, newShare: 0.5 });
    fixedDay = "2026-12-08";
    expect((await api("GET", `/farms/${farm.anna}/rations`)).data[0].transition).toBeNull();
    const now = await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"], gradual: false });
    expect(now.data.transition).toBeNull();
  });

  it("turns the ration in effect into daily feeding reminders and keeps them up to date", async () => {
    fixedDay = "2026-12-01";
    const hens = await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }, { feedKey: "koernermix", grams: 20 }], times: ["morgens", "abends"] });
    expect((await api("POST", `/farms/${farm.anna}/rations/${hens.data.id}/reminders`)).data).toEqual({ created: 2, updated: 0, paused: 0 });
    // Again: nothing doubled.
    expect((await api("POST", `/farms/${farm.anna}/rations/${hens.data.id}/reminders`)).data).toEqual({ created: 0, updated: 2, paused: 0 });
    const tasks = () => q<{ reminder_time: string; notes: string; is_active: boolean; herd_id: number; interval_value: number }>("SELECT reminder_time, notes, is_active, herd_id, interval_value FROM farm_tasks ORDER BY reminder_time");
    expect(await tasks()).toEqual([
      { reminder_time: "07:00", notes: "Futterplaner (je Tier und Fütterung): Legehennen-Alleinfutter 60 g, Körnermischung Geflügel 10 g", is_active: true, herd_id: ids.hens, interval_value: 1 },
      { reminder_time: "18:00", notes: "Futterplaner (je Tier und Fütterung): Legehennen-Alleinfutter 60 g, Körnermischung Geflügel 10 g", is_active: true, herd_id: ids.hens, interval_value: 1 },
    ]);
    // Saving the ration refreshes the notes; a dropped feeding time is paused.
    await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"], gradual: false });
    expect((await tasks()).map((t) => [t.reminder_time, t.notes, t.is_active])).toEqual([
      ["07:00", "Futterplaner (je Tier und Fütterung): Legehennen-Alleinfutter 120 g", true],
      ["18:00", "Futterplaner (je Tier und Fütterung): Legehennen-Alleinfutter 60 g, Körnermischung Geflügel 10 g", false],
    ]);
    // A change of feed: the note points to the plan, a reminder switched off stays off.
    await q("UPDATE farm_tasks SET is_active = false WHERE reminder_time = '07:00'");
    await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 100 }, { feedKey: "muschelkalk", grams: 5 }], times: ["morgens"] });
    expect((await tasks()).map((t) => [t.reminder_time, t.notes, t.is_active])[0]).toEqual([
      "07:00",
      "Futterplaner: Umstellung bis 07.12. – die Mengen für heute stehen im Futterplaner.",
      false,
    ]);
    // Only for the ration in effect, only for caretakers.
    const summer = await ration({ herdId: ids.hens, season: "summer", stage: "laying", items: [{ feedKey: "legehennen", grams: 110 }], times: ["morgens"] });
    expect((await api("POST", `/farms/${farm.anna}/rations/${summer.data.id}/reminders`)).status).toBe(409);
    as = "gast";
    expect((await api("POST", `/farms/${farm.anna}/rations/${hens.data.id}/reminders`)).status).toBe(403);
    expect((await ration({ herdId: ids.hens, season: "herbst", stage: "laying", items: [{ feedKey: "legehennen", grams: 110 }], times: [] })).status).toBe(403);
    as = "anna";
    expect((await ration({ herdId: ids.hens, season: "herbst", stage: "laying", items: [{ feedKey: "legehennen", grams: 110 }], times: [] })).status).toBe(400);
  });

  it("refreshes the reminder when the winter ration takes over", async () => {
    fixedDay = "2026-10-10";
    const all = await ration({ animalId: ids.sheep, stage: "maintenance", items: [{ feedKey: "heu", grams: 1800 }], times: ["morgens"] });
    await api("POST", `/farms/${farm.anna}/rations/${all.data.id}/reminders`);
    await ration({ animalId: ids.sheep, season: "winter", stage: "winter", items: [{ feedKey: "heu", grams: 1600 }, { feedKey: "futterruebe", grams: 1500 }], times: ["morgens"] });
    const note = async () => (await q<{ notes: string }>("SELECT notes FROM farm_tasks"))[0]!.notes;
    expect(await note()).toBe("Futterplaner (je Tier und Fütterung): Wiesenheu 1,8 kg");
    fixedDay = "2026-10-20";
    await api("GET", `/farms/${farm.anna}/rations`);
    expect(await note()).toBe("Futterplaner: Umstellung bis 31.10. – die Mengen für heute stehen im Futterplaner.");
    fixedDay = "2026-11-05";
    await api("GET", `/farms/${farm.anna}/rations`);
    expect(await note()).toBe("Futterplaner (je Tier und Fütterung): Wiesenheu 1,6 kg, Futterrüben 1,5 kg");
  });

  it("keeps the stock, says when to buy more, adds costs and plans the winter", async () => {
    fixedDay = "2026-10-09";
    await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"] });
    await ration({ animalId: ids.hase, stage: "maintenance", items: [{ feedKey: "heu", grams: 120 }, { feedKey: "moehre", grams: 50 }], times: ["morgens"] });
    await ration({ animalId: ids.hase, season: "winter", stage: "winter", items: [{ feedKey: "heu", grams: 140 }, { feedKey: "moehre", grams: 80 }], times: ["morgens"] });
    const empty = (await api("GET", `/farms/${farm.anna}/feed-stock`)).data;
    expect(empty.stocks.map((s: any) => [s.name, s.status])).toEqual([
      ["Legehennen-Alleinfutter", "unknown"],
      ["Möhren", "unknown"],
      ["Wiesenheu", "unknown"],
    ]);
    // Two sacks of 25 kg for 18 € each: 0,72 €/kg.
    const bought = (await api("POST", `/farms/${farm.anna}/feed-stock/purchase`, { feedKey: "legehennen", packages: 2, packageKg: 25, pricePerPackage: 18 })).data;
    expect(bought.stocks.find((s: any) => s.feedKey === "legehennen")).toMatchObject({ stockKg: 50, packageKg: 25, pricePerKg: 0.72, dailyKg: 0.24, daysLeft: 208, status: "ok" });
    // Ten days later: 2,4 kg eaten; counting sets the stock, a purchase adds to what is left.
    fixedDay = "2026-10-19";
    expect((await api("GET", `/farms/${farm.anna}/feed-stock`)).data.stocks.find((s: any) => s.feedKey === "legehennen").stockKg).toBe(47.6);
    await api("PUT", `/farms/${farm.anna}/feed-stock`, { feedKey: "heu", stockKg: 1.5, packageKg: 12.5, pricePerPackage: 5 });
    const after = (await api("POST", `/farms/${farm.anna}/feed-stock/purchase`, { feedKey: "legehennen", packages: 1, packageKg: 25 })).data;
    expect(after.stocks.find((s: any) => s.feedKey === "legehennen")).toMatchObject({ stockKg: 72.6, pricePerKg: 0.72, countedOn: "2026-10-19" });
    expect(after.stocks[0]).toMatchObject({ name: "Wiesenheu", status: "soon", stockKg: 1.5, daysLeft: 12, emptyOn: "2026-10-31", reorderOn: "2026-10-24", pricePerKg: 0.4 });
    expect(after.costs).toMatchObject({
      perMonth: 6.72,
      complete: false,
      lines: [
        { target: { name: "Legehennen", count: 2 }, perAnimalMonth: 2.63, perMonth: 5.26, missingPrices: [] },
        { target: { name: "Hoppel", count: 1 }, perAnimalMonth: 1.46, perMonth: 1.46, missingPrices: ["Möhren"] },
      ],
    });
    expect(after.winter).toMatchObject({ from: "2026-11-01", to: "2027-03-31", days: 151, gardenKg: 12.1 });
    expect(after.winter.lines.find((l: any) => l.feedKey === "moehre")).toMatchObject({ neededKg: 12.1, stockKg: 0, missingKg: 12.1, gardenCrop: "moehre" });
    // The Garten-Assistent takes the winter need of storable vegetables from the rations.
    const { gardenPlan } = await import("./gardenAssistant");
    await q("INSERT INTO garden_goals (farm_id, people, animal_share, directions) VALUES ($1, 2, 30, '[\"vegetables\"]')", [farm.anna]);
    const plan = await gardenPlan(farm.anna);
    expect(plan.fodder).toMatchObject({ winterKg: 12, winterFromRations: true });
    expect(plan.tips).toContain("Laut Futterplaner brauchen deine Tiere im Winter etwa 12 kg Möhre – kühl und dunkel lagern.");

    expect((await api("PUT", `/farms/${farm.anna}/feed-stock`, { feedKey: "gibtsnicht", stockKg: 2 })).status).toBe(400);
    expect((await api("POST", `/farms/${farm.anna}/feed-stock/purchase`, { feedKey: "heu", packages: 0, packageKg: 12 })).status).toBe(400);
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/feed-stock`)).status).toBe(200);
    expect((await api("PUT", `/farms/${farm.anna}/feed-stock`, { feedKey: "heu", stockKg: 5 })).status).toBe(403);
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/feed-stock`)).status).toBe(404);
    as = "anna";
    const heuId = after.stocks[0].id;
    expect((await api("DELETE", `/farms/${farm.bert}/feed-stock/${heuId}`)).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.anna}/feed-stock/${heuId}`)).status).toBe(204);
  });

  it("shows sent-in recipes to everyone only after the owner approved them", async () => {
    const recipe = (title: string, ingredient = "Gerste") => ({
      title,
      species: ["poultry"],
      kind: "sprouts",
      ingredients: [{ name: ingredient, amount: "50 g je Huhn" }],
      steps: ["Einweichen", "Zweimal täglich spülen"],
      hygiene: ["Bei Schimmel wegwerfen"],
    });
    expect((await api("GET", "/feed-recipes")).data.map((r: any) => r.status)).toEqual(["builtIn", "builtIn", "builtIn", "builtIn"]);
    const scraps = await api("POST", "/feed-recipes", recipe("Resteessen", "Küchenreste"));
    expect(scraps.status).toBe(201);
    expect(scraps.data).toMatchObject({ id: "u:1", status: "pending", mine: true });
    const sprouts = (await api("POST", "/feed-recipes", recipe("Keimgerste"))).data;
    as = "bert";
    expect((await api("GET", "/feed-recipes")).data).toHaveLength(4);
    expect((await api("GET", "/admin/feed-recipes")).status).toBe(403);
    expect((await api("DELETE", `/feed-recipes/${sprouts.id}`)).status).toBe(404);

    as = "chef";
    const drafts = (await api("GET", "/admin/feed-recipes")).data;
    expect(drafts.map((d: any) => [d.title, d.flags])).toEqual([
      ["Resteessen", ["Küchen- oder Speisereste dürfen nicht an Nutztiere (VO (EG) 1069/2009)."]],
      ["Keimgerste", []],
    ]);
    expect((await api("POST", `/admin/feed-recipes/${scraps.data.id}/reject`)).data.status).toBe("rejected");
    expect((await api("POST", `/admin/feed-recipes/${sprouts.id}/approve`)).data.status).toBe("approved");
    expect((await api("POST", `/admin/feed-recipes/${sprouts.id}/approve`)).status).toBe(404);

    as = "bert";
    const forBert = (await api("GET", "/feed-recipes")).data;
    expect(forBert.map((r: any) => [r.title, r.status, r.mine]).slice(4)).toEqual([["Keimgerste", "approved", false]]);
    as = "anna";
    expect((await api("GET", "/feed-recipes")).data.slice(4).map((r: any) => [r.title, r.status])).toEqual([
      ["Keimgerste", "approved"],
      ["Resteessen", "rejected"],
    ]);
    // Withdraw the turned-down one; an approved one stays (only the owner removes it).
    expect((await api("DELETE", `/feed-recipes/${scraps.data.id}`)).status).toBe(204);
    expect((await api("DELETE", `/feed-recipes/${sprouts.id}`)).status).toBe(404);
    expect((await api("POST", "/feed-recipes", { ...recipe("Ohne Tiere"), species: [] })).status).toBe(400);
    for (let i = 0; i < 5; i++) await api("POST", "/feed-recipes", recipe(`Ansatz ${i}`));
    expect((await api("POST", "/feed-recipes", recipe("Zu viel"))).status).toBe(429);
    as = "chef";
    expect((await api("DELETE", `/feed-recipes/${sprouts.id}`)).status).toBe(204);
  });

  it("lists fodder plants from the beds per month", async () => {
    const [bed] = await q<{ id: number }>("INSERT INTO garden_beds (farm_id, name, type, length_cm, width_cm) VALUES ($1, 'Futterbeet', 'bed', 200, 100) RETURNING id", [farm.anna]);
    const year = new Date().getFullYear();
    await q("INSERT INTO bed_plantings (farm_id, bed_id, season, crop_key, label, x, y) VALUES ($1, $2, $3, 'mangold', 'Mangold', 0, 0)", [farm.anna, bed!.id, year]);
    const cal = (await api("GET", `/farms/${farm.anna}/feed-calendar`)).data;
    expect(cal).toMatchObject({ year, species: ["poultry", "rabbit", "sheep"] });
    expect(cal.months[6].fresh[0]).toEqual({ key: "mangold", name: "Mangold", species: ["poultry", "rabbit", "sheep"], planted: true });
    as = "bert";
    expect((await api("GET", `/farms/${farm.anna}/feed-calendar`)).status).toBe(404);
  });

  it("pushes 'Futter nachkaufen' on the day to buy more and the day before it runs out", async () => {
    sendPushToUser.mockClear();
    fixedDay = "2026-10-19";
    await ration({ herdId: ids.hens, stage: "laying", items: [{ feedKey: "legehennen", grams: 120 }], times: ["morgens"] });
    await api("PUT", `/farms/${farm.anna}/feed-stock`, { feedKey: "legehennen", stockKg: 1.7 });
    const { sendFeedDigests } = await import("./feedStock");
    expect(await sendFeedDigests("07:00", "2026-10-19")).toBe(0);
    expect(await sendFeedDigests("07:30", "2026-10-19")).toBe(1);
    expect(await sendFeedDigests("08:00", "2026-10-19")).toBe(0);
    // Admin and caretaker only – the guest gets nothing.
    expect(sendPushToUser.mock.calls).toEqual([
      ["anna", { topic: "feed", title: "Futter nachkaufen", body: "Legehennen-Alleinfutter reicht noch 7 Tage (bis 26.10.).", tag: `feed-${farm.anna}-2026-10-19`, url: "/farm/futter/vorrat" }],
    ]);
    fixedDay = "2026-10-22";
    expect(await sendFeedDigests("07:30", "2026-10-22")).toBe(0);
    fixedDay = "2026-10-25";
    expect(await sendFeedDigests("07:30", "2026-10-25")).toBe(1);
    expect(sendPushToUser.mock.calls.at(-1)![1]).toMatchObject({ body: "Legehennen-Alleinfutter ist morgen leer." });
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

  it("shows the organic shares of a ration on an organic farm only (Bio)", async () => {
    const sheep = await ration({ animalId: ids.sheep, stage: "maintenance", items: [{ feedKey: "heu", grams: 1500 }, { feedKey: "hafer", grams: 300 }], times: ["morgens"] });
    expect(sheep.data.organic).toBeNull(); // conventional farm: as before
    await q("UPDATE farms SET farming = 'organic' WHERE id = $1", [farm.anna]);
    try {
      // Nothing stated yet: everything counts as conventional.
      let r = (await api("GET", `/farms/${farm.anna}/rations`)).data.find((x: any) => x.id === sheep.data.id);
      expect(r.organic.missing).toEqual(["Wiesenheu", "Hafer"]);
      expect(r.organic.checks.find((c: any) => c.key === "organic")).toMatchObject({ value: 0, ok: false });

      await api("PUT", `/farms/${farm.anna}/feed-origins`, { feedKey: "heu", organic: "organic", ownFarm: true });
      const origins = await api("PUT", `/farms/${farm.anna}/feed-origins`, { feedKey: "hafer", organic: "conversion" });
      expect(origins.data).toEqual([
        { feedKey: "heu", feedId: null, organic: "organic", ownFarm: true },
        { feedKey: "hafer", feedId: null, organic: "conversion", ownFarm: false },
      ]);
      r = (await api("GET", `/farms/${farm.anna}/rations`)).data.find((x: any) => x.id === sheep.data.id);
      const by = Object.fromEntries(r.organic.checks.map((c: any) => [c.key, c]));
      expect(r.organic.missing).toEqual([]);
      expect(by.organic).toMatchObject({ value: 100, ok: true });
      expect(by.conversion.ok).toBe(true); // ~17 % bought conversion feed, at most 25 %
      expect(by.ownFarm.value).toBeGreaterThan(70);
      expect(by.roughage).toMatchObject({ target: 60, ok: true });

      // Removing an origin, wrong values, a guest.
      expect((await api("PUT", `/farms/${farm.anna}/feed-origins`, { feedKey: "hafer", organic: null })).data).toHaveLength(1);
      expect((await api("PUT", `/farms/${farm.anna}/feed-origins`, { feedKey: "hafer", organic: "halbbio" })).status).toBe(400);
      expect((await api("PUT", `/farms/${farm.anna}/feed-origins`, { feedKey: "gibtsnicht", organic: "organic" })).status).toBe(400);
      as = "gast";
      expect((await api("GET", `/farms/${farm.anna}/feed-origins`)).data).toHaveLength(1);
      expect((await api("PUT", `/farms/${farm.anna}/feed-origins`, { feedKey: "heu", organic: "conventional" })).status).toBe(403);
    } finally {
      as = "anna";
      await q("UPDATE farms SET farming = 'conventional' WHERE id = $1", [farm.anna]);
    }
  });
});
