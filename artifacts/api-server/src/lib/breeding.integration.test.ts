/**
 * Zucht against a REAL Postgres, through the HTTP routes: matings and clutches
 * with their expected day, checks on mother and father, the related-parents
 * warning, the birth creating the young with their parents, the lineage on the
 * animal page, roles and farm isolation, and the push on a step's day.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-10-19";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Zucht (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  let farmId = 0;
  let otherFarm = 0;
  const ids: Record<string, number> = {};

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/farm-breeding")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  const animal = async (key: string, species: string, sex: string, farm = farmId, parents: [number | null, number | null] = [null, null]) => {
    const [a] = await q<{ id: number }>(
      `INSERT INTO farm_animals (farm_id, name, species, sex, registration_number, mother_id, father_id) VALUES ($1, $2, $3, $4, $2, $5, $6) RETURNING id`,
      [farm, key, species, sex, parents[0], parents[1]],
    );
    ids[key] = a!.id;
  };

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('gina', 'g@x.de', true), ('bert', 'b@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Sonnenblick') RETURNING id");
    const [g] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Bert') RETURNING id");
    farmId = f!.id;
    otherFarm = g!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'gina', 'guest'), ($2, 'bert', 'admin')`, [farmId, otherFarm]);
    const [herd] = await q<{ id: number }>("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Ziegen', 'goat') RETURNING id", [farmId]);
    await animal("Lotte", "goat", "female");
    await animal("Max", "goat", "male");
    await animal("Bock", "goat", "male");
    await animal("Fremd", "goat", "female", otherFarm);
    await animal("Hase", "rabbit", "female");
    await q("UPDATE farm_animals SET herd_id = $1 WHERE id = $2", [herd!.id, ids["Lotte"]]);
    as = "anna";
    fixedDay = "2026-10-19";
    sendPushToUser.mockClear();
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
  const B = () => `/farms/${farmId}/breeding`;

  it("records a mating with its expected day and checks mother and father", async () => {
    const r = await api("POST", B(), { species: "goat", motherId: ids["Lotte"], fatherId: ids["Max"], startedOn: "2026-09-01" });
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({
      kind: "pregnancy",
      motherName: "Lotte",
      fatherName: "Max",
      durationDays: 150,
      dueOn: "2027-01-29",
      status: "running",
      day: 48,
      late: false,
      warning: null,
    });
    // The same mother cannot be pregnant twice.
    expect((await api("POST", B(), { species: "goat", motherId: ids["Lotte"], startedOn: "2026-10-01" })).status).toBe(409);
    // Wrong sex, species or farm; no mother for a mammal.
    const bad = async (body: object) => (await api("POST", B(), { species: "goat", startedOn: "2026-10-01", ...body })).data.error;
    expect(await bad({ motherId: ids["Max"] })).toBe("Max ist kein weibliches Tier.");
    expect(await bad({ motherId: ids["Hase"] })).toBe("Das Muttertier ist eine andere Tierart.");
    expect(await bad({ motherId: ids["Fremd"] })).toBe("Das Muttertier gibt es auf der Farm nicht.");
    expect(await bad({})).toBe("Bitte wähle das Muttertier.");
    expect(await bad({ motherId: ids["Hase"], species: "rabbit", fatherId: ids["Max"] })).toBe("Das Vatertier ist eine andere Tierart.");
    expect((await api("POST", B(), { species: "other", startedOn: "2026-10-01" })).data.error).toBe("Für diese Tierart gibt es keinen Zuchtplaner.");
    expect((await api("POST", B(), { species: "goat", motherId: ids["Hase"], startedOn: "2099-01-01" })).status).toBe(400);
  });

  it("warns when mother and father are related", async () => {
    await animal("Sohn", "goat", "male", farmId, [ids["Lotte"]!, ids["Max"]!]);
    const r = await api("POST", B(), { species: "goat", motherId: ids["Lotte"], fatherId: ids["Sohn"], startedOn: "2026-09-01" });
    expect(r.data.warning).toMatch(/^Mutter und Vater sind verwandt: Elterntier und Nachkomme\./);
  });

  it("records a clutch of eggs and its hatch, creating the chicks", async () => {
    const r = await api("POST", B(), { species: "poultry", startedOn: "2026-10-01", eggCount: 12, durationDays: 28, fatherName: "Hahn vom Nachbarn" });
    expect(r.data).toMatchObject({ kind: "incubation", motherId: null, fatherName: "Hahn vom Nachbarn", eggCount: 12, dueOn: "2026-10-29" });
    expect((await api("POST", B(), { species: "poultry", startedOn: "2026-10-01" })).data.error).toBe("Bitte gib 1 bis 200 Eier an.");
    const id = r.data.id;
    expect((await api("POST", `${B()}/${id}/end`, { outcome: "born", date: "2026-10-19", alive: 10, dead: 3 })).data.error).toMatch(/höchstens 12/);
    const end = await api("POST", `${B()}/${id}/end`, { outcome: "born", date: "2026-10-19", alive: 9, dead: 2, createYoung: true });
    expect(end.data).toMatchObject({ created: 9, record: { status: "born", bornAlive: 9, bornDead: 2, endedOn: "2026-10-19", day: null } });
    const chicks = await q<{ name: string; registration_number: string; birth_date: string }>(
      "SELECT name, registration_number, to_char(birth_date, 'YYYY-MM-DD') AS birth_date FROM farm_animals WHERE species = 'poultry' ORDER BY id",
    );
    expect(chicks).toHaveLength(9);
    expect(chicks[0]).toEqual({ name: "Küken 1", registration_number: "KÜ-1", birth_date: "2026-10-19" });
    expect((await api("POST", `${B()}/${id}/end`, { outcome: "failed", date: "2026-10-19" })).status).toBe(409);
  });

  it("creates the young with their parents and the mother's herd, and shows the lineage", async () => {
    const r = await api("POST", B(), { species: "goat", motherId: ids["Lotte"], fatherId: ids["Max"], startedOn: "2026-05-01" });
    await api("POST", `${B()}/${r.data.id}/end`, { outcome: "born", date: "2026-09-28", alive: 2, dead: 0, createYoung: true });
    const kids = await q<{ id: number; name: string; mother_id: number; father_id: number; herd_id: number }>(
      "SELECT id, name, mother_id, father_id, herd_id FROM farm_animals WHERE name LIKE 'Kitz%' ORDER BY id",
    );
    const [lotte] = await q<{ herd_id: number }>("SELECT herd_id FROM farm_animals WHERE id = $1", [ids["Lotte"]]);
    expect(kids.map((k) => [k.name, k.mother_id, k.father_id, k.herd_id])).toEqual([
      ["Kitz 1", ids["Lotte"], ids["Max"], lotte!.herd_id],
      ["Kitz 2", ids["Lotte"], ids["Max"], lotte!.herd_id],
    ]);
    as = "gina";
    const mother = await api("GET", `/farms/${farmId}/animals/${ids["Lotte"]}/lineage`);
    expect(mother.data).toEqual({
      mother: null,
      father: null,
      offspring: [
        { id: kids[0]!.id, name: "Kitz 1", birthDate: "2026-09-28", archived: false },
        { id: kids[1]!.id, name: "Kitz 2", birthDate: "2026-09-28", archived: false },
      ],
    });
    expect((await api("GET", `/farms/${farmId}/animals/${kids[0]!.id}/lineage`)).data).toMatchObject({
      mother: { id: ids["Lotte"], name: "Lotte" },
      father: { id: ids["Max"], name: "Max" },
    });
    // Kitz 1 is related to Lotte: mating them gives the warning.
    as = "anna";
    await q("UPDATE farm_animals SET sex = 'male' WHERE id = $1", [kids[0]!.id]);
    const r2 = await api("POST", B(), { species: "goat", motherId: ids["Lotte"], fatherId: kids[0]!.id, startedOn: "2026-10-10" });
    expect(r2.data.warning).toMatch(/Elterntier und Nachkomme/);
  });

  it("sets parents by hand, refusing impossible ones", async () => {
    const L = (id: number) => `/farms/${farmId}/animals/${id}/lineage`;
    await animal("Kind", "goat", "female");
    let r = await api("PUT", L(ids["Kind"]!), { motherId: ids["Lotte"], fatherId: ids["Bock"] });
    expect(r.data).toMatchObject({ mother: { name: "Lotte" }, father: { name: "Bock" } });
    const err = async (id: number, body: object) => (await api("PUT", L(id), { motherId: null, fatherId: null, ...body })).data.error;
    expect(await err(ids["Lotte"]!, { motherId: ids["Kind"] })).toBe("Ein Nachkomme kann nicht Elterntier sein.");
    expect(await err(ids["Kind"]!, { motherId: ids["Kind"] })).toBe("Ein Tier kann nicht sein eigenes Elterntier sein.");
    expect(await err(ids["Kind"]!, { motherId: ids["Max"] })).toBe("Die Mutter ist als männlich eingetragen.");
    expect(await err(ids["Kind"]!, { motherId: ids["Hase"] })).toBe("Das Elterntier ist eine andere Tierart.");
    expect(await err(ids["Kind"]!, { fatherId: ids["Fremd"] })).toBe("Dieses Elterntier gibt es auf der Farm nicht.");
    r = await api("PUT", L(ids["Kind"]!), { motherId: null, fatherId: null });
    expect(r.data).toEqual({ mother: null, father: null, offspring: [] });
  });

  it("edits, gives up and deletes; guests read only; farms stay apart", async () => {
    const r = await api("POST", B(), { species: "rabbit", motherId: ids["Hase"], startedOn: "2026-10-01" });
    const id = r.data.id;
    let u = await api("PUT", `${B()}/${id}`, { startedOn: "2026-10-03", fatherName: "Rammler Fritz", notes: "Zweiter Wurf" });
    expect(u.data).toMatchObject({ startedOn: "2026-10-03", dueOn: "2026-11-03", motherName: "Hase", fatherName: "Rammler Fritz", notes: "Zweiter Wurf" });
    as = "gina";
    expect((await api("GET", B())).data).toHaveLength(1);
    expect((await api("PUT", `${B()}/${id}`, { startedOn: "2026-10-03" })).status).toBe(403);
    as = "bert";
    expect((await api("GET", B())).status).toBe(404);
    expect((await api("GET", `/farms/${otherFarm}/breeding`)).data).toEqual([]);
    expect((await api("DELETE", `/farms/${otherFarm}/breeding/${id}`)).status).toBe(404);
    as = "anna";
    u = await api("POST", `${B()}/${id}/end`, { outcome: "failed", date: "2026-10-15", notes: "Nicht trächtig" });
    expect(u.data.record).toMatchObject({ status: "failed", endedOn: "2026-10-15", notes: "Nicht trächtig" });
    expect((await api("DELETE", `${B()}/${id}`)).status).toBe(204);
    expect((await api("GET", B())).data).toEqual([]);
  });

  it("pushes the steps of the day once to admins and caretakers", async () => {
    const { sendBreedingDigests } = await import("./breeding");
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'bert', 'caretaker')`, [farmId]);
    // Rabbit mated on 1 October: nest box 5 days before the 1 November.
    await api("POST", B(), { species: "rabbit", motherId: ids["Hase"], startedOn: "2026-10-01" });
    expect(await sendBreedingDigests("08:00", "2026-10-26")).toBe(0);
    expect(await sendBreedingDigests("07:00", "2026-10-27")).toBe(0);
    expect(await sendBreedingDigests("08:00", "2026-10-27")).toBe(1);
    expect(await sendBreedingDigests("08:30", "2026-10-27")).toBe(0);
    expect(sendPushToUser.mock.calls.map((c) => c[0]).sort()).toEqual(["anna", "bert"]);
    expect(sendPushToUser.mock.calls[0]![1]).toEqual({
      topic: "breeding",
      title: "Zucht: heute zu tun",
      body: "Hase: Nestbox mit Heu und Stroh in den Stall stellen.",
      tag: `breeding-${farmId}-2026-10-27`,
      url: "/farm/zucht",
    });
  });
});
