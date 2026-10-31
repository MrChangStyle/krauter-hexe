import { describe, expect, it } from "vitest";
import { berlinMonth, cellCentre, cellOf, CELL_KM, isProtectedSpecies, mapCells, PROTECTED_CELL_KM } from "./findSpots";

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

describe("cells", () => {
  it("keeps only the centre of a ~2 km cell, never the position", () => {
    const pos = { lat: 47.8723, lon: 12.1189 };
    const centre = cellCentre(cellOf(pos.lat, pos.lon));
    expect(centre).not.toEqual(pos);
    // Inside the cell: at most half a diagonal away.
    expect(km(pos.lat, pos.lon, centre.lat, centre.lon)).toBeLessThan(CELL_KM * 0.75);
  });

  it("puts close positions in the same cell and rounding the centre again changes nothing", () => {
    const a = cellOf(47.8723, 12.1189);
    const centre = cellCentre(a);
    expect(cellOf(centre.lat, centre.lon)).toEqual(a);
    expect(cellOf(47.87231, 12.11891)).toEqual(a);
  });

  it("cells are about 2 km wide also further north", () => {
    for (const lat of [47.5, 54.3]) {
      const c = cellOf(lat, 10);
      const here = cellCentre(c);
      const east = cellCentre({ row: c.row, col: c.col + 1 });
      expect(km(here.lat, here.lon, east.lat, east.lon)).toBeGreaterThan(1.8);
      expect(km(here.lat, here.lon, east.lat, east.lon)).toBeLessThan(2.2);
    }
  });
});

describe("isProtectedSpecies", () => {
  it("knows orchids, protected mushrooms and insects by genus or species", () => {
    for (const name of ["Ophrys apifera Huds.", "Cypripedium calceolus", "Cantharellus cibarius", "Boletus edulis", "Bombus terrestris", "Lucanus cervus", "Arnica montana"]) {
      expect(isProtectedSpecies(name)).toBe(true);
    }
  });

  it("leaves common species fine", () => {
    for (const name of ["Taraxacum officinale", "Urtica dioica", "Boletus luridus", "Apis mellifera", "Coccinella septempunctata"]) {
      expect(isProtectedSpecies(name)).toBe(false);
    }
  });
});

describe("mapCells", () => {
  const near = cellOf(47.87, 12.11);
  const next = { row: near.row, col: near.col + 1 };
  const far = cellOf(48.14, 11.58);
  const rows = [
    { cellRow: near.row, cellCol: near.col, foundMonth: "2026-05" },
    { cellRow: near.row, cellCol: near.col, foundMonth: "2026-09" },
    { cellRow: next.row, cellCol: next.col, foundMonth: "2026-06" },
    { cellRow: far.row, cellCol: far.col, foundMonth: "2026-07" },
  ];

  it("counts finds per 2 km cell with the latest month", () => {
    const cells = mapCells(rows, false);
    expect(cells).toHaveLength(3);
    expect(cells[0]).toMatchObject({ finds: 2, lastMonth: "2026-09" });
  });

  it("merges neighbouring cells to 25 km for protected species", () => {
    const cells = mapCells(rows, true);
    expect(cells.length).toBe(2);
    expect(cells[0]).toMatchObject({ finds: 3, lastMonth: "2026-09" });
    expect(PROTECTED_CELL_KM).toBeGreaterThan(CELL_KM);
  });
});

describe("berlinMonth", () => {
  it("uses Berlin time at the turn of the month", () => {
    expect(berlinMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
    expect(berlinMonth(new Date("2026-10-31T12:00:00Z"))).toBe("2026-10");
  });
});
