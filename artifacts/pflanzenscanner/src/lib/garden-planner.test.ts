import { describe, expect, it } from "vitest";
import type { BedPlanting, Crop } from "@workspace/api-client-react";
import { bedLight, fits, footprint, gridSize, hennyLine, neighbourHints, plantsPerCell, tooShady, touching } from "@/lib/garden-planner";

const crop = (key: string, over: Partial<Crop> = {}): Crop => ({
  key, name: key, botanicalName: "", group: "vegetable", family: "", feeder: "medium", spacingCm: 30, rowSpacingCm: 30,
  light: "partial", frostHardy: false, sowIndoor: null, directSow: null, plantOut: null, harvest: { from: 5, to: 9 }, good: [], bad: [], color: "#000000", ...over,
});
const planting = (id: number, cropKey: string, x: number, y: number, w = 1): BedPlanting => ({ id, season: 2026, cropKey, plantId: null, label: cropKey, x, y, w, h: w });

describe("planner rules", () => {
  it("measures the grid and the room a crop needs", () => {
    expect(gridSize({ lengthCm: 200, widthCm: 120 })).toEqual({ cols: 6, rows: 4 });
    expect(footprint({ spacingCm: 60 })).toBe(2);
    expect(plantsPerCell({ spacingCm: 5, rowSpacingCm: 25 })).toBe(6);
    expect(plantsPerCell({ spacingCm: 60, rowSpacingCm: 80 })).toBe(1);
  });

  it("checks room and neighbourhood", () => {
    const taken = [planting(1, "tomate", 0, 0, 2)];
    expect(fits({ x: 1, y: 1, w: 1, h: 1 }, 6, 4, taken)).toBe(false);
    expect(fits({ x: 2, y: 0, w: 1, h: 1 }, 6, 4, taken)).toBe(true);
    expect(fits({ x: 5, y: 3, w: 2, h: 2 }, 6, 4, [])).toBe(false);
    expect(touching(taken[0]!, planting(2, "x", 2, 2))).toBe(true);
    expect(touching(taken[0]!, planting(2, "x", 3, 0))).toBe(false);
  });

  it("finds good and bad neighbours that touch", () => {
    const crops = new Map([
      ["tomate", crop("tomate", { good: ["basilikum"], bad: ["kartoffel"] })],
      ["basilikum", crop("basilikum")],
      ["kartoffel", crop("kartoffel")],
    ]);
    const plan = [planting(1, "tomate", 0, 0, 2), planting(2, "basilikum", 2, 0), planting(3, "kartoffel", 0, 2), planting(4, "kartoffel", 5, 3)];
    const hints = neighbourHints(plan, crops);
    expect(hints.bad.map((p) => [p.a.id, p.b.id])).toEqual([[1, 3]]);
    expect(hints.good.map((p) => [p.a.id, p.b.id])).toEqual([[1, 2]]);
    expect(hennyLine(hints, [], false)).toBe("Achtung: tomate und kartoffel vertragen sich nicht – setz sie weiter auseinander.");
    expect(hennyLine({ good: hints.good, bad: [] }, [], false)).toBe("Gute Nachbarn: tomate neben basilikum!");
    expect(hennyLine({ good: hints.good, bad: [] }, [], false, "2025 stand hier Kartoffel.")).toBe("Fruchtfolge: 2025 stand hier Kartoffel.");
  });

  it("warns when a crop wants more sun than the bed gets", () => {
    expect(bedLight(6)).toBe("full");
    expect(bedLight(3)).toBe("shade");
    expect(tooShady({ light: "full" }, bedLight(5))).toBe(true);
    expect(tooShady({ light: "partial" }, bedLight(5))).toBe(false);
    expect(tooShady({ light: "full" }, null)).toBe(false);
  });
});
