import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { checkProposal, coerceAnalysis, coerceCorners, orderCorners } = await import("./gardenAi");
const { coerceCrop, keyFor } = await import("./gardenCrops");
const { cropByKey } = await import("./gardenCatalog");

describe("corner suggestion", () => {
  // A bed seen at an angle: wide at the bottom, narrow at the top.
  const tl = { x: 0.3, y: 0.3 };
  const tr = { x: 0.7, y: 0.3 };
  const br = { x: 0.9, y: 0.85 };
  const bl = { x: 0.1, y: 0.85 };

  it("puts the corners into grid order, starting top left along the length", () => {
    const long = { lengthCm: 300, widthCm: 120 };
    expect(orderCorners([br, tl, bl, tr], long)).toEqual([tl, tr, br, bl]);
    // A bed wider than long: the first edge runs along the shorter sides.
    expect(orderCorners([br, tl, bl, tr], { lengthCm: 100, widthCm: 200 })).toEqual([tl, bl, br, tr]);
  });

  it("rejects what is not a bed", () => {
    expect(coerceCorners({ beetSichtbar: false, ecken: [tl, tr, br, bl] }, { lengthCm: 300, widthCm: 120 })).toBeNull();
    expect(coerceCorners({ ecken: [tl, tr, br] }, { lengthCm: 300, widthCm: 120 })).toBeNull();
    expect(coerceCorners({ ecken: [tl, tr, br, { x: 1.4, y: 0.2 }] }, { lengthCm: 300, widthCm: 120 })).toBeNull();
    expect(coerceCorners({ ecken: [tl, tl, tl, tl] }, { lengthCm: 300, widthCm: 120 })).toBeNull();
    expect(coerceCorners({ beetSichtbar: true, ecken: [bl, br, tr, tl] }, { lengthCm: 300, widthCm: 120 })).toEqual([tl, tr, br, bl]);
  });
});

describe("photo analysis", () => {
  it("needs shade, soil and weeds and keeps at most five tips", () => {
    expect(coerceAnalysis({ schatten: "Wenig", boden: "Krümelig" })).toBeNull();
    const a = coerceAnalysis({ schatten: " Morgens Schatten ", boden: "Krümelig", unkraut: "Kaum", tipps: ["a", 3, "b", "c", "d", "e", "f"] });
    expect(a).toEqual({ shade: "Morgens Schatten", soil: "Krümelig", weeds: "Kaum", tips: ["a", "b", "c", "d", "e"] });
  });
});

describe("planting suggestion goes through the fixed rules", () => {
  const bed = { lengthCm: 300, widthCm: 120, sunHours: 7 }; // 10 × 4 cells

  it("keeps what fits and names what was dropped", () => {
    const planted = [{ cropKey: "kartoffel", label: "Kartoffel", x: 0, y: 0, w: 2, h: 2 }];
    const earlier = [{ season: 2025, cropKey: "tomate", label: "Tomate", x: 6, y: 0, w: 2, h: 2 }];
    const result = checkProposal(bed, 2026, planted, earlier, [
      { cropKey: "gibtsnicht", x: 4, y: 0 },
      { cropKey: "tomate", x: 2, y: 0 }, // next to the potatoes
      { cropKey: "kartoffel", x: 1, y: 0 }, // overlaps
      { cropKey: "paprika", x: 6, y: 0 }, // nightshade again
      { cropKey: "kuerbis", x: 9, y: 2 }, // too big
      { cropKey: "buschbohne", x: 4, y: 0 },
      { cropKey: "zwiebel", x: 5, y: 0 }, // bad next to the beans
      { cropKey: "salat", x: 4, y: 3 },
    ]);
    expect(result.items.map((i) => [i.cropKey, i.x, i.y, i.w])).toEqual([
      ["buschbohne", 4, 0, 1],
      ["salat", 4, 3, 1],
    ]);
    expect(result.dropped).toEqual([
      { label: "Tomate", reason: "verträgt sich nicht mit Kartoffel" },
      { label: "Kartoffel", reason: "Platz schon belegt" },
      { label: "Paprika", reason: "Fruchtfolge – 2025 stand dort Tomate" },
      { label: "Kürbis", reason: "passt nicht ins Beet" },
      { label: "Zwiebel", reason: "verträgt sich nicht mit Buschbohne" },
    ]);
  });

  it("leaves out sun lovers in a shady bed", () => {
    const shady = checkProposal({ ...bed, sunHours: 3 }, 2026, [], [], [{ cropKey: "tomate", x: 0, y: 0 }, { cropKey: "minze", x: 4, y: 0 }]);
    expect(shady.items.map((i) => i.cropKey)).toEqual(["minze"]);
    expect(shady.dropped).toEqual([{ label: "Tomate", reason: "braucht mehr Sonne" }]);
  });
});

describe("crop drafts from the AI", () => {
  const raw = {
    name: "Topinambur",
    botanicalName: "Helianthus tuberosus",
    group: "vegetable",
    family: "Korbblütler",
    feeder: "medium",
    spacingCm: 50.4,
    rowSpacingCm: 900,
    light: "partial",
    frostHardy: true,
    sowIndoor: null,
    directSow: null,
    plantOut: { from: 2, to: -4 },
    harvest: { from: 10, to: 3 },
    good: ["mais", "gibtsnicht", "topinambur", "salat"],
    bad: ["salat", "tomate"],
    color: "rot",
  };

  it("coerces the answer into the catalog's shape", () => {
    expect(keyFor("Rote Bete (Sorte Ägypter)")).toBe("rote_bete_sorte_aegypter");
    const crop = coerceCrop(raw, "topinambur", "Topinambur")!;
    expect(crop).toMatchObject({
      key: "topinambur",
      spacingCm: 50,
      rowSpacingCm: 250,
      plantOut: { from: -4, to: 2 },
      harvest: { from: 10, to: 3 },
      good: ["mais", "salat"],
      bad: ["tomate"],
      color: "#7DBB6A",
    });
    expect(cropByKey("mais")).toBeDefined();
  });

  it("refuses incomplete answers", () => {
    expect(coerceCrop({ ...raw, family: "" }, "x", "X")).toBeNull();
    expect(coerceCrop({ ...raw, feeder: "viel" }, "x", "X")).toBeNull();
    expect(coerceCrop({ ...raw, plantOut: null }, "x", "X")).toBeNull();
  });
});
