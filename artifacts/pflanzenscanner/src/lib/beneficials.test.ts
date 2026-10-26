import { describe, expect, it } from "vitest";
import {
  BENEFICIALS,
  MEASURES,
  PROBLEMS,
  beneficialForInsect,
  filterByRelation,
  measuresFor,
  problemsForPest,
  relationCounts,
} from "@/lib/beneficials";

describe("Nützlinge-Ratgeber – content", () => {
  it("has helpers for every problem and something to do for every helper", () => {
    for (const p of PROBLEMS) {
      expect(p.beneficials.length, p.id).toBeGreaterThan(0);
      for (const b of p.beneficials) expect(BENEFICIALS[b], `${p.id} → ${b}`).toBeDefined();
    }
    for (const b of Object.values(BENEFICIALS)) {
      expect(b.measures.length, b.id).toBeGreaterThan(0);
      for (const m of b.measures) expect(MEASURES[m], `${b.id} → ${m}`).toBeDefined();
    }
    for (const m of Object.values(MEASURES)) expect(m.steps.length, m.id).toBeGreaterThanOrEqual(3);
  });

  it("uses every beneficial and every measure", () => {
    const used = new Set(PROBLEMS.flatMap((p) => p.beneficials));
    expect([...used].sort()).toEqual(Object.keys(BENEFICIALS).sort());
    const measures = new Set(Object.values(BENEFICIALS).flatMap((b) => b.measures));
    expect([...measures].sort()).toEqual(Object.keys(MEASURES).sort());
  });

  it("marks numbers as Richtwerte", () => {
    const texts = [
      ...Object.values(MEASURES).flatMap((m) => m.steps),
      ...Object.values(BENEFICIALS).flatMap((b) => [b.fact ?? "", b.buy ?? ""]),
    ];
    for (const t of texts) if (/\d/.test(t) && !/Encarsia|Trichogramma/.test(t)) expect(t).toContain("Richtwert");
  });
});

describe("Nützlinge-Ratgeber – lookups", () => {
  it("finds the problem for a scanned pest", () => {
    expect(problemsForPest("Schwarze Bohnenlaus").map((p) => p.id)).toEqual(["aphids"]);
    expect(problemsForPest("Grüne Pfirsichblattlaus").map((p) => p.id)).toEqual(["aphids"]);
    expect(problemsForPest("Spanische Wegschnecke").map((p) => p.id)).toEqual(["slugs"]);
    expect(problemsForPest("Buchsbaumzünsler").map((p) => p.id)).toEqual(["caterpillars"]);
    expect(problemsForPest("Gefurchter Dickmaulrüssler").map((p) => p.id)).toEqual(["grubs"]);
    expect(problemsForPest("Trauermücke").map((p) => p.id)).toEqual(["fungus-gnats"]);
    expect(problemsForPest("Gemeine Spinnmilbe").map((p) => p.id)).toEqual(["spider-mites"]);
    expect(problemsForPest("Kartoffelkäfer")).toEqual([]);
  });

  it("recognises a scanned beneficial", () => {
    expect(beneficialForInsect("Siebenpunkt-Marienkäfer")?.id).toBe("ladybird");
    expect(beneficialForInsect("Gemeine Florfliege")?.id).toBe("lacewing");
    expect(beneficialForInsect("Gemeiner Ohrwurm")?.id).toBe("earwig");
    expect(beneficialForInsect("Rote Mauerbiene")?.id).toBe("wild-bees");
    expect(beneficialForInsect("Dunkle Erdhummel")?.id).toBe("wild-bees");
    expect(beneficialForInsect("Hainschwebfliege")?.id).toBe("hoverfly");
    expect(beneficialForInsect("Kohlweißling")).toBeUndefined();
  });

  it("puts 'no poison' first, then what helps the most helpers", () => {
    const m = measuresFor(["ladybird", "lacewing", "hoverfly"]).map((x) => x.id);
    expect(m[0]).toBe("no-poison");
    expect(m[1]).toBe("flowers");
    expect(new Set(m).size).toBe(m.length);
    expect(measuresFor(["nematodes"]).map((x) => x.id)).toEqual(["buy"]);
  });
});

describe("Meine Insekten – filter", () => {
  const items = [{ relationStatus: "pest" }, { relationStatus: "beneficial" }, { relationStatus: "pest" }, { relationStatus: "neutral" }];
  it("filters and counts by relation", () => {
    expect(filterByRelation(items, "all")).toHaveLength(4);
    expect(filterByRelation(items, "pest")).toHaveLength(2);
    expect(filterByRelation(items, "beneficial")).toHaveLength(1);
    expect(relationCounts(items)).toEqual({ all: 4, pest: 2, beneficial: 1, neutral: 1 });
  });
});
