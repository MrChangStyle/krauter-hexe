import { describe, expect, it } from "vitest";
import { manureEstimate } from "@/lib/fertilizing";

describe("Kreislauf Stall → Beet", () => {
  it("adds up the manure of the groups and the bed area it covers", () => {
    // 10 hens × 60 kg + 2 goats × 1200 kg = 3000 kg → 1000 m² at 3 kg/m².
    expect(manureEstimate([{ species: "poultry", animalCount: 10 }, { species: "goat", animalCount: 2 }])).toEqual({ kg: 3000, m2: 1000 });
  });

  it("says nothing without animals or values", () => {
    expect(manureEstimate([])).toBeNull();
    expect(manureEstimate([{ species: "cat", animalCount: 3 }, { species: "goat", animalCount: 0 }])).toBeNull();
  });
});
