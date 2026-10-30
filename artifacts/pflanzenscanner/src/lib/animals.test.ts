import { describe, expect, it } from "vitest";
import type { Plant } from "@workspace/api-client-react";
import { ANIMALS, getAnimalInfo } from "./animals";
import { HEAL_TARGETS } from "./heal-targets";

const plant = (animals: Plant["animals"]) =>
  ({ animals, poultryStatus: "safe", animalToxicityDetails: "alt", poultryBenefits: "-" }) as unknown as Plant;
const horse = { status: "poisonous" as const, toxicityDetails: "Pferd", benefits: "-" };

describe("Tierarten für Essbar für und Kräuter-Hexe", () => {
  it("offers every animal kind of the archive in both places", () => {
    expect(ANIMALS).toHaveLength(12);
    expect(HEAL_TARGETS.map((t) => t.key)).toEqual(["human", ...ANIMALS.map((a) => a.key)]);
    expect(new Set(HEAL_TARGETS.map((t) => t.emoji)).size).toBe(HEAL_TARGETS.length);
  });

  it("lets the horse stand in for the donkey until the donkey is filled", () => {
    expect(getAnimalInfo(plant({ horse }), "donkey")?.toxicityDetails).toBe("Pferd");
    const donkey = { ...horse, toxicityDetails: "Esel" };
    expect(getAnimalInfo(plant({ horse, donkey }), "donkey")?.toxicityDetails).toBe("Esel");
    expect(getAnimalInfo(plant({ horse }), "dog")).toBeUndefined();
    expect(getAnimalInfo(plant({}), "poultry")?.toxicityDetails).toBe("alt");
  });
});
