/**
 * Hof-Aufgaben (docs/hof-aufgaben.md) against a REAL Postgres, through the
 * HTTP routes: a list for today with own wording, one-off and daily tasks,
 * a person, who ticked it off, taking a tick back, and comments with a push
 * to the others.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const pushes = vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
  return [] as Array<{ to: string; title: string; body: string }>;
});
const runModelChain = vi.hoisted(() => vi.fn());
vi.mock("./plantIdentification", async (orig) => ({ ...(await orig<object>()), runModelChain }));
vi.mock("./webPush", async (orig) => ({
  ...(await orig<typeof import("./webPush")>()),
  sendPushToUser: async (to: string, p: { title: string; body: string }) => {
    pushes.push({ to, title: p.title, body: p.body });
    return 1;
  },
}));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Hof-Aufgaben (real database)", () => {
  let server: Server;
  let base = "";
  let as = "stefan";
  let farmId = 0;
  let otherFarm = 0;

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
    app.use((await import("../routes/farm-tasks")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users, scan_attempts RESTART IDENTITY CASCADE");
    runModelChain.mockReset();
    await q(
      `INSERT INTO users (id, email, approved, first_name) VALUES ('stefan', 's@x.de', true, 'Stefan'), ('maria', 'm@x.de', true, 'Maria'), ('gast', 'g@x.de', true, 'Gast'), ('bert', 'b@x.de', true, 'Bert')`,
    );
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Auberg') RETURNING id");
    const [g] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Bert') RETURNING id");
    farmId = f!.id;
    otherFarm = g!.id;
    await q(
      `INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'stefan', 'admin'), ($1, 'maria', 'caretaker'), ($1, 'gast', 'guest'), ($2, 'bert', 'admin')`,
      [farmId, otherFarm],
    );
    as = "stefan";
    pushes.length = 0;
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
  const T = (f = farmId) => `/farms/${f}/tasks`;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const daily = (title: string, extra: Record<string, unknown> = {}) => ({
    title, startsOn: today(), repeats: true, intervalValue: 1, intervalUnit: "Tage", reminderTime: "08:00", ...extra,
  });

  it("writes today's list for Maria: own wording, area and action follow from the text, due today", async () => {
    let r = await api("POST", T(), daily("Eier von den Hühnern einsammeln", { area: "tiere", assigneeId: "maria" }));
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({
      title: "Eier von den Hühnern einsammeln",
      actionType: "Eier sammeln",
      area: "tiere",
      assigneeId: "maria",
      assigneeName: "Maria",
      isDue: true,
      dueDate: today(),
      commentCount: 0,
      comments: [],
    });
    r = await api("POST", T(), { ...daily("Teichpumpe kontrollieren", { area: "hof" }), repeats: false });
    expect(r.data).toMatchObject({ actionType: "Sonstiges", area: "hof", repeats: false, isDue: true, assigneeName: null });
    // Without an area, the words decide.
    r = await api("POST", T(), daily("Hochbeet gießen"));
    expect(r.data.area).toBe("garten");
    await api("DELETE", `${T()}/${r.data.id}`);
    // The old Stall-Aufgaben form keeps working: action type, no title, no first day.
    r = await api("POST", T(), { actionType: "Ausmisten", intervalValue: 1, intervalUnit: "Wochen", reminderTime: "10:00" });
    expect(r.data).toMatchObject({ title: null, area: "tiere", repeats: true, isDue: false, startsOn: null });

    r = await api("GET", T());
    expect(r.data.map((t: { title: string | null }) => t.title)).toEqual(["Eier von den Hühnern einsammeln", "Teichpumpe kontrollieren", null]);
  });

  it("rejects what does not fit: no text and no action, a one-off without a day, someone not on the team, an unknown area", async () => {
    expect((await api("POST", T(), { intervalValue: 1, intervalUnit: "Tage", reminderTime: "08:00" })).status).toBe(400);
    expect((await api("POST", T(), { ...daily("Teich"), repeats: false, startsOn: null })).status).toBe(400);
    expect((await api("POST", T(), daily("Teich", { assigneeId: "bert" }))).status).toBe(400);
    expect((await api("POST", T(), daily("Teich", { area: "keller" }))).status).toBe(400);
    expect((await api("POST", T(), daily("x".repeat(81)))).status).toBe(400);
  });

  it("repeats on fixed weekdays: due on the next of them, ticked off until the next one", async () => {
    const iso = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
    const t = today();
    const other = (iso(t) % 7) + 1; // tomorrow's weekday
    let r = await api("POST", T(), daily("Müll rausbringen", { weekdays: [iso(t), other] }));
    expect(r.status).toBe(201);
    expect(r.data).toMatchObject({ weekdays: [iso(t), other].sort((a, b) => a - b), repeats: true, isDue: true, dueDate: t });
    r = await api("POST", `${T()}/${r.data.id}/complete`, {});
    const tomorrow = new Date(Date.parse(`${t}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect(r.data).toMatchObject({ isDue: false, doneToday: true, dueDate: tomorrow });
    // Weekdays only for repeating tasks; nonsense is refused.
    r = await api("POST", T(), { ...daily("Teich"), repeats: false, weekdays: [1] });
    expect(r.data.weekdays).toBeNull();
    expect((await api("POST", T(), daily("Teich", { weekdays: [0] }))).status).toBe(400);
  });

  it("shows who ticked it off, and today's tick can be taken back", async () => {
    const { data: task } = await api("POST", T(), daily("Meerschweinchen Gras geben"));
    as = "maria";
    let r = await api("POST", `${T()}/${task.id}/complete`);
    expect(r.data).toMatchObject({ isDue: false, doneToday: true, lastCompletedBy: "maria", lastCompletedByName: "Maria" });
    r = await api("POST", `${T()}/${task.id}/uncomplete`);
    expect(r.data).toMatchObject({ isDue: true, doneToday: false, lastCompletedAt: null, lastCompletedByName: null });
    expect((await api("POST", `${T()}/${task.id}/uncomplete`)).status).toBe(400);

    // A one-off task is done for good once ticked off.
    const { data: once } = await api("POST", T(), { ...daily("Kescher: Federn aus dem Teich"), repeats: false });
    r = await api("POST", `${T()}/${once.id}/complete`);
    expect(r.data).toMatchObject({ isDone: true, isDue: false, doneToday: true });
  });

  it("keeps the completion before today when the tick is taken back", async () => {
    const { data: task } = await api("POST", T(), daily("Gänsen Trockenfutter geben"));
    await q("UPDATE farm_tasks SET last_completed_at = now() - interval '2 days' WHERE id = $1", [task.id]);
    await api("POST", `${T()}/${task.id}/complete`);
    await api("POST", `${T()}/${task.id}/complete`);
    const r = await api("POST", `${T()}/${task.id}/uncomplete`);
    expect(r.data.lastCompletedAt).not.toBeNull();
    expect(r.data.isDue).toBe(true);
  });

  it("takes comments, tells the others, and lets only the author or an admin delete them", async () => {
    const { data: task } = await api("POST", T(), daily("Eier einsammeln"));
    as = "maria";
    let r = await api("POST", `${T()}/${task.id}/comments`, { body: "Wir brauchen neue Eierkartons" });
    expect(r.status).toBe(201);
    expect(r.data.commentCount).toBe(1);
    expect(r.data.comments[0]).toMatchObject({ body: "Wir brauchen neue Eierkartons", authorName: "Maria", isOwn: true });
    // Stefan and the guest see the tasks; Maria wrote it; Bert is on another farm.
    expect(pushes.map((p) => p.to).sort()).toEqual(["gast", "stefan"]);
    expect(pushes[0]).toMatchObject({ title: "Maria zu „Eier einsammeln“", body: "Wir brauchen neue Eierkartons" });

    const commentId = r.data.comments[0].id;
    as = "stefan";
    r = await api("GET", T());
    expect(r.data[0].comments[0]).toMatchObject({ authorName: "Maria", isOwn: false });
    // Guests only read.
    as = "gast";
    expect((await api("POST", `${T()}/${task.id}/comments`, { body: "Hallo" })).status).toBe(403);
    // Maria's own; the admin may remove it too.
    as = "stefan";
    r = await api("DELETE", `${T()}/${task.id}/comments/${commentId}`);
    expect(r.data.commentCount).toBe(0);
    expect((await api("POST", `${T()}/${task.id}/comments`, { body: "  " })).status).toBe(400);
  });

  it("lets a caretaker delete only their own comment", async () => {
    const { data: task } = await api("POST", T(), daily("Teichpumpe kontrollieren"));
    const { data } = await api("POST", `${T()}/${task.id}/comments`, { body: "Filter reinigen" });
    as = "maria";
    expect((await api("DELETE", `${T()}/${task.id}/comments/${data.comments[0].id}`)).status).toBe(404);
  });

  it("keeps farms apart and makes a task for everyone again when the person leaves", async () => {
    const { data: task } = await api("POST", T(), daily("Gänsen Nassfutter geben", { assigneeId: "maria" }));
    as = "bert";
    // Not a member: the farm does not exist for him.
    expect((await api("POST", `${T()}/${task.id}/comments`, { body: "Hallo" })).status).toBe(404);
    expect((await api("POST", `${T(otherFarm)}/${task.id}/comments`, { body: "Hallo" })).status).toBe(404);
    as = "stefan";
    await q("DELETE FROM farm_memberships WHERE user_id = 'maria'");
    const r = await api("GET", T());
    expect(r.data[0]).toMatchObject({ assigneeId: null, assigneeName: null });
  });

  it("plans tasks from free speech with the AI, saves nothing, and counts against the farm's AI limit", async () => {
    await q("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Gänse', 'poultry')", [farmId]);
    runModelChain.mockResolvedValue({
      aufgaben: [
        { titel: "Eier einsammeln", bereich: "tiere", tag: today(), wiederholung: null, uhrzeit: "17:00", fuer: "Maria", gruppe: null },
        { titel: "Gänse füttern", bereich: "tiere", tag: null, wiederholung: { alle: 1, einheit: "Tage" }, uhrzeit: null, fuer: null, gruppe: "Gänse" },
        { titel: "Blumen gießen", bereich: "garten", tag: null, wiederholung: null, uhrzeit: null, fuer: "Bert", gruppe: null },
      ],
    });
    const said = "Heute müssen die Eier eingesammelt werden, die Gänse jeden Tag gefüttert und die Blumen gegossen";
    const r = await api("POST", `${T()}/plan`, { text: said, repeats: false });
    expect(r.status).toBe(200);
    expect(r.data.tasks).toHaveLength(3);
    expect(r.data.tasks[0]).toMatchObject({ title: "Eier einsammeln", assigneeName: "Maria", reminderTime: "17:00", repeats: false });
    expect(r.data.tasks[1]).toMatchObject({ title: "Gänse füttern", repeats: true, herdName: "Gänse" });
    // Bert is on another farm; guests are not planned for.
    expect(r.data.tasks[2]).toMatchObject({ area: "garten", assigneeId: null });
    const prompt = runModelChain.mock.calls[0]![0][0].parts[0].text as string;
    expect(prompt).toContain(said);
    expect(prompt).toContain("Team: Stefan, Maria.");
    expect(await q("SELECT id FROM farm_tasks")).toEqual([]);
    expect(await q("SELECT scan_type FROM scan_attempts")).toEqual([{ scan_type: "farm" }]);
  });

  it("gives the attempt back when the AI finds nothing, and lets guests not plan", async () => {
    runModelChain.mockResolvedValue({ aufgaben: [] });
    const r = await api("POST", `${T()}/plan`, { text: "Hallo" });
    expect(r.status).toBe(422);
    expect(await q("SELECT id FROM scan_attempts")).toEqual([]);
    expect((await api("POST", `${T()}/plan`, { text: "" })).status).toBe(400);
    as = "gast";
    expect((await api("POST", `${T()}/plan`, { text: "Eier einsammeln" })).status).toBe(403);
  });
});
