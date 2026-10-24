import { describe, expect, it } from "vitest";
import { queenColor } from "@/lib/bee-labels";

describe("queenColor", () => {
  it("follows the international marking colours", () => {
    expect([2021, 2022, 2023, 2024, 2025, 2026, 2030].map((y) => queenColor(y).name)).toEqual(["weiß", "gelb", "rot", "grün", "blau", "weiß", "blau"]);
  });
});
