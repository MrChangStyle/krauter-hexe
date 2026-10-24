import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { colonyHints, pushLines, varroaLevel } = await import("./bees");
type Facts = Parameters<typeof colonyHints>[0];

const colony = (o: Partial<Facts> = {}): Facts => ({
  id: 1,
  name: "Volk 1",
  status: "active",
  queenYear: 2025,
  lastInspection: null,
  lastMiteCount: null,
  lastTreatmentOn: null,
  feedKgSince: () => 0,
  ...o,
});
const kinds = (c: Facts, day: string) => colonyHints(c, day).map((h) => `${h.kind}${h.urgent ? "!" : ""}`);

describe("varroaLevel", () => {
  it("is stricter outside the brood season", () => {
    expect(["2026-05-10", "2026-08-10", "2026-11-10"].map((d) => varroaLevel(2, d))).toEqual(["ok", "ok", "treat"]);
    expect(varroaLevel(4, "2026-05-10")).toBe("watch");
    expect(varroaLevel(12, "2026-08-10")).toBe("treat");
    expect(varroaLevel(0.6, "2026-12-01")).toBe("watch");
  });
});

describe("colonyHints", () => {
  it("asks for swarm checks every 9 days from April to June", () => {
    expect(kinds(colony(), "2026-04-02")).toEqual(["swarm-check"]);
    const seen = (date: string, queenCells: number | null = 0) => colony({ lastInspection: { date, queenCells, mitesPerDay: null } });
    expect(kinds(seen("2026-05-05"), "2026-05-10")).toEqual([]);
    expect(kinds(seen("2026-05-01"), "2026-05-10")).toEqual(["swarm-check"]);
    expect(kinds(seen("2026-04-25"), "2026-05-10")).toEqual(["swarm-check!"]);
    expect(kinds(seen("2026-05-08", 3), "2026-05-10")).toEqual(["swarm!"]);
    expect(kinds(seen("2026-05-01"), "2026-07-10")).toEqual(["summer-treatment"]);
  });

  it("reads the last mite count of the past 30 days", () => {
    const counted = (date: string, mitesPerDay: number) => colony({ lastMiteCount: { date, mitesPerDay } });
    expect(colonyHints(counted("2026-10-01", 2), "2026-10-10")[0]).toMatchObject({ kind: "varroa", urgent: true, text: "Varroa: 2 Milben am Tag (01.10.) – bald behandeln." });
    expect(kinds(counted("2026-08-20", 6), "2026-08-25")).toContain("varroa");
    expect(kinds(counted("2026-08-20", 6), "2026-08-25")).not.toContain("varroa!");
    expect(kinds(counted("2026-08-01", 30), "2026-10-10")).toEqual([]);
  });

  it("reminds of summer treatment, feeding and winter treatment", () => {
    expect(kinds(colony(), "2026-08-20")).toEqual(["summer-treatment!", "feeding"]);
    expect(kinds(colony({ lastTreatmentOn: "2026-08-01", feedKgSince: () => 16 }), "2026-08-20")).toEqual([]);
    expect(kinds(colony({ lastTreatmentOn: "2026-08-01", feedKgSince: () => 8 }), "2026-09-20")).toEqual(["feeding!"]);
    expect(colonyHints(colony({ lastTreatmentOn: "2026-08-01", feedKgSince: () => 8.25 }), "2026-09-20")[0]!.text).toMatch(/^Einfüttern: bisher 8,3 kg/);
    expect(kinds(colony({ lastTreatmentOn: "2026-08-01" }), "2026-12-05")).toEqual(["winter-treatment"]);
    expect(kinds(colony({ lastTreatmentOn: "2026-12-01" }), "2026-12-05")).toEqual([]);
  });

  it("names an old queen and leaves ended colonies alone", () => {
    expect(kinds(colony({ queenYear: 2023 }), "2026-03-01")).toEqual(["old-queen"]);
    expect(kinds(colony({ status: "lost", queenYear: 2020 }), "2026-05-01")).toEqual([]);
  });
});

describe("pushLines", () => {
  it("pushes only on the day a reminder comes due", () => {
    const c = colony({ name: "Linde", lastInspection: { date: "2026-05-01", queenCells: 0, mitesPerDay: null } });
    expect(pushLines([c], "2026-05-10")).toEqual(["Linde: Schwarmkontrolle fällig"]);
    expect(pushLines([c], "2026-05-11")).toEqual([]);
    expect(pushLines([colony({ name: "Neu" })], "2026-04-01")).toEqual(["Neu: Schwarmkontrolle fällig"]);
    expect(pushLines([colony({ name: "A" })], "2026-07-25")).toEqual(["A: Sommerbehandlung gegen Varroa einplanen"]);
    expect(pushLines([colony({ name: "A", lastTreatmentOn: "2026-07-01" })], "2026-08-15")).toEqual(["A: einfüttern"]);
    expect(pushLines([colony({ name: "A", lastTreatmentOn: "2026-07-01" })], "2026-12-10")).toEqual(["A: Winterbehandlung im brutfreien Volk"]);
    expect(pushLines([colony({ status: "sold" })], "2026-07-25")).toEqual([]);
  });
});
