/**
 * Unit tests for the GET /plants/my-scans endpoint.
 *
 * Verifies the user-isolation property: the endpoint must return only plants
 * that the requesting user has personally scanned, never plants whose scan
 * record belongs to a different user.
 *
 * All I/O is faked:
 *   – @workspace/db  → in-memory scan records + plants
 *   – drizzle-orm    → query-builder helpers return inspectable plain objects
 *   – plantIdentification → stubbed (not called by my-scans)
 *
 * Auth is injected via a per-test middleware on the test Express app.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// ---------------------------------------------------------------------------
// Shared test fixtures (vi.hoisted so they are accessible inside vi.mock
// factory functions, which run before module-level imports are evaluated)
// ---------------------------------------------------------------------------

const { allPlants, scanRecords } = vi.hoisted(() => {
  type MockPlant = {
    id: number;
    germanName: string;
    botanicalName: string;
    category: string;
    humanStatus: string;
    poultryStatus: string;
    edibilityDetails: string;
    animalToxicityDetails: string;
    activeIngredients: string;
    humanBenefits: string;
    poultryBenefits: string;
    habitat: string;
    siteConditions: string;
    otherUses: string;
    fertilizerTips: string;
    animals: Record<string, never>;
    symptoms: Record<string, never>;
    symptomApplications: Record<string, never>;
    humanToxicityLevel: null;
    hasEdibleFruits: null;
    preparation: string;
    scannedByUserId: string | null;
    hasSideImage: boolean;
    createdAt: Date;
  };

  function makePlant(id: number, name: string, scannedBy: string | null = null): MockPlant {
    return {
      id,
      germanName: name,
      botanicalName: `Planta ${name.toLowerCase()}`,
      category: "medicinal",
      humanStatus: "edible",
      poultryStatus: "safe",
      edibilityDetails: "",
      animalToxicityDetails: "",
      activeIngredients: "",
      humanBenefits: "",
      poultryBenefits: "",
      habitat: "",
      siteConditions: "",
      otherUses: "",
      fertilizerTips: "",
      animals: {},
      symptoms: {},
      symptomApplications: {},
      humanToxicityLevel: null,
      hasEdibleFruits: null,
      preparation: "",
      scannedByUserId: scannedBy,
      hasSideImage: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  }

  return {
    // Plants in the archive (served by db.select)
    allPlants: [
      makePlant(1, "Brennnessel", "user-a"),
      makePlant(2, "Kamille", "user-a"),
      makePlant(3, "Pilz", "user-b"),
      // Plant 4 is the key conflict-case fixture:
      // scannedByUserId says "user-a" but the plant_scans record belongs to
      // user-b only. A correct implementation must follow plant_scans and
      // return this plant to user-b, not user-a.
      makePlant(4, "Löwenzahn", "user-a"), // scannedByUserId = user-a
    ],
    // Scan-ownership records (served by db.selectDistinct)
    scanRecords: [
      { userId: "user-a", plantId: 1 },
      { userId: "user-a", plantId: 2 },
      { userId: "user-b", plantId: 3 },
      { userId: "user-b", plantId: 4 }, // user-b owns plant 4 via plant_scans
    ] as Array<{ userId: string; plantId: number }>,
  };
});

// ---------------------------------------------------------------------------
// Mock: drizzle-orm
// eq / inArray return plain objects the mock-db can inspect; everything else
// is a safe no-op so module-level SQL expressions in plants.ts don't throw.
// ---------------------------------------------------------------------------

vi.mock("drizzle-orm", () => {
  const sql = Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => ({ __sql: true }),
    { raw: () => ({ __sql: true }) },
  );
  return {
    eq: (col: { __name?: string }, value: unknown) => ({
      __eq: col.__name,
      __val: value,
    }),
    inArray: (col: { __name?: string }, values: unknown) => ({
      __inArray: col.__name,
      __vals: values,
    }),
    and: (...args: unknown[]) => ({ __and: args }),
    isNull: (col: { __name?: string }) => ({ __isNull: col.__name }),
    desc: (col: unknown) => col,
    sql,
    getTableColumns: (table: { __columns?: Record<string, unknown> }) =>
      table.__columns ?? {},
  };
});

// ---------------------------------------------------------------------------
// Mock: @workspace/db
// An in-memory implementation of the two Drizzle query chains used by the
// my-scans route.
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  // Column shape: __name lets the eq/inArray mocks identify which column was
  // queried so the in-memory filter can extract the right value.
  const col = (name: string) => ({ __name: name });

  const allPlantsColumns = {
    id: col("id"),
    germanName: col("germanName"),
    botanicalName: col("botanicalName"),
    category: col("category"),
    humanStatus: col("humanStatus"),
    poultryStatus: col("poultryStatus"),
    edibilityDetails: col("edibilityDetails"),
    animalToxicityDetails: col("animalToxicityDetails"),
    activeIngredients: col("activeIngredients"),
    humanBenefits: col("humanBenefits"),
    poultryBenefits: col("poultryBenefits"),
    habitat: col("habitat"),
    siteConditions: col("siteConditions"),
    otherUses: col("otherUses"),
    fertilizerTips: col("fertilizerTips"),
    animals: col("animals"),
    symptoms: col("symptoms"),
    symptomApplications: col("symptomApplications"),
    humanToxicityLevel: col("humanToxicityLevel"),
    hasEdibleFruits: col("hasEdibleFruits"),
    preparation: col("preparation"),
    scannedByUserId: col("scannedByUserId"),
    medicinalVerifiedAt: col("medicinalVerifiedAt"),
    createdAt: col("createdAt"),
    // These two are stripped by getTableColumns destructuring in plants.ts
    imageData: col("imageData"),
    imageDataSide: col("imageDataSide"),
  };

  const plantsTable = { __columns: allPlantsColumns, ...allPlantsColumns };

  const plantScansTable = {
    userId: col("userId"),
    plantId: col("plantId"),
    id: col("id"),
    scannedAt: col("scannedAt"),
  };

  const favoritesTable = {
    userId: col("userId"),
    plantId: col("plantId"),
  };

  const db = {
    // ── selectDistinct().from().where() ─────────────────────────────────
    // Used to build the plantIds subquery filtered to a single user.
    selectDistinct: (_fields: unknown) => ({
      from: (_table: unknown) => ({
        where: (condition: { __eq?: string; __val?: unknown }) => {
          if (condition.__eq === "userId") {
            // Return the plantIds this user has scan records for.
            return scanRecords
              .filter((s) => s.userId === condition.__val)
              .map((s) => s.plantId);
          }
          return [];
        },
      }),
    }),

    // ── select().from().where().orderBy() ────────────────────────────────
    // Used to fetch the plant rows matching the plantIds subquery.
    select: (_fields: unknown) => ({
      from: (_table: unknown) => ({
        where: (condition: { __inArray?: string; __vals?: number[] }) => ({
          orderBy: (_order: unknown) => {
            const plantIds = condition.__vals ?? [];
            return Promise.resolve(
              allPlants.filter((p) => (plantIds as number[]).includes(p.id)),
            );
          },
        }),
      }),
    }),

    // ── insert().values().onConflictDoNothing() ──────────────────────────
    // Not exercised by my-scans but imported at the top of plants.ts.
    insert: (_table: unknown) => ({
      values: (_vals: unknown) => ({
        onConflictDoNothing: () => Promise.resolve(),
        returning: () => Promise.resolve([]),
      }),
    }),

    // ── update().set().where() ───────────────────────────────────────────
    update: (_table: unknown) => ({
      set: (_vals: unknown) => ({
        where: (_cond: unknown) => Promise.resolve(),
      }),
    }),

    // ── delete().where() ────────────────────────────────────────────────
    delete: (_table: unknown) => ({
      where: (_cond: unknown) => Promise.resolve(),
    }),
  };

  return {
    db,
    plantsTable,
    plantScansTable,
    favoritesTable,
    usersTable: { id: col("id") },
    PLANT_CATEGORIES: [
      "poisonous", "edible", "medicinal", "mushroom",
      "tree", "shrub", "moss", "cactus",
    ],
    ANIMAL_KINDS: ["poultry", "rabbit", "guineaPig", "cat", "horse"],
    HEAL_TARGET_KINDS: ["human", "poultry", "rabbit", "guineaPig", "cat", "horse"],
  };
});

// ---------------------------------------------------------------------------
// Mock: plantIdentification (AI — not called by the my-scans route)
// ---------------------------------------------------------------------------

vi.mock("../lib/plantIdentification", () => ({
  identifyPlant: vi.fn(),
  generateAnimalsForPlant: vi.fn(),
  generateSymptomsForPlant: vi.fn(),
  generateSymptomApplicationsForPlant: vi.fn(),
  generateToxicityForPlant: vi.fn(),
  generateFruitsForPlant: vi.fn(),
  generatePreparationForPlant: vi.fn(),
  reviewMedicinalPlant: vi.fn(),
  reviewEdibleForMedicinal: vi.fn(),
  checkPlantHealth: vi.fn(),
  normalizeSymptomTag: vi.fn((tag: string) => tag),
  UNKNOWN_BOTANICAL_NAME: "Unbekannt",
}));

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

// Import the plants router *after* all mocks are declared so the module-level
// drizzle expressions and db references pick up the mocked versions.
import plantsRouter from "./plants";

let server: ReturnType<typeof createServer>;
let baseUrl: string;
let currentUserId = "user-a";

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      const app = express();
      app.use(express.json());

      // Inject a test user without needing a real session store.
      app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as Request & { user: unknown }).user = {
          id: currentUserId,
          approved: true,
          isOwner: false,
          email: "test@test.invalid",
          firstName: "Test",
          lastName: "User",
          profileImageUrl: null,
          username: null,
          leavesCount: 0,
        };
        req.isAuthenticated = (function () {
          return true;
        }) as Request["isAuthenticated"];
        next();
      });

      app.use("/api", plantsRouter);

      server = createServer(app);
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  currentUserId = "user-a"; // reset to a known user before each test
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/plants/my-scans — user isolation", () => {
  it("returns the plants scanned by the requesting user", async () => {
    currentUserId = "user-a";
    const res = await fetch(`${baseUrl}/api/plants/my-scans`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number }[];
    expect(Array.isArray(body)).toBe(true);

    const ids = body.map((p) => p.id);
    expect(ids).toContain(1); // Brennnessel — scanned by user-a
    expect(ids).toContain(2); // Kamille     — scanned by user-a
  });

  it("does NOT return plants scanned by a different user", async () => {
    currentUserId = "user-a";
    const res = await fetch(`${baseUrl}/api/plants/my-scans`);
    const body = (await res.json()) as { id: number }[];

    const ids = body.map((p) => p.id);
    expect(ids).not.toContain(3); // Pilz — scanned by user-b, must not appear for user-a
  });

  it("returns only the requesting user's plants, not the full archive", async () => {
    currentUserId = "user-b";
    const res = await fetch(`${baseUrl}/api/plants/my-scans`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number }[];
    const ids = body.map((p) => p.id);

    expect(ids).toContain(3);        // Pilz — user-b's plant_scans record
    expect(ids).toContain(4);        // Löwenzahn — user-b's plant_scans record
    expect(ids).not.toContain(1);    // user-a's plants must not appear
    expect(ids).not.toContain(2);
  });

  it("returns an empty array for a user who has never scanned anything", async () => {
    currentUserId = "user-c"; // no scan records for this user
    const res = await fetch(`${baseUrl}/api/plants/my-scans`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });

  it("rejects unauthenticated requests with 401", async () => {
    // Temporarily override the auth injector to simulate an unauthenticated call.
    // We do this by creating a second one-off test app rather than mutating the
    // shared server (which avoids flaky parallel-test interference).
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: Request, _res: Response, next: NextFunction) => {
      // No req.user set — isAuthenticated returns false.
      req.isAuthenticated = (function () {
          return false;
        }) as Request["isAuthenticated"];
      next();
    });
    unauthApp.use("/api", plantsRouter);

    await new Promise<void>((resolve) => {
      const unauthServer = createServer(unauthApp);
      unauthServer.listen(0, async () => {
        const addr = unauthServer.address() as AddressInfo;
        const res = await fetch(
          `http://localhost:${addr.port}/api/plants/my-scans`,
        );
        expect(res.status).toBe(401);
        unauthServer.close(() => resolve());
      });
    });
  });

  it("plant_scans is the sole source of truth — scannedByUserId on the plant row is ignored", async () => {
    // Plant 4 has scannedByUserId = "user-a" (the column that used to be the
    // source of truth), but the plant_scans table has a record for user-b only.
    //
    // A naïve implementation filtering by plantsTable.scannedByUserId would
    // return plant 4 to user-a and hide it from user-b — the opposite of
    // what the plant_scans table says.
    //
    // The correct implementation (using plantScansTable.userId) must:
    //   • NOT return plant 4 to user-a (no plant_scans record for user-a)
    //   • Return plant 4 to user-b (plant_scans record exists for user-b)

    currentUserId = "user-a";
    const resA = await fetch(`${baseUrl}/api/plants/my-scans`);
    const bodyA = (await resA.json()) as { id: number }[];
    expect(bodyA.map((p) => p.id)).not.toContain(4); // user-a has NO plant_scans row for plant 4

    currentUserId = "user-b";
    const resB = await fetch(`${baseUrl}/api/plants/my-scans`);
    const bodyB = (await resB.json()) as { id: number }[];
    expect(bodyB.map((p) => p.id)).toContain(4); // user-b DOES have a plant_scans row for plant 4
  });
});
