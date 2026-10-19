import { describe, expect, it, vi } from "vitest";

// The pure helpers need the schema constants, not a database connection.
vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});
vi.mock("./plantIdentification", () => ({ MODELS: [], TEXT_MODELS: [], parseDataUrl: vi.fn(), runModelChain: vi.fn() }));

const { coerceLabel, ionophoresIn } = await import("./feedLabel");

const LABEL = {
  istEtikett: true,
  name: "  Kükenstarter   Plus ",
  art: "compound",
  tierarten: ["poultry", "other", "unicorn", "poultry"],
  feuchtigkeit: "12,0 %",
  werte: { rohprotein: 20.5, rohfett: "4,2", rohfaser: 3.8, calcium: 1.1, phosphor: 0.7, kupfer: "15 mg" },
  zusatzstoffe: ["Vitamin D3 3000 I.E.", " Monensin-Natrium  100 mg ", "", 7],
};

describe("coerceLabel", () => {
  it("cleans the model answer into label values as fed", () => {
    expect(coerceLabel(LABEL)).toEqual({
      name: "Kükenstarter Plus",
      category: "compound",
      forSpecies: ["poultry"],
      dryMatter: 88,
      label: { crudeProtein: 20.5, crudeFat: 4.2, crudeFibre: 3.8, calcium: 1.1, phosphorus: 0.7, copper: 15 },
      additives: ["Vitamin D3 3000 I.E.", "Monensin-Natrium 100 mg"],
      ionophores: ["Monensin"],
    });
  });

  it("leaves implausible or missing values empty instead of guessing", () => {
    const r = coerceLabel({ ...LABEL, art: "kuchen", feuchtigkeit: null, werte: { rohprotein: 250, rohfett: -1, calcium: 1.1 } })!;
    expect(r.category).toBe("compound");
    expect(r.dryMatter).toBeNull();
    expect(r.label).toEqual({ crudeProtein: null, crudeFat: null, crudeFibre: null, calcium: 1.1, phosphorus: null, copper: null });
  });

  it("rejects photos without a label or without any value", () => {
    expect(coerceLabel({ ...LABEL, istEtikett: false })).toBeNull();
    expect(coerceLabel({ ...LABEL, werte: {} })).toBeNull();
    expect(coerceLabel({})).toBeNull();
  });
});

describe("ionophoresIn", () => {
  it("finds coccidiostats in any spelling of the additives", () => {
    expect(ionophoresIn(["SALINOMYCIN-Natrium 60 mg", "Lasalocid A-Natrium"])).toEqual(["Salinomycin", "Lasalocid"]);
    expect(ionophoresIn(["Diclazuril 1 mg", "Vitamin E"])).toEqual([]);
  });
});
