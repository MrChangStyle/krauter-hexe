import { describe, expect, it } from "vitest";
import type { Plant } from "@workspace/api-client-react";
import {
  hasHealingFor,
  isEdibleFor,
  symptomsFor,
} from "@/lib/heal-targets";
import {
  availableSymptomsFor,
  filterByAilment,
  relevantPlantsFor,
} from "@/lib/ailment-filter";
import { canonicaliseSymptoms } from "@/lib/url-state";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NO_BENEFIT_SENTINEL = "Keine bekannte medizinische Wirkung.";

let nextId = 1;

function makePlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: nextId++,
    germanName: "Testpflanze",
    botanicalName: "Planta testis",
    category: "medicinal",
    humanStatus: "poisonous",
    poultryStatus: "poisonous",
    edibilityDetails: "",
    animalToxicityDetails: "",
    activeIngredients: "",
    humanBenefits: "",
    poultryBenefits: "",
    habitat: "",
    siteConditions: "",
    otherUses: "",
    fertilizerTips: "",
    animals: {},
    symptoms: {},
    hasSideImage: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Plant;
}

// Human: edible, treats cough + headache
const kamille = makePlant({
  germanName: "Kamille",
  humanStatus: "edible",
  humanBenefits: "Hilft bei Husten und Kopfschmerzen.",
  symptoms: { human: ["Husten", "Kopfschmerzen"] },
});

// Human: not edible but has Heilwirkung, treats stomach ache
const beinwell = makePlant({
  germanName: "Beinwell",
  humanStatus: "poisonous",
  humanBenefits: "Hilft bei Magenschmerzen.",
  symptoms: { human: ["Magenschmerzen"] },
});

// Human: sentinel benefit + not edible -> never relevant for humans
const giftpilz = makePlant({
  germanName: "Giftpilz",
  humanStatus: "poisonous",
  humanBenefits: NO_BENEFIT_SENTINEL,
  symptoms: { human: ["Husten"] }, // even with (bogus) tags it must never surface
});

// Poultry-only plant: safe for poultry, treats Verdauung there
const brennnessel = makePlant({
  germanName: "Brennnessel",
  humanStatus: "poisonous",
  humanBenefits: "",
  animals: {
    poultry: {
      status: "safe",
      toxicityDetails: "",
      benefits: "Fördert die Verdauung.",
    },
  },
  symptoms: { poultry: ["Verdauungsprobleme"] },
});

// Legacy plant: never backfilled (no symptoms key at all), edible for humans
const legacy = makePlant({
  germanName: "Alteintrag",
  humanStatus: "edible",
  humanBenefits: "Hilft bei Husten.",
  symptoms: {},
});

const ALL = [kamille, beinwell, giftpilz, brennnessel, legacy];

// ---------------------------------------------------------------------------
// isEdibleFor
// ---------------------------------------------------------------------------

