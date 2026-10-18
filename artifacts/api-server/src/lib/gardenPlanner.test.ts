import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { cropForBotanicalName, footprint, gridSize, overlaps } = await import("./gardenPlanner");
const { cropByKey } = await import("./gardenCatalog");

describe("Raster-Planer rules", () => {
  it("cuts the bed into 30-cm cells", () => {
    expect(gridSize({ lengthCm: 200, widthCm: 120 })).toEqual({ cols: 6, rows: 4 });
    expect(gridSize({ lengthCm: 25, widthCm: 25 })).toEqual({ cols: 1, rows: 1 });
  });

  it("gives a crop as many cells as its spacing needs", () => {
    expect(footprint(cropByKey("tomate"))).toBe(2);
    expect(footprint(cropByKey("moehre"))).toBe(1);
    expect(footprint(cropByKey("kuerbis"))).toBe(5);
    expect(footprint(undefined)).toBe(1);
  });

  it("knows when rectangles overlap", () => {
    expect(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 1, h: 1 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 1, h: 1 })).toBe(false);
  });

  it("matches archive plants to the catalog by genus and species", () => {
    expect(cropForBotanicalName("Solanum lycopersicum L.")?.key).toBe("tomate");
    expect(cropForBotanicalName("Taxus baccata")).toBeUndefined();
  });
});
