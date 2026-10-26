import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { testPhaseEnd, testerSource } = await import("./premium");

describe("Testphase", () => {
  it("runs open-ended without TEST_PHASE_END, or until the end of that day", () => {
    expect(testPhaseEnd(undefined)).toBeNull();
    expect(testPhaseEnd("")).toBeNull();
    expect(testPhaseEnd("31.12.2026")).toBeNull();
    expect(testPhaseEnd("2026-12-31")!.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("opens everything during it and keeps the testers free after it", () => {
    const end = new Date("2026-12-31T23:00:00Z");
    expect(testerSource(null, null, new Date())).toBe("test");
    expect(testerSource(null, end, new Date("2026-12-31T22:00:00Z"))).toBe("test");
    expect(testerSource(new Date("2026-12-31T20:00:00Z"), end, new Date("2027-03-01"))).toBe("tester");
    expect(testerSource(new Date("2027-01-02"), end, new Date("2027-03-01"))).toBeNull();
    expect(testerSource(null, end, new Date("2027-03-01"))).toBeNull();
  });
});
