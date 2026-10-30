/**
 * Pilz-Scan mit drei Fotos und Freigabe durch den Betreiber (docs/scannen.md)
 * against a REAL Postgres, through the HTTP routes:
 *  - only the app owner releases a mushroom as edible, and only mushrooms;
 *  - a three-photo scan may re-rate an archived entry that lacks the gills;
 *  - a released entry is never changed by a later scan.
 *
 * Skipped unless TEST_DATABASE_URL equals DATABASE_URL (throwaway database
 * with the schema pushed). Truncates tables – never point it at real data.
 * Run the integration files one after another (--no-file-parallelism).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const ai = vi.hoisted(() => ({ quick: vi.fn(), full: vi.fn() }));
vi.mock("./plantIdentification", async (orig) => ({
  ...(await orig<typeof import("./plantIdentification")>()),
  quickIdentifyPlant: (...args: unknown[]) => ai.quick(...args),
  identifyPlant: (...args: unknown[]) => ai.full(...args),
  generateSymptomApplicationsForPlant: async () => ({}),
}));
vi.mock("./imageStorage", async (orig) => ({
  ...(await orig<typeof import("./imageStorage")>()),
  uploadImage: async () => null,
}));

const testUrl = process.env["TEST_DATABASE_URL"];
const enabled =
  !!testUrl && testUrl === (process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"]);

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

describe.skipIf(!enabled)("Pilz-Scan und Freigabe (real database)", () => {
  let server: Server;
  let base = "";
  let as = { id: "anna", isOwner: false };

  async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
    const { pool } = await import("@workspace/db");
    return (await pool.query(text, params)).rows as T[];
  }
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  };
  const plant = async (fields: Record<string, unknown>) => {
    const row = {
      german_name: "Wiesenchampignon",
      botanical_name: "Agaricus campestris",
      category: "mushroom",
      human_status: "poisonous",
      poultry_status: "poisonous",
      edibility_details: "⚠️ Nicht als essbar bestätigt: Die Bestimmung war nicht eindeutig genug. Zur Sicherheit …\n\nEssbar, Verwechslung mit Karbol-Champignon möglich.",
      animal_toxicity_details: "-",
      active_ingredients: "-",
      human_benefits: "-",
      poultry_benefits: "-",
      has_side_image: true,
      ...fields,
    };
    const keys = Object.keys(row);
    const [r] = await q<{ id: number }>(
      `INSERT INTO plants (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      Object.values(row),
    );
    return r!.id;
  };
  const identification = (humanStatus: "edible" | "poisonous") => ({
    istPflanze: true,
    germanName: "Wiesenchampignon",
    botanicalName: "Agaricus campestris",
    category: "mushroom",
    humanStatus,
    poultryStatus: "poisonous",
    edibilityDetails: humanStatus === "edible" ? "Essbar." : "Nicht bestätigt.",
    animalToxicityDetails: "-",
    activeIngredients: "-",
    humanBenefits: "-",
    poultryBenefits: "-",
    animals: {},
    symptoms: {},
    symptomApplications: {},
    habitat: "",
    siteConditions: "",
    otherUses: "",
    fertilizerTips: "",
    preparation: "",
  });

  beforeAll(async () => {
    process.env["GEMINI_API_KEY"] ??= "test-key-not-used";
    const app = express();
    app.use(express.json({ limit: "15mb" }));
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { user: unknown }).user = { id: as.id, approved: true, isOwner: as.isOwner };
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
    as = { id: "anna", isOwner: false };
    ai.quick.mockReset();
    ai.full.mockReset();
    await q("TRUNCATE users, scan_attempts, plants, plant_scans, premium RESTART IDENTITY CASCADE");
    await q(`INSERT INTO users (id, email, approved, is_owner) VALUES ('anna', 'anna@example.org', true, false), ('chef', 'chef@example.org', true, true)`);
  });

  it("lets only the owner release a mushroom as edible, and take it back", async () => {
    const id = await plant({});
    const tree = await plant({ german_name: "Eiche", botanical_name: "Quercus robur", category: "tree" });
    expect((await api("PUT", `/plants/${id}/edible-release`, { released: true })).status).toBe(403);

    as = { id: "chef", isOwner: true };
    const released = await api("PUT", `/plants/${id}/edible-release`, { released: true });
    expect(released.status).toBe(200);
    expect(released.data).toMatchObject({ humanStatus: "edible", humanToxicityLevel: null });
    expect(released.data.edibleReleasedAt).not.toBeNull();
    expect(released.data.edibilityDetails).toMatch(/^✅ Vom Betreiber am \d\d\.\d\d\.\d{4} anhand der Fotos geprüft/);
    expect(released.data.edibilityDetails).not.toContain("Nicht als essbar bestätigt");
    expect(released.data.edibilityDetails).toContain("Karbol-Champignon");

    const back = await api("PUT", `/plants/${id}/edible-release`, { released: false });
    expect(back.data).toMatchObject({ humanStatus: "poisonous", humanToxicityLevel: "poisonous" });
    expect((await api("PUT", `/plants/${tree}/edible-release`, { released: true })).status).toBe(400);
    expect((await api("PUT", `/plants/999999/edible-release`, { released: true })).status).toBe(404);
  });

  it("shows a released single-photo mushroom as edible (the read-time gate lets it through)", async () => {
    const id = await plant({ human_status: "edible", has_side_image: false, edibility_details: "Essbar." });
    expect((await api("GET", `/plants/${id}`)).data.humanStatus).toBe("poisonous");
    as = { id: "chef", isOwner: true };
    await api("PUT", `/plants/${id}/edible-release`, { released: true });
    expect((await api("GET", `/plants/${id}`)).data.humanStatus).toBe("edible");
  });

  it("re-rates an archived two-photo entry with a three-photo scan, never a released one", async () => {
    const id = await plant({});
    ai.quick.mockResolvedValue({ istPflanze: true, germanName: "Wiesenchampignon", botanicalName: "Agaricus campestris", imageQuality: 7 });
    ai.full.mockResolvedValue(identification("edible"));
    const scan = await api("POST", "/plants/scan", { image: PHOTO, imageSide: PHOTO, imageGills: PHOTO });
    expect(scan.status).toBe(201);
    expect(ai.full).toHaveBeenCalledWith(PHOTO, PHOTO, PHOTO);
    expect(scan.data.plant).toMatchObject({ id, humanStatus: "edible", hasGillsImage: true });

    // Released by hand (here: taken back) – a later scan leaves it alone.
    as = { id: "chef", isOwner: true };
    await api("PUT", `/plants/${id}/edible-release`, { released: false });
    await q("UPDATE plants SET has_gills_image = false WHERE id = $1", [id]);
    ai.full.mockClear();
    const again = await api("POST", "/plants/scan", { image: PHOTO, imageSide: PHOTO, imageGills: PHOTO });
    expect(ai.full).not.toHaveBeenCalled();
    expect(again.data.plant.humanStatus).toBe("poisonous");
  });

  it("ignores gills without a side view", async () => {
    ai.quick.mockResolvedValue({ istPflanze: true, germanName: "Wiesenchampignon", botanicalName: "Agaricus campestris", imageQuality: 7 });
    ai.full.mockResolvedValue(identification("poisonous"));
    await api("POST", "/plants/scan", { image: PHOTO, imageGills: PHOTO });
    expect(ai.full).toHaveBeenCalledWith(PHOTO, undefined, undefined);
  });
});