describe("isEdibleFor", () => {
  it("uses humanStatus for the human target", () => {
    expect(isEdibleFor(kamille, "human")).toBe(true);
    expect(isEdibleFor(beinwell, "human")).toBe(false);
    expect(isEdibleFor(giftpilz, "human")).toBe(false);
  });

  it("uses the per-animal status for animal targets", () => {
    expect(isEdibleFor(brennnessel, "poultry")).toBe(true);
    expect(isEdibleFor(kamille, "poultry")).toBe(false);
  });

  it("falls back to legacy poultry columns for poultry", () => {
    const legacyPoultry = makePlant({ poultryStatus: "safe", animals: {} });
    expect(isEdibleFor(legacyPoultry, "poultry")).toBe(true);
  });

  it("returns false for animals without a fact sheet", () => {
    expect(isEdibleFor(kamille, "cat")).toBe(false);
    expect(isEdibleFor(kamille, "horse")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasHealingFor
// ---------------------------------------------------------------------------

describe("hasHealingFor", () => {
  it("is true when benefit text is present", () => {
    expect(hasHealingFor(kamille, "human")).toBe(true);
    expect(hasHealingFor(beinwell, "human")).toBe(true);
    expect(hasHealingFor(brennnessel, "poultry")).toBe(true);
  });

  it("treats the no-benefit sentinel as no Heilwirkung", () => {
    expect(hasHealingFor(giftpilz, "human")).toBe(false);
  });

  it("treats empty/whitespace/missing benefit text as no Heilwirkung", () => {
    expect(hasHealingFor(brennnessel, "human")).toBe(false); // empty string
    expect(hasHealingFor(makePlant({ humanBenefits: "   " }), "human")).toBe(
      false,
    );
    expect(hasHealingFor(kamille, "rabbit")).toBe(false); // no fact sheet
  });
});

// ---------------------------------------------------------------------------
// symptomsFor
// ---------------------------------------------------------------------------

describe("symptomsFor", () => {
  it("returns the stored tags for the target", () => {
    expect(symptomsFor(kamille, "human")).toEqual(["Husten", "Kopfschmerzen"]);
    // "Verdauungsprobleme" is canonicalized to "Verdauungsbeschwerden"
    expect(symptomsFor(brennnessel, "poultry")).toEqual([
      "Verdauungsbeschwerden",
    ]);
  });

  it("returns [] for missing targets and un-backfilled plants", () => {
    expect(symptomsFor(kamille, "poultry")).toEqual([]);
    expect(symptomsFor(legacy, "human")).toEqual([]);
    expect(
      symptomsFor(makePlant({ symptoms: undefined as never }), "human"),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// relevantPlantsFor / availableSymptomsFor
// ---------------------------------------------------------------------------

describe("relevantPlantsFor", () => {
  it("keeps plants that are edible OR healing for the target, drops the rest", () => {
    const names = relevantPlantsFor(ALL, "human").map((p) => p.germanName);
    expect(names).toContain("Kamille"); // edible + healing
    expect(names).toContain("Beinwell"); // healing only
    expect(names).toContain("Alteintrag"); // edible only
    expect(names).not.toContain("Giftpilz"); // sentinel benefit + poisonous
    expect(names).not.toContain("Brennnessel"); // poultry-only
  });

  it("is target-specific", () => {
    const names = relevantPlantsFor(ALL, "poultry").map((p) => p.germanName);
    expect(names).toEqual(["Brennnessel"]);
    expect(relevantPlantsFor(ALL, "cat")).toEqual([]);
  });
});

describe("availableSymptomsFor", () => {
  it("aggregates, de-duplicates case-insensitively and sorts (de-DE)", () => {
    const a = makePlant({ symptoms: { human: ["husten", "Ödeme"] } });
    const b = makePlant({ symptoms: { human: ["Husten", "Akne"] } });
    // "Husten" < "husten" lexicographically (uppercase letters sort before
    // lowercase in Unicode), so "Husten" is the stable canonical form.
    expect(availableSymptomsFor([a, b], "human")).toEqual([
      "Akne",
      "Husten",
      "Ödeme",
    ]);
  });

  it("canonical spelling is stable regardless of plant iteration order", () => {
    // When two plants carry the same symptom under different casings, swapping
    // their order in the list must not change the canonical spelling that ends
    // up in the URL — sentence-case normalisation always resolves both to the
    // same form ("Husten") before the tie-break even runs.
    const p1 = makePlant({ symptoms: { human: ["husten"] } });
    const p2 = makePlant({ symptoms: { human: ["Husten"] } });

    const forwardResult = availableSymptomsFor([p1, p2], "human");
    const reverseResult = availableSymptomsFor([p2, p1], "human");

    // Both orderings must produce the same canonical spelling.
    expect(forwardResult).toEqual(reverseResult);
    // And that spelling must be the lexicographically smallest one.
    expect(forwardResult).toEqual(["Husten"]);
  });

  it("only exposes tags of the chosen target", () => {
    expect(availableSymptomsFor([brennnessel], "human")).toEqual([]);
    // "Verdauungsprobleme" is canonicalized to "Verdauungsbeschwerden"
    expect(availableSymptomsFor([brennnessel], "poultry")).toEqual([
      "Verdauungsbeschwerden",
    ]);
  });
});

// ---------------------------------------------------------------------------
// filterByAilment – the page's combined filter
// ---------------------------------------------------------------------------

describe("filterByAilment", () => {
  const relevant = relevantPlantsFor(ALL, "human");

  it("returns nothing with no query and no selection", () => {
    expect(filterByAilment(relevant, "human", "", new Set())).toEqual([]);
    expect(filterByAilment(relevant, "human", "   ", new Set())).toEqual([]);
  });

  it("query-only: case-insensitive substring match with matched tags", () => {
    const res = filterByAilment(relevant, "human", "HUSTE", new Set());
    expect(res).toHaveLength(1);
    expect(res[0].plant.germanName).toBe("Kamille");
    expect(res[0].matched).toEqual(["Husten"]);
  });

  it("query-only: no substring match -> no results", () => {
    expect(filterByAilment(relevant, "human", "Fieber", new Set())).toEqual(
      [],
    );
  });

  it("selection-only: case-insensitive equality, substrings do NOT match", () => {
    const res = filterByAilment(
      relevant,
      "human",
      "",
      new Set(["magenschmerzen"]),
    );
    expect(res.map((r) => r.plant.germanName)).toEqual(["Beinwell"]);
    // A selected value that is only a substring of a tag must not match.
    expect(
      filterByAilment(relevant, "human", "", new Set(["Huste"])),
    ).toEqual([]);
  });

  it("query + selection are OR-combined; matched tags carry both reasons", () => {
    const res = filterByAilment(
      relevant,
      "human",
      "kopf",
      new Set(["Magenschmerzen"]),
    );
    const byName = Object.fromEntries(
      res.map((r) => [r.plant.germanName, r.matched]),
    );
    expect(byName).toEqual({
      Kamille: ["Kopfschmerzen"], // via query
      Beinwell: ["Magenschmerzen"], // via selection
    });
  });

  it("never surfaces plants that are not relevant for the target, even with matching tags", () => {
    // Giftpilz has a (bogus) "Husten" tag but is excluded by relevance.
    const res = filterByAilment(relevant, "human", "Husten", new Set());
    expect(res.map((r) => r.plant.germanName)).not.toContain("Giftpilz");
  });

  it("un-backfilled plants (no symptom tags) never match", () => {
    // legacy is relevant (edible) but has no tags -> no ailment can match it.
    const res = filterByAilment(relevant, "human", "Husten", new Set());
    expect(res.map((r) => r.plant.germanName)).not.toContain("Alteintrag");
  });

  it("target switching does not leak selections across targets", () => {
    // Simulates the page's per-target selection map: a selection made for
    // "human" is not applied when the target switches to "poultry".
    const selectedByTarget: Record<string, Set<string>> = {
      human: new Set(["Husten"]),
    };
    const poultryRelevant = relevantPlantsFor(ALL, "poultry");
    const poultrySelected =
      selectedByTarget["poultry"] ?? new Set<string>();
    expect(
      filterByAilment(poultryRelevant, "poultry", "", poultrySelected),
    ).toEqual([]);

    // And even if the same tag text were selected, poultry tags of other
    // targets never match: the tags are read per-target.
    expect(
      filterByAilment(poultryRelevant, "poultry", "", new Set(["Husten"])),
    ).toEqual([]);
  });

  it("query matches per-target tags only", () => {
    const poultryRelevant = relevantPlantsFor(ALL, "poultry");
    const res = filterByAilment(poultryRelevant, "poultry", "verdauung", new Set());
    expect(res.map((r) => r.plant.germanName)).toEqual(["Brennnessel"]);
    // Human-target search never sees poultry tags.
    expect(
      filterByAilment(relevant, "human", "verdauung", new Set()),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Target-switch + symptom-dedup interaction
//
// A symptom like "Husten" can appear in symptoms.human and symptoms.poultry
// under different casings.  availableSymptomsFor must return the canonical
// form that corresponds to the *current* target, and canonicaliseSymptoms
// must remap the old target's canonical form to the new target's canonical
// form so shared links never break when the target changes.
// ---------------------------------------------------------------------------

describe("availableSymptomsFor – same symptom, different casing across targets", () => {
  // Plant that is relevant for humans and carries "Husten" (capital H)
  const humanPlant = makePlant({
    germanName: "Kamille",
    humanStatus: "edible",
    humanBenefits: "Hilft bei Husten.",
    symptoms: { human: ["Husten"] },
  });

  // Plant that is relevant for poultry and carries the *same* symptom but
  // spelled with a lowercase "h", as might happen when two editors enter data
  // independently.
  const poultryPlant = makePlant({
    germanName: "Brennnessel",
    humanStatus: "poisonous",
    humanBenefits: "",
    animals: {
      poultry: {
        status: "safe",
        toxicityDetails: "",
        benefits: "Hilft bei husten.",
      },
    },
    symptoms: { poultry: ["husten"] },
  });

  const plants = [humanPlant, poultryPlant];

  it("returns 'Husten' (capital H) as the canonical form for the human target", () => {
    const humanRelevant = relevantPlantsFor(plants, "human");
    const available = availableSymptomsFor(humanRelevant, "human");
    expect(available).toContain("Husten");
    // The lowercase variant must NOT appear — first-spelling-wins dedup keeps
    // the human target's form.
    expect(available).not.toContain("husten");
  });

  it("returns 'Husten' (sentence case) as the canonical form for the poultry target", () => {
    // Even though the stored tag is "husten" (lowercase), sentence-case
    // normalisation in canonicalizeSymptom maps it to "Husten".
    const poultryRelevant = relevantPlantsFor(plants, "poultry");
    const available = availableSymptomsFor(poultryRelevant, "poultry");
    expect(available).toContain("Husten");
    expect(available).not.toContain("husten");
  });

  it("canonicaliseSymptoms resolves 'Husten' against the poultry list (both now sentence-cased)", () => {
    // Both targets produce "Husten" after sentence-case normalisation, so a
    // URL carrying 'Husten' resolves cleanly against the poultry available list.
    const poultryRelevant = relevantPlantsFor(plants, "poultry");
    const poultryAvailable = availableSymptomsFor(poultryRelevant, "poultry");

    const { canonical, notFound } = canonicaliseSymptoms(
      ["Husten"],
      poultryAvailable,
    );

    expect(notFound).toEqual([]);
    expect(canonical).toEqual(["Husten"]);
  });

  it("canonicaliseSymptoms resolves 'husten' (URL-encoded legacy) against the human list", () => {
    // A URL from before sentence-casing may still carry lowercase 'husten'.
    // The case-insensitive lookup in canonicaliseSymptoms must map it to the
    // available canonical form 'Husten'.
    const humanRelevant = relevantPlantsFor(plants, "human");
    const humanAvailable = availableSymptomsFor(humanRelevant, "human");

    const { canonical, notFound } = canonicaliseSymptoms(
      ["husten"],
      humanAvailable,
    );

    expect(notFound).toEqual([]);
    expect(canonical).toEqual(["Husten"]);
  });

  it("availableSymptomsFor does not bleed cross-target tags, both targets get sentence-cased form", () => {
    // Both plants are passed together.  The per-target views must be independent
    // and both must use the sentence-cased canonical "Husten".
    const humanRelevant = relevantPlantsFor(plants, "human");
    const humanAvailable = availableSymptomsFor(humanRelevant, "human");
    const poultryRelevant = relevantPlantsFor(plants, "poultry");
    const poultryAvailable = availableSymptomsFor(poultryRelevant, "poultry");

    // Sentence-case normalisation unifies the casing; both lists see "Husten".
    expect(humanAvailable).toEqual(["Husten"]);
    expect(poultryAvailable).toEqual(["Husten"]);
  });
});
