import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { boundaryAreaHa, pastureHints, pastureState, pushLines, validBoundary, yearUse } = await import("./pasture");
type G = Parameters<typeof pastureState>[1][number];

const p = { id: 1, name: "Obere Weide", restDays: 30, maxGrazeDays: 10, areaHa: 2 };
let gid = 0;
const g = (startOn: string, endOn: string | null, o: Partial<G> = {}): G => ({ id: ++gid, pastureId: 1, herdId: 1, label: "Schafe", animals: 10, startOn, endOn, notes: null, ...o });

describe("pastureState", () => {
  it("is grazed, resting until the grass is back, then ready", () => {
    expect(pastureState(p, [], "2026-06-01")).toMatchObject({ status: "ready", readyOn: null });
    expect(pastureState(p, [g("2026-05-20", null)], "2026-06-01").status).toBe("grazed");
    expect(pastureState(p, [g("2026-05-20", "2026-06-01")], "2026-06-01").status).toBe("grazed");
    expect(pastureState(p, [g("2026-05-20", "2026-05-31")], "2026-06-01")).toMatchObject({ status: "resting", readyOn: "2026-06-30" });
    expect(pastureState(p, [g("2026-05-20", "2026-05-31")], "2026-06-30").status).toBe("ready");
    expect(pastureState(p, [g("2026-05-20", null, { pastureId: 2 })], "2026-06-01").status).toBe("ready");
  });
});

describe("yearUse", () => {
  it("counts grazing days once and animal days for each herd, within the year", () => {
    const use = yearUse(p, [g("2025-12-30", "2026-01-02"), g("2026-05-01", "2026-05-10"), g("2026-05-05", "2026-05-06", { animals: 4, label: "Ziegen" }), g("2026-06-01", null)], 2026, "2026-06-03");
    // 2 + 10 + 3 days; the goats share days with the sheep.
    expect(use).toEqual({ grazingDays: 15, animalDays: 2 * 10 + 10 * 10 + 2 * 4 + 3 * 10, animalDaysPerHa: 79 });
    expect(yearUse({ ...p, areaHa: null }, [], 2026, "2026-06-03").animalDaysPerHa).toBeNull();
  });
});

describe("hints and push", () => {
  it("asks to move on after the longest stay, urgent after three more days", () => {
    const now = [g("2026-06-01", null)];
    expect(pastureHints(p, now, "2026-06-10")).toEqual([]);
    expect(pastureHints(p, now, "2026-06-11")[0]).toMatchObject({ kind: "too-long", urgent: false, text: "Schafe steht seit 10 Tagen auf Obere Weide – umtreiben, damit das Gras nachwächst." });
    expect(pastureHints(p, now, "2026-06-15")[0]!.urgent).toBe(true);
  });

  it("says when a pasture was grazed before its rest was over", () => {
    expect(pastureHints(p, [g("2026-05-01", "2026-05-10"), g("2026-05-25", null)], "2026-05-26")).toEqual([
      { kind: "early", pastureId: 1, urgent: false, text: "Obere Weide sollte noch bis 09.06. ruhen – zu früh beweidet, wächst schlechter nach." },
    ]);
  });

  it("pushes on the day a pasture is ready and the day a herd should move", () => {
    expect(pushLines([p], [g("2026-05-01", "2026-05-10")], "2026-06-09")).toEqual(["Obere Weide ist wieder bereit"]);
    expect(pushLines([p], [g("2026-05-01", "2026-05-10")], "2026-06-10")).toEqual([]);
    expect(pushLines([p], [g("2026-06-01", null)], "2026-06-11")).toEqual(["Schafe seit 10 Tagen auf Obere Weide – umtreiben?"]);
    expect(pushLines([p], [g("2026-06-01", null)], "2026-06-12")).toEqual([]);
  });
});

describe("Weidekarte", () => {
  // 100 m × 100 m at 51° N.
  const lat = 51, dLat = 100 / 111_319.49, dLng = 100 / (111_319.49 * Math.cos((51 * Math.PI) / 180));
  const square: [number, number][] = [[lat, 10], [lat + dLat, 10], [lat + dLat, 10 + dLng], [lat, 10 + dLng]];

  it("measures an outline in hectares, whichever way it was drawn", () => {
    expect(boundaryAreaHa(square)).toBeCloseTo(1, 2);
    expect(boundaryAreaHa([...square].reverse())).toBeCloseTo(1, 2);
    // A triangle is half the square.
    expect(boundaryAreaHa(square.slice(0, 3))).toBeCloseTo(0.5, 2);
  });

  it("accepts three to a hundred corners on the globe, with an area", () => {
    expect(validBoundary(null)).toBeNull();
    expect(validBoundary([[51.123456789, 10.1], [51.2, 10.1], [51.2, 10.2]])![0]).toEqual([51.1234568, 10.1]);
    for (const bad of ["x", [[51, 10], [51.1, 10]], [[51, 10], [51.1, 10], [91, 10]], [[51, 10], [51.1, 10], [51.1, "10"]], [[51, 10, 1], [51.1, 10], [51.1, 10.1]], Array(101).fill([51, 10])]) {
      expect(() => validBoundary(bad), JSON.stringify(bad).slice(0, 40)).toThrow("Der Umriss ist ungültig.");
    }
    expect(() => validBoundary([[51, 10], [51.1, 10], [51.2, 10]])).toThrow("Der Umriss hat keine Fläche.");
    expect(() => validBoundary([[50, 9], [52, 9], [52, 11], [50, 11]])).toThrow("größer als 10.000 ha");
  });
});
