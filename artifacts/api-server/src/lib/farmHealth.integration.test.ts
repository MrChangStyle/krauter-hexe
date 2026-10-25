/**
 * "Meine Farm" step 4 against a REAL Postgres, through the HTTP routes:
 * health records, weights, stall tasks (incl. the push reminder) and the
 * export – roles and isolation between farms.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The scheduler reaches the Futterplaner (feed push), which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Meine Farm – health, weights, tasks, export (real database)", () => {
  let server: Server;
  let base = "";
  let as = "anna";
  const farm = { anna: 0, bert: 0 };
  let lotte = 0;
  let bertsAnimal = 0;

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
    for (const file of ["../routes/farm-animals", "../routes/farm-health", "../routes/farm-tasks"]) {
      app.use((await import(file)).default);
    }
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    sendPushToUser.mockClear();
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
    const [l] = await q<{ id: number }>(
      `INSERT INTO farm_animals (farm_id, name, species, sex, registration_number, birth_date)
       VALUES ($1, 'Lotte', 'goat', 'female', 'DE 1', '2023-04-12') RETURNING id`,
      [farm.anna],
    );
    const [k] = await q<{ id: number }>(
      `INSERT INTO farm_animals (farm_id, name, species, sex, registration_number) VALUES ($1, 'Karl', 'pig', 'male', 'DE 9') RETURNING id`,
      [farm.bert],
    );
    lotte = l!.id;
    bertsAnimal = k!.id;
    as = "anna";
  });

  afterEach(() => vi.useRealTimers());

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as any) : null };
  };

  const record = (overrides: Record<string, unknown> = {}) => ({
    date: "2026-05-02",
    diagnosis: "Moderhinke",
    treatment: "Klauen geschnitten, Zinkbad",
    medication: "Oxytetracyclin-Spray",
    withdrawalPeriodDays: 7,
    vet: "Dr. Huf",
    ...overrides,
  });

  const task = (overrides: Record<string, unknown> = {}) => ({
    actionType: "Füttern",
    intervalValue: 1,
    intervalUnit: "Tage",
    reminderTime: "07:00",
    ...overrides,
  });

  it("keeps health records per animal, newest first, and edits and deletes them", async () => {
    const first = await api("POST", `/farms/${farm.anna}/animals/${lotte}/medical`, record());
    expect(first.status).toBe(201);
    await api("POST", `/farms/${farm.anna}/animals/${lotte}/medical`, record({ date: "2026-07-01", diagnosis: "Entwurmung" }));
    const list = await api("GET", `/farms/${farm.anna}/animals/${lotte}/medical`);
    expect(list.data.map((r: { diagnosis: string }) => r.diagnosis)).toEqual(["Entwurmung", "Moderhinke"]);

    const edited = await api("PATCH", `/farms/${farm.anna}/medical/${first.data.id}`, record({ vet: "  " }));
    expect(edited.data).toMatchObject({ diagnosis: "Moderhinke", vet: null, withdrawalPeriodDays: 7 });
    expect((await api("DELETE", `/farms/${farm.anna}/medical/${first.data.id}`)).status).toBe(204);
    expect((await api("GET", `/farms/${farm.anna}/animals/${lotte}/medical`)).data).toHaveLength(1);
  });

  it("reminds to repeat a deworming or vaccination as the animal's stall task", async () => {
    const path = `/farms/${farm.anna}/animals/${lotte}/medical`;
    const tasks = async () => (await api("GET", `/farms/${farm.anna}/tasks`)).data as any[];
    // An invalid interval stores nothing.
    expect((await api("POST", path, record({ repeat: { kind: "deworm", every: 0, unit: "Wochen" } }))).status).toBe(400);
    expect((await api("GET", path)).data).toEqual([]);

    expect((await api("POST", path, record({ date: "2026-04-01", diagnosis: "Entwurmung", medication: "Flubenol", repeat: { kind: "deworm", every: 12, unit: "Wochen" } }))).status).toBe(201);
    let [t] = await tasks();
    expect(t).toMatchObject({ actionType: "Entwurmen", animalName: "Lotte", notes: "Flubenol", intervalValue: 12, intervalUnit: "Wochen", reminderTime: "08:00", dueDate: "2026-06-24" });

    // The next deworming reuses the task: new interval, counted from the newer day.
    await api("POST", path, record({ date: "2026-06-20", diagnosis: "Entwurmung", medication: null, repeat: { kind: "deworm", every: 3, unit: "Monate" } }));
    // An older one entered afterwards does not move it back.
    await api("POST", path, record({ date: "2026-05-01", diagnosis: "Entwurmung", repeat: { kind: "deworm", every: 1, unit: "Wochen" } }));
    const all = await tasks();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: t.id, notes: "Flubenol", intervalValue: 3, intervalUnit: "Monate", dueDate: "2026-09-18" });

    // A vaccination is a task of its own; editing a record never schedules.
    const vacc = await api("POST", path, record({ date: "2026-06-01", diagnosis: "Impfung", medication: "Myxomatose", repeat: { kind: "vaccinate", every: 6, unit: "Monate" } }));
    await api("PATCH", `/farms/${farm.anna}/medical/${vacc.data.id}`, record({ repeat: { kind: "vaccinate", every: 1, unit: "Tage" } }));
    [t] = (await tasks()).filter((x) => x.actionType === "Impfen");
    expect(t).toMatchObject({ notes: "Myxomatose", intervalValue: 6, dueDate: "2026-11-28" });
  });

  it("validates health records", async () => {
    const path = `/farms/${farm.anna}/animals/${lotte}/medical`;
    expect((await api("POST", path, record({ date: "2999-01-01" }))).data.error).toMatch(/Zukunft/);
    expect((await api("POST", path, record({ diagnosis: " " }))).status).toBe(400);
    expect((await api("POST", path, record({ withdrawalPeriodDays: -1 }))).status).toBe(400);
  });

  it("keeps farms apart for records, weights and tasks", async () => {
    const r = await api("POST", `/farms/${farm.anna}/animals/${lotte}/medical`, record());
    const w = await api("POST", `/farms/${farm.anna}/animals/${lotte}/weights`, { date: "2026-05-02", weightKg: 41.5 });
    const t = await api("POST", `/farms/${farm.anna}/tasks`, task());
    as = "bert";
    // Through his own farm, Bert reaches none of Anna's ids …
    expect((await api("GET", `/farms/${farm.bert}/animals/${lotte}/medical`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/animals/${lotte}/medical`, record())).status).toBe(404);
    expect((await api("PATCH", `/farms/${farm.bert}/medical/${r.data.id}`, record({ diagnosis: "X" }))).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/medical/${r.data.id}`)).status).toBe(404);
    expect((await api("GET", `/farms/${farm.bert}/animals/${lotte}/weights`)).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/weights/${w.data.id}`)).status).toBe(404);
    expect((await api("POST", `/farms/${farm.bert}/tasks/${t.data.id}/complete`)).status).toBe(404);
    expect((await api("DELETE", `/farms/${farm.bert}/tasks/${t.data.id}`)).status).toBe(404);
    // … cannot attach a task to her animal …
    expect((await api("POST", `/farms/${farm.bert}/tasks`, task({ animalId: lotte }))).status).toBe(400);
    // … and his export holds only his own animal.
    const exp = await api("GET", `/farms/${farm.bert}/export`);
    expect(exp.data).toEqual({ farmName: "Hof Bert", holdingNumber: null, animals: [expect.objectContaining({ id: bertsAnimal })], medicalRecords: [], beeColonies: [], beeTreatments: [] });
    // Anna's farm itself stays closed to him.
    expect((await api("GET", `/farms/${farm.anna}/tasks`)).status).toBe(404);
    expect(await q("SELECT count(*)::int AS n FROM medical_records")).toEqual([{ n: 1 }]);
  });

  it("lets guests read but not write", async () => {
    await api("POST", `/farms/${farm.anna}/animals/${lotte}/medical`, record());
    const t = await api("POST", `/farms/${farm.anna}/tasks`, task());
    as = "gast";
    expect((await api("GET", `/farms/${farm.anna}/animals/${lotte}/medical`)).data).toHaveLength(1);
    expect((await api("GET", `/farms/${farm.anna}/tasks`)).data).toHaveLength(1);
    expect((await api("GET", `/farms/${farm.anna}/export`)).status).toBe(200);
    expect((await api("POST", `/farms/${farm.anna}/animals/${lotte}/medical`, record())).status).toBe(403);
    expect((await api("POST", `/farms/${farm.anna}/animals/${lotte}/weights`, { date: "2026-05-02", weightKg: 4 })).status).toBe(403);
    expect((await api("POST", `/farms/${farm.anna}/tasks/${t.data.id}/complete`)).status).toBe(403);
  });

  it("stores weights oldest first and checks them", async () => {
    const path = `/farms/${farm.anna}/animals/${lotte}/weights`;
    await api("POST", path, { date: "2026-06-01", weightKg: 42 });
    await api("POST", path, { date: "2026-05-01", weightKg: 40.25 });
    expect((await api("GET", path)).data.map((w: { weightKg: number }) => w.weightKg)).toEqual([40.25, 42]);
    expect((await api("POST", path, { date: "2026-06-01", weightKg: 0 })).status).toBe(400);
    expect((await api("POST", path, { date: "2026-02-30", weightKg: 3 })).status).toBe(400);
  });

  it("schedules stall tasks: due date, ticking off, target checks", async () => {
    const herd = await api("POST", `/farms/${farm.anna}/herds`, { name: "Ziegen", species: "goat" });
    const created = await api("POST", `/farms/${farm.anna}/tasks`, task({ herdId: herd.data.id, intervalValue: 2 }));
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({ herdName: "Ziegen", animalName: null, isDue: false, lastCompletedAt: null });

    // Created three days ago → due since yesterday.
    await q("UPDATE farm_tasks SET created_at = now() - interval '3 days'");
    const [listed] = (await api("GET", `/farms/${farm.anna}/tasks`)).data;
    expect(listed.isDue).toBe(true);

    as = "pfleger";
    const done = await api("POST", `/farms/${farm.anna}/tasks/${created.data.id}/complete`);
    expect(done.data.isDue).toBe(false);
    expect(done.data.lastCompletedAt).not.toBeNull();

    // Am Stall (docs/stall.md): a tap sent later from the offline queue keeps its time …
    const path = `/farms/${farm.anna}/tasks/${created.data.id}/complete`;
    await q("UPDATE farm_tasks SET last_completed_at = NULL");
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(new Date((await api("POST", path, { doneAt: earlier })).data.lastCompletedAt).toISOString()).toBe(earlier);
    // … never moves a later completion back, and has a limit.
    const older = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(new Date((await api("POST", path, { doneAt: older })).data.lastCompletedAt).toISOString()).toBe(earlier);
    expect((await api("POST", path, { doneAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() })).status).toBe(400);
    expect((await api("POST", path, { doneAt: "gestern" })).status).toBe(400);

    expect((await api("POST", `/farms/${farm.anna}/tasks`, task({ herdId: herd.data.id, animalId: lotte }))).status).toBe(400);
    expect((await api("POST", `/farms/${farm.anna}/tasks`, task({ reminderTime: "25:00" }))).status).toBe(400);
    expect((await api("POST", `/farms/${farm.anna}/tasks`, task({ actionType: "Gießen" }))).status).toBe(400);

    // A herd's tasks go with the herd.
    as = "anna";
    await api("DELETE", `/farms/${farm.anna}/herds/${herd.data.id}`);
    expect((await api("GET", `/farms/${farm.anna}/tasks`)).data).toEqual([]);
  });

  it("reminds admins and caretakers of a due stall task once a day, not guests", async () => {
    await api("POST", `/farms/${farm.anna}/tasks`, task({ animalId: lotte, reminderTime: "07:00" }));
    await q("UPDATE farm_tasks SET created_at = '2026-10-10T08:00:00Z'");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T05:00:30Z")); // 07:00 in Berlin (CEST)
    const { triggerDueNotifications } = await import("./pushScheduler");

    expect(await triggerDueNotifications()).toBe(1);
    expect(sendPushToUser.mock.calls.map(([userId]) => userId).sort()).toEqual(["anna", "pfleger"]);
    expect(sendPushToUser.mock.calls[0]![1]).toMatchObject({ title: "Stall-Aufgabe fällig", body: "Füttern – Lotte (Hof Anna)" });

    sendPushToUser.mockClear();
    expect(await triggerDueNotifications()).toBe(0);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("exports all animals of the farm, archived ones too, with their records", async () => {
    await api("POST", `/farms/${farm.anna}/animals/${lotte}/medical`, record());
    await api("POST", `/farms/${farm.anna}/animals/${lotte}/archive`, { archived: true });
    const exp = await api("GET", `/farms/${farm.anna}/export`);
    expect(exp.data.farmName).toBe("Hof Anna");
    expect(exp.data.animals).toEqual([expect.objectContaining({ name: "Lotte", archivedAt: expect.any(String) })]);
    expect(exp.data.medicalRecords).toEqual([expect.objectContaining({ animalId: lotte, diagnosis: "Moderhinke" })]);
  });

  it("exports the colonies and their varroa treatments, only to members who may see the bees", async () => {
    const [col] = await q<{ id: number }>(
      "INSERT INTO bee_colonies (farm_id, name, apiary, started_on) VALUES ($1, 'Volk 1', 'Obstwiese', '2025-05-01') RETURNING id",
      [farm.anna],
    );
    const [med] = await q<{ id: number }>(
      "INSERT INTO medicines (farm_id, name, unit, amount, batch, vet) VALUES ($1, 'Oxalsäure 3,5 %', 'ml', 500, 'OX-11', 'Dr. Imker') RETURNING id",
      [farm.anna],
    );
    await q("INSERT INTO bee_treatments (farm_id, colony_id, date, method, medicine_id, dose, unit) VALUES ($1, $2, '2025-12-20', 'oxalsaeure', $3, 30, 'ml')", [farm.anna, col!.id, med!.id]);
    await q("INSERT INTO bee_treatments (farm_id, colony_id, date, method, product, batch) VALUES ($1, $2, '2025-08-01', 'ameisensaeure', 'Ameisensäure 60 %', 'AS-2')", [farm.anna, col!.id]);
    const exp = (await api("GET", `/farms/${farm.anna}/export`)).data;
    expect(exp.beeColonies).toEqual([{ id: col!.id, name: "Volk 1", apiary: "Obstwiese", status: "active", startedOn: "2025-05-01", endedOn: null, createdAt: expect.any(String) }]);
    // Oldest first; product and batch from the Arzneimittel-Vorrat when it came from there.
    expect(exp.beeTreatments.map((t: any) => [t.date, t.colonyName, t.apiary, t.method, t.product, t.dose, t.unit, t.batch, t.source])).toEqual([
      ["2025-08-01", "Volk 1", "Obstwiese", "ameisensaeure", "Ameisensäure 60 %", null, null, "AS-2", null],
      ["2025-12-20", "Volk 1", "Obstwiese", "oxalsaeure", "Oxalsäure 3,5 %", 30, "ml", "OX-11", "Dr. Imker"],
    ]);
    // A caretaker without the Bienen module gets the animals but no bees.
    await q(`UPDATE farm_memberships SET modules = '["export"]' WHERE user_id = 'pfleger'`);
    as = "pfleger";
    const limited = (await api("GET", `/farms/${farm.anna}/export`)).data;
    expect(limited.animals).toHaveLength(1);
    expect([limited.beeColonies, limited.beeTreatments]).toEqual([[], []]);
  });
});
