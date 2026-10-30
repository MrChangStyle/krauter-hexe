import { describe, expect, it } from "vitest";
import { fitsAt, grabbedCell } from "@/lib/bed-move";

const tomato = { id: 1, x: 0, y: 0, w: 2, h: 2 };
const salad = { id: 2, x: 3, y: 0, w: 1, h: 1 };

describe("Verschieben im Beet-Raster", () => {
  it("fits inside the bed, not onto another planting – its own old spot is free", () => {
    expect(fitsAt(tomato, 1, 1, [tomato, salad], 4, 4)).toBe(true); // overlaps only itself
    expect(fitsAt(tomato, 2, 0, [tomato, salad], 4, 4)).toBe(false); // onto the salad
    expect(fitsAt(tomato, 3, 2, [tomato, salad], 4, 4)).toBe(false); // over the edge
    expect(fitsAt(salad, 0, 3, [tomato, salad], 4, 4)).toBe(true);
    expect(fitsAt(salad, -1, 0, [tomato, salad], 4, 4)).toBe(false);
  });

  it("knows which field of a big planting the finger holds", () => {
    const box = { left: 100, top: 200, width: 80, height: 80 };
    expect(grabbedCell(tomato, box, { x: 110, y: 210 })).toEqual({ dx: 0, dy: 0 });
    expect(grabbedCell(tomato, box, { x: 170, y: 279 })).toEqual({ dx: 1, dy: 1 });
    expect(grabbedCell(tomato, box, { x: 400, y: 0 })).toEqual({ dx: 1, dy: 0 }); // clamped
  });
});
