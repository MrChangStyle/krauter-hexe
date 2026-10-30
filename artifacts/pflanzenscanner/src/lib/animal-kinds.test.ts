import { describe, expect, it } from "vitest";
import { HEAL_TARGETS } from "./heal-targets";
import { toggleAnimal, visibleTargets } from "./animal-kinds";

describe("Meine Tierarten", () => {
  it("shows everything while nothing is hidden", () => {
    expect(visibleTargets(HEAL_TARGETS, [])).toHaveLength(13);
  });

  it("hides the chosen kinds but always keeps the human and the one on screen", () => {
    const keys = (h: string[], c?: Parameters<typeof visibleTargets>[2]) => visibleTargets(HEAL_TARGETS, h, c).map((t) => t.key);
    expect(keys(["horse", "cattle"])).not.toContain("horse");
    expect(keys(["horse", "cattle"])).toContain("human");
    expect(keys(["horse", "cattle"], "horse")).toContain("horse");
    expect(keys(["horse", "cattle"], "horse")).not.toContain("cattle");
  });

  it("toggles a kind", () => {
    expect(toggleAnimal(["horse"], "dog")).toEqual(["horse", "dog"]);
    expect(toggleAnimal(["horse", "dog"], "horse")).toEqual(["dog"]);
  });
});
