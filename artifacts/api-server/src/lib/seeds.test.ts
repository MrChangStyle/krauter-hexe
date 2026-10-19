import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { SEED_LIFE, seedPlan, seedStatus } = await import("./seeds");
const { GARDEN_CATALOG } = await import("./gardenCatalog");

const base = { cropKey: "moehre", amount: 2, harvestYear: null, useBy: null, testSown: null, testGerminated: null, testedOn: null, archivedAt: null };

describe("Saatgut – germination", () => {
  it("knows every crop of the catalog", () => {
    for (const crop of GARDEN_CATALOG) expect(SEED_LIFE[crop.key], crop.key).toBeDefined();
  });

  it("goes by the harvest year and the crop's years", () => {
    // Möhre: 3 years.
    const s = (harvestYear: number, today = "2026-10-19") => seedStatus({ ...base, harvestYear }, today);
    expect(s(2025)).toEqual({ status: "ok", goodUntil: 2028, germinationRate: null });
    expect(s(2023).status).toBe("check");
    expect(s(2022).status).toBe("old");
    // Zwiebel: 1 year only.
    expect(seedStatus({ ...base, cropKey: "zwiebel", harvestYear: 2025 }, "2026-10-19").status).toBe("check");
    expect(seedStatus({ ...base, cropKey: null, harvestYear: 2025 }, "2026-10-19").goodUntil).toBe(2028);
  });

  it("prefers the packet's use-by date, then a recent test", () => {
    expect(seedStatus({ ...base, harvestYear: 2020, useBy: "2027-12-31" }, "2026-10-19")).toMatchObject({ status: "ok", goodUntil: 2027 });
    expect(seedStatus({ ...base }, "2026-10-19").status).toBe("check");
    const tested = (germinated: number, testedOn = "2026-03-01") => seedStatus({ ...base, harvestYear: 2018, testSown: 20, testGerminated: germinated, testedOn }, "2026-10-19");
    expect(tested(18)).toMatchObject({ status: "ok", germinationRate: 0.9 });
    expect(tested(12).status).toBe("check");
    expect(tested(6).status).toBe("weak");
    // A test older than a year no longer counts.
    expect(tested(18, "2025-03-01").status).toBe("old");
  });

  it("puts empty and archived first", () => {
    expect(seedStatus({ ...base, amount: 0, harvestYear: 2026 }, "2026-10-19").status).toBe("empty");
    expect(seedStatus({ ...base, archivedAt: new Date() }, "2026-10-19").status).toBe("archived");
  });
});

describe("Saatgut – plan", () => {
  it("lists planned crops without seed, and those with only old seed", () => {
    const seed = (cropKey: string, status: string) => ({ cropKey, status }) as never;
    const plan = seedPlan(
      ["tomate", "moehre", "kartoffel", "salat", "salat", "erbse", "unbekannt"],
      [seed("tomate", "ok"), seed("moehre", "old"), seed("moehre", "weak"), seed("erbse", "empty"), seed("salat", "old"), seed("salat", "check")],
    );
    expect(plan).toEqual({
      missing: [
        { cropKey: "erbse", name: "Erbse", vegetative: false },
        { cropKey: "kartoffel", name: "Kartoffel", vegetative: true },
      ],
      check: [{ cropKey: "moehre", name: "Möhre", vegetative: false }],
    });
  });
});
