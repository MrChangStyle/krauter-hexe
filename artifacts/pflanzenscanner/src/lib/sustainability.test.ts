import { describe, expect, it } from "vitest";
import { SUSTAINABILITY, farmProfile } from "@/lib/sustainability";

describe("Hof-Steckbrief", () => {
  it("names the farming and the ticked measures in the fixed order", () => {
    expect(farmProfile("Hof Linde", "organic", ["compost", "nest_boxes"], "DE-ÖKO-006")).toBe(
      "Hof Linde wirtschaftet nach der EU-Öko-Verordnung (Kontrollstelle DE-ÖKO-006). Für Natur und Klima: Nistkästen für Vögel und Fledermäuse, Eigener Kompost.",
    );
    expect(farmProfile("Hof Linde", "natural", [])).toBe("Hof Linde wirtschaftet naturnah.");
  });

  it("works for conventional farms too – without a word about the farming", () => {
    expect(farmProfile("Hof Linde", "conventional", ["hedge"])).toBe("Auf Hof Linde – für Natur und Klima: Hecken aus heimischen Sträuchern.");
    expect(farmProfile("Hof Linde", "conventional", [])).toBe("");
  });

  it("has a label for every measure the server knows", () => {
    expect(SUSTAINABILITY.map((s) => s.key)).toEqual(["nest_boxes", "insect_hotel", "flower_strip", "hedge", "deadwood", "pond", "rainwater", "compost", "mulch", "peat_free", "old_breeds", "solar"]);
  });
});
