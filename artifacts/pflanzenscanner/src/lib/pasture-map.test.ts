import { describe, expect, it } from "vitest";
import { boundaryAreaHa, initialView } from "@/lib/pasture-map";

// 100 m × 100 m at 51° N.
const dLat = 100 / 111_319.49;
const dLng = 100 / (111_319.49 * Math.cos((51 * Math.PI) / 180));
const square = [
  [51, 10],
  [51 + dLat, 10],
  [51 + dLat, 10 + dLng],
  [51, 10 + dLng],
];

describe("Weidekarte", () => {
  it("measures what is drawn so far in hectares", () => {
    expect(boundaryAreaHa(square)).toBeCloseTo(1, 2);
    expect(boundaryAreaHa(square.slice(0, 3))).toBeCloseTo(0.5, 2);
    expect(boundaryAreaHa(square.slice(0, 2))).toBe(0);
  });

  it("opens around the outlines, else at the farm, else over Germany", () => {
    expect(initialView([square, [[52, 9], [52, 9.1], [52.1, 9]]], null)).toEqual({ bounds: [[51, 9], [52.1, 10 + dLng]] });
    expect(initialView([], { latitude: 50.5, longitude: 8 })).toEqual({ center: [50.5, 8], zoom: 17 });
    expect(initialView([], null)).toEqual({ center: [51.2, 10.4], zoom: 6 });
  });
});
