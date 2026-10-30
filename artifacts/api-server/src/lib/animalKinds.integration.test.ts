/**
 * Alle Tierarten in „Essbar für“ und Kräuter-Hexe (docs/kraeuter-hexe.md)
 * against a REAL Postgres, through the owner's backfill routes: a plant with
 * the first five animal kinds gets the newly added kinds, and what is already
 * stored (fact sheets with their toxicity level, symptom tags, instructions)
 * stays as it is.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ANIMAL_KINDS, HEAL_TARGET_KINDS } from "@workspace/db";

const sheet = (details: string) => ({ status: "safe", toxicityDetails: details, benefits: `Hilft ${details}` });
const ai = vi.hoisted(() => ({
  animals: vi.fn(),
  symptoms: vi.fn(),
  applications: vi.fn(),
}));
vi.mock("./plantIdentification", async (orig) => ({
  ...(await orig<typeof import("./plantIdentification")>()),
  generateAnimalsForPlant: (...args: unknown[]) => ai.animals(...args),
  generateSymptomsForPlant: (...args: unknown[]) => ai.symptoms(...args),
  generateSymptomApplicationsForPlant: (...args: unknown[]) => ai.applications(...args),
}));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const OLD_KINDS = ["poultry", "rabbit", "guineaPig", "cat", "horse"] as const;

describe.skipIf(!enabled)("Neue Tierarten nachfüllen (real database)", () => {
  let server: Server;
  let base = "";

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }
  const post = async (path: string) => {
    const res = await fetch(`${base}${path}`, { method: "POST" });
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  };

  beforeAll(async () => {
    process.env["GEMINI_API_KEY"] ??= "test-key-not-used";
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: "chef", approved: true, isOwner: true };
      (req as unknown as { isAuthenticated: () => boolean }).isAuthenticated = () => true;
      (req as unknown as { log: unknown }).log = { error: () => {}, warn: () => {}, info: () => {} };
      next();
    });
    app.use((await import("../routes/plants")).default);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await q("TRUNCATE plants, plant_scans RESTART IDENTITY CASCADE");
    if (server) await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(async () => {
    ai.animals.mockReset();
    ai.symptoms.mockReset();
    ai.applications.mockReset();
    await q("TRUNCATE users, plants, plant_scans RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('chef', 'chef@example.org', true, true)`);
  });

  it("fills only the new kinds and keeps everything already stored", async () => {
    const oldAnimals = Object.fromEntries(
      OLD_KINDS.map((k) => [k, { status: "poisonous", toxicityLevel: "lethal", toxicityDetails: `alt ${k}`, benefits: "-" }]),
    );
    const oldSymptoms = Object.fromEntries(["human", ...OLD_KINDS].map((k) => [k, [`Alt ${k}`]]));
    const oldApps = Object.fromEntries(["human", ...OLD_KINDS].map((k) => [k, { [`Alt ${k}`]: "wie bisher" }]));
    const [{ id }] = await q<{ id: number }>(
      `INSERT INTO plants (german_name, botanical_name, category, human_status, poultry_status, edibility_details,
         animal_toxicity_details, active_ingredients, human_benefits, poultry_benefits, animals, symptoms, symptom_applications)
       VALUES ('Eibe', 'Taxus baccata', 'poisonous', 'poisonous', 'poisonous', '-', '-', '-', 'keine', '-', $1, $2, $3)
       RETURNING id`,
      [oldAnimals, oldSymptoms, oldApps],
    ) as [{ id: number }];

    // The AI answers for every kind; only the new ones may be taken.
    ai.animals.mockResolvedValue(Object.fromEntries(ANIMAL_KINDS.map((k) => [k, sheet(`neu ${k}`)])));
    const animals = await post("/plants/animals/backfill");
    expect(animals.data).toMatchObject({ processed: 1, done: true });

    ai.symptoms.mockImplementation(async ({ benefits }: { benefits: Record<string, string> }) => {
      // Grounded in each kind's own benefit text, the new kinds included.
      expect(benefits.dog).toBe("Hilft neu dog");
      return Object.fromEntries(HEAL_TARGET_KINDS.map((k) => [k, [`Neu ${k}`]]));
    });
    expect((await post("/plants/symptoms/backfill")).data).toMatchObject({ processed: 1, done: true });

    ai.applications.mockResolvedValue(
      Object.fromEntries(HEAL_TARGET_KINDS.map((k) => [k, { [`Neu ${k}`]: "neu" }])),
    );
    expect((await post("/plants/symptom-applications/backfill")).data).toMatchObject({ processed: 1, done: true });

    const [row] = await q<{ animals: any; symptoms: any; symptom_applications: any }>(
      "SELECT animals, symptoms, symptom_applications FROM plants WHERE id = $1",
      [id],
    );
    expect(Object.keys(row!.animals).sort()).toEqual([...ANIMAL_KINDS].sort());
    expect(row!.animals.horse).toMatchObject({ toxicityLevel: "lethal", toxicityDetails: "alt horse" });
    expect(row!.animals.donkey).toMatchObject({ toxicityDetails: "neu donkey" });
    expect(row!.symptoms.human).toEqual(["Alt human"]);
    expect(row!.symptoms.goat).toEqual(["Neu goat"]);
    expect(row!.symptom_applications.cat).toEqual({ "Alt cat": "wie bisher" });
    expect(row!.symptom_applications.pig).toEqual({ "Neu pig": "neu" });

    // Nothing left to do: a second round asks the AI nothing.
    expect((await post("/plants/animals/backfill")).data).toMatchObject({ processed: 0, done: true });
    expect(ai.animals).toHaveBeenCalledTimes(1);
  });
});
