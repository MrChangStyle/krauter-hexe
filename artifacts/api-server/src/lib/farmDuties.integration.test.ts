/**
 * Pflichten against a REAL Postgres, through the HTTP routes: the duties of
 * the farm's species, ticking them off (admin only), the registration number
 * and housing order, and the stock report push in January.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// The farm routes reach the Futterplaner (Hof einrichten), which loads the AI client.
vi.hoisted(() => {
  process.env["GEMINI_API_KEY"] ??= "test-key";
});
const sendPushToUser = vi.fn(async (_userId: string, _payload: unknown) => 1);
vi.mock("./webPush", () => ({ sendPushToUser }));
let fixedDay = "2026-10-19";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Pflichten (real database)", () => {
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
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as, approved: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      next();
    });
    app.use((await import("../routes/farms")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  beforeEach(async () => {
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved) VALUES ('anna', 'a@x.de', true), ('pia', 'p@x.de', true)`);
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Sonnenblick') RETURNING id");
    farmId = f!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'pia', 'caretaker')`, [farmId]);
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
  const animal = (species: string, createdAt: string, archivedAt: string | null = null) =>
    q(
      `INSERT INTO farm_animals (farm_id, name, species, registration_number, created_at, archived_at) VALUES ($1, 'Tier', $2, gen_random_uuid()::text, $3, $4)`,
      [farmId, species, createdAt, archivedAt],
    );
  const duty = (data: any, key: string) => data.duties.find((d: any) => d.key === key);

  it("lists the duties of the farm's species", async () => {
    expect((await api("GET", `/farms/${farmId}/duties`)).data).toEqual({ holdingNumber: null, housingOrderUntil: null, species: [], duties: [] });
    await animal("goat", "2025-06-01T10:00:00Z");
    await animal("goat", "2025-06-01T10:00:00Z", "2025-11-01T10:00:00Z");
    await q("INSERT INTO herds (farm_id, name, species) VALUES ($1, 'Hühner', 'poultry')", [farmId]);
    as = "pia";
    const { status, data } = await api("GET", `/farms/${farmId}/duties`);
    expect(status).toBe(200);
    expect(data.species.sort()).toEqual(["goat", "poultry"]);
    expect(duty(data, "registration")).toMatchObject({ kind: "once", status: "open", period: "once", species: ["poultry", "goat"] });
    expect(duty(data, "nd_vaccination")).toMatchObject({ kind: "rule", status: "info" });
    // One goat was on the farm on 1 January; the report was due on the 15th.
    expect(duty(data, "hit_report")).toMatchObject({
      status: "overdue",
      period: "2026",
      stock: { day: "2026-01-01", counts: [{ species: "goat", count: 1 }], current: false },
    });
  });

  it("lets admins tick duties off and back", async () => {
    await animal("goat", "2025-06-01T10:00:00Z");
    as = "pia";
    expect((await api("PUT", `/farms/${farmId}/duties/registration`, { done: true })).status).toBe(403);
    as = "anna";
    let r = await api("PUT", `/farms/${farmId}/duties/registration`, { done: true });
    expect(duty(r.data, "registration")).toMatchObject({ status: "done", doneOn: "2026-10-19" });
    r = await api("PUT", `/farms/${farmId}/duties/hit_report`, { done: true });
    expect(duty(r.data, "hit_report")).toMatchObject({ status: "done", period: "2026" });
    // Ticking twice keeps the first date.
    fixedDay = "2026-10-20";
    r = await api("PUT", `/farms/${farmId}/duties/registration`, { done: true });
    expect(duty(r.data, "registration").doneOn).toBe("2026-10-19");
    r = await api("PUT", `/farms/${farmId}/duties/registration`, { done: false });
    expect(duty(r.data, "registration")).toMatchObject({ status: "open", doneOn: null });
    // Rules cannot be ticked, duties of other species do not exist here.
    expect((await api("PUT", `/farms/${farmId}/duties/catering_waste`, { done: true })).status).toBe(404);
    expect((await api("PUT", `/farms/${farmId}/duties/eartags_cattle`, { done: true })).status).toBe(404);
    expect((await api("PUT", `/farms/${farmId}/duties/registration`, { done: "ja" })).status).toBe(400);
  });

  it("does not tick off next year's report before the stock day", async () => {
    await animal("sheep", "2026-04-01T10:00:00Z");
    const r = await api("PUT", `/farms/${farmId}/duties/tsk_report`, { done: true });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/1\. Januar 2027/);
  });

  it("stores the registration number and the housing order", async () => {
    await animal("poultry", "2025-06-01T10:00:00Z");
    as = "pia";
    expect((await api("PUT", `/farms/${farmId}/duties`, { holdingNumber: "276 09 123 456 7890" })).status).toBe(403);
    as = "anna";
    let r = await api("PUT", `/farms/${farmId}/duties`, { holdingNumber: " 276 09 123 456 7890 ", housingOrderUntil: "2026-11-30" });
    expect(r.data).toMatchObject({ holdingNumber: "276 09 123 456 7890", housingOrderUntil: "2026-11-30" });
    expect((await api("PUT", `/farms/${farmId}/duties`, { housingOrderUntil: "2026-10-01" })).status).toBe(400);
    expect((await api("PUT", `/farms/${farmId}/duties`, { housingOrderUntil: "2026-02-30" })).status).toBe(400);
    expect((await api("PUT", `/farms/${farmId}/duties`, { holdingNumber: "x".repeat(31) })).status).toBe(400);
    // An order that has ended is not shown any more.
    fixedDay = "2026-12-01";
    expect((await api("GET", `/farms/${farmId}/duties`)).data.housingOrderUntil).toBeNull();
    r = await api("PUT", `/farms/${farmId}/duties`, { holdingNumber: null });
    expect(r.data.holdingNumber).toBeNull();
  });

  it("pushes the stock report to the admins on 2 and 12 January until it is ticked off", async () => {
    const { sendDutyDigests } = await import("./farmDuties");
    await animal("goat", "2026-12-28T10:00:00Z");
    await animal("rabbit", "2026-12-28T10:00:00Z");
    await animal("goat", "2027-01-05T10:00:00Z");
    // Not before 07:30, not on other days.
    expect(await sendDutyDigests("07:00", "2027-01-02")).toBe(0);
    expect(await sendDutyDigests("08:00", "2027-01-03")).toBe(0);
    expect(await sendDutyDigests("08:00", "2027-01-02")).toBe(1);
    expect(await sendDutyDigests("08:05", "2027-01-02")).toBe(0);
    expect(sendPushToUser.mock.calls).toEqual([
      [
        "anna",
        {
          topic: "duties",
          title: "Bestandsmeldung fällig",
          body: "Stand 1. Januar laut App: Ziegen 1. Bitte bis 15.01. an Tierseuchenkasse und HI-Tier melden und in der App abhaken.",
          tag: `duties-${farmId}-2027-01-02`,
          url: "/farm/pflichten",
        },
      ],
    ]);
    fixedDay = "2027-01-05";
    await api("PUT", `/farms/${farmId}/duties/tsk_report`, { done: true });
    await api("PUT", `/farms/${farmId}/duties/hit_report`, { done: true });
    expect(await sendDutyDigests("08:00", "2027-01-12")).toBe(0);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });
});
