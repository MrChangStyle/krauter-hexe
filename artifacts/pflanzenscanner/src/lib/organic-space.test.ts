import { describe, expect, it } from "vitest";
import { spaceCheck } from "@/lib/organic-space";

describe("Platz-Check (Bio)", () => {
  it("needs stall per animal or animals per m², and outdoor run per animal", () => {
    // 12 hens: at most 6 per m² stall → 2 m²; 4 m² run each → 48 m².
    expect(spaceCheck("poultry", 12, 2, 40)).toMatchObject({ stallNeeded: 2, stallOk: true, runNeeded: 48, runOk: false });
    // 3 goats: 1,5 m² stall and 2,5 m² run each.
    expect(spaceCheck("goat", 3, 4, 7.5)).toMatchObject({ stallNeeded: 4.5, stallOk: false, runNeeded: 7.5, runOk: true });
  });

  it("says nothing without values for the species, without animals, and leaves missing areas open", () => {
    expect(spaceCheck("horse", 2, 20, 100)).toBeNull();
    expect(spaceCheck("sheep", 0, 1, 1)).toBeNull();
    expect(spaceCheck("pig", 4, null, null)).toMatchObject({ stallOk: null, runOk: null, stallNeeded: 5.2, runNeeded: 4 });
  });
});
