/**
 * Vertretung against a REAL Postgres, through the HTTP routes: a stand-in with
 * a last day of access (never an admin), access ending after that day, the
 * cleanup, and the handover page (note, contacts, withdrawal periods, recent
 * treatments).
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

let fixedDay = "2026-10-19";
vi.mock("./monitoring", async (orig) => ({ ...(await orig<object>()), berlinDay: () => fixedDay }));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

describe.skipIf(!enabled)("Vertretung (real database)", () => {
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
    fixedDay = "2026-10-19";
    await q("TRUNCATE farms, farm_memberships, users RESTART IDENTITY CASCADE");
    await q(
      `INSERT INTO users (id, email, approved, first_name, last_name) VALUES ('anna', 'anna@x.de', true, 'Anna', 'Hof'), ('nina', 'nina@x.de', true, 'Nina', NULL), ('gast', 'g@x.de', true, NULL, NULL)`,
    );
    const [f] = await q<{ id: number }>("INSERT INTO farms (name) VALUES ('Hof Anna') RETURNING id");
    farmId = f!.id;
    await q(`INSERT INTO farm_memberships (farm_id, user_id, role) VALUES ($1, 'anna', 'admin'), ($1, 'gast', 'guest')`, [farmId]);
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

  it("gives a stand-in access up to a day, and not one day longer", async () => {
    expect((await api("POST", `/farms/${farmId}/members`, { email: "nina@x.de", role: "admin", accessUntil: "2026-10-26" })).status).toBe(400);
    expect((await api("POST", `/farms/${farmId}/members`, { email: "nina@x.de", role: "caretaker", accessUntil: "2026-10-18" })).status).toBe(400);
    const added = await api("POST", `/farms/${farmId}/members`, { email: "nina@x.de", role: "caretaker", accessUntil: "2026-10-26" });
    expect(added.data.find((m: any) => m.userId === "nina")).toMatchObject({ role: "caretaker", accessUntil: "2026-10-26" });

    as = "nina";
    expect((await api("GET", "/farms")).data).toEqual([{ id: farmId, name: "Hof Anna", role: "caretaker", accessUntil: "2026-10-26" }]);
    fixedDay = "2026-10-26";
    expect((await api("GET", `/farms/${farmId}/handover`)).status).toBe(200);
    // The day after: gone, even before the cleanup ran.
    fixedDay = "2026-10-27";
    expect((await api("GET", `/farms/${farmId}/handover`)).status).toBe(404);
    expect((await api("GET", "/farms")).data).toEqual([]);
    const { removeExpiredMemberships } = await import("./farmMembers");
    expect(await removeExpiredMemberships("2026-10-27")).toBe(1);
    expect(await q("SELECT user_id FROM farm_memberships ORDER BY user_id")).toEqual([{ user_id: "anna" }, { user_id: "gast" }]);
  });

  it("lets the admin extend or end the limit; making someone admin ends it", async () => {
    await api("POST", `/farms/${farmId}/members`, { email: "nina@x.de", role: "caretaker", accessUntil: "2026-10-26" });
    let members = (await api("PATCH", `/farms/${farmId}/members/nina`, { role: "caretaker", accessUntil: "2026-11-02" })).data;
    expect(members.find((m: any) => m.userId === "nina").accessUntil).toBe("2026-11-02");
    // Only the role: the date stays.
    members = (await api("PATCH", `/farms/${farmId}/members/nina`, { role: "guest" })).data;
    expect(members.find((m: any) => m.userId === "nina")).toMatchObject({ role: "guest", accessUntil: "2026-11-02" });
    expect((await api("PATCH", `/farms/${farmId}/members/nina`, { role: "admin", accessUntil: "2026-11-02" })).status).toBe(400);
    members = (await api("PATCH", `/farms/${farmId}/members/nina`, { role: "admin" })).data;
    expect(members.find((m: any) => m.userId === "nina")).toMatchObject({ role: "admin", accessUntil: null });
  });

  it("shows the handover: note, contacts, running withdrawal periods and recent treatments", async () => {
    const [lotte] = await q<{ id: number }>(`INSERT INTO farm_animals (farm_id, name, species, registration_number) VALUES ($1, 'Lotte', 'goat', 'Z1') RETURNING id`, [farmId]);
    await q(
      `INSERT INTO medical_records (farm_id, animal_id, date, diagnosis, treatment, medication, withdrawal_period_days) VALUES
       ($1, $2, '2026-10-15', 'Moderhinke', 'Klauenbad', 'Oxytetracyclin', 14),
       ($1, $2, '2026-09-01', 'Entwurmung', NULL, 'Flubenol', 7),
       ($1, $2, '2026-10-10', 'Husten', 'Inhalieren', NULL, NULL)`,
      [farmId, lotte!.id],
    );
    const note = await api("PUT", `/farms/${farmId}/handover-note`, { note: "Schlüssel liegt unter dem Blumentopf. Tierärztin Dr. Klee: 0123 456" });
    expect(note.data).toEqual({
      note: "Schlüssel liegt unter dem Blumentopf. Tierärztin Dr. Klee: 0123 456",
      accessUntil: null,
      contacts: [{ displayName: "Anna Hof" }],
      withdrawals: [{ animalName: "Lotte", medication: "Oxytetracyclin", until: "2026-10-29" }],
      recentHealth: [
        { animalName: "Lotte", date: "2026-10-15", diagnosis: "Moderhinke", treatment: "Klauenbad", medication: "Oxytetracyclin" },
        { animalName: "Lotte", date: "2026-10-10", diagnosis: "Husten", treatment: "Inhalieren", medication: null },
      ],
    });
    as = "gast";
    expect((await api("GET", `/farms/${farmId}/handover`)).data.note).toMatch(/^Schlüssel/);
    expect((await api("PUT", `/farms/${farmId}/handover-note`, { note: "x" })).status).toBe(403);
  });
});
