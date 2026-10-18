import { describe, expect, it } from "vitest";
import { apply, cellAt, headingText, invert, squareToQuad } from "@/lib/homography";

const quad = [{ x: 0.3, y: 0.2 }, { x: 0.7, y: 0.2 }, { x: 0.95, y: 0.9 }, { x: 0.05, y: 0.9 }];

describe("homography", () => {
  it("maps the square's corners exactly onto the tapped corners", () => {
    const h = squareToQuad(quad)!;
    for (const [u, v, i] of [[0, 0, 0], [1, 0, 1], [1, 1, 2], [0, 1, 3]] as const) {
      const p = apply(h, { x: u, y: v });
      expect(p.x).toBeCloseTo(quad[i]!.x, 9);
      expect(p.y).toBeCloseTo(quad[i]!.y, 9);
    }
  });

  it("is perspective: the far half of the bed looks smaller", () => {
    const h = squareToQuad(quad)!;
    const mid = apply(h, { x: 0.5, y: 0.5 });
    // The middle of the bed lies closer to the far (narrow) edge than halfway.
    expect(mid.y).toBeLessThan(0.55);
  });

  it("finds the cell under a tap and nothing outside the bed", () => {
    const inv = invert(squareToQuad(quad)!)!;
    const h = squareToQuad(quad)!;
    const centre = apply(h, { x: (2 + 0.5) / 6, y: (1 + 0.5) / 4 });
    expect(cellAt(inv, centre, 6, 4)).toEqual({ x: 2, y: 1 });
    expect(cellAt(inv, { x: 0.02, y: 0.05 }, 6, 4)).toBeNull();
  });

  it("names the viewing direction", () => {
    expect(headingText(183)).toBe("Süd");
    expect(headingText(350)).toBe("Nord");
  });
});
