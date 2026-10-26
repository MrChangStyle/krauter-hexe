import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalSymptom } from "./symptomVocabulary";
import { normalizePlantSymptoms } from "./plantSymptomNames";

describe("Beschwerden-Wortschatz (Server)", () => {
  it("is the same file as in the app, apart from the header", () => {
    const body = (f: string) => f.slice(f.indexOf("/** Ordered rules"));
    const server = readFileSync(join(__dirname, "symptomVocabulary.ts"), "utf8");
    const app = readFileSync(join(__dirname, "../../../pflanzenscanner/src/lib/symptom-vocabulary.ts"), "utf8");
    expect(body(server)).toBe(body(app));
  });

  it("maps variants to one name", () => {
    expect(canonicalSymptom("Magenkrämpfe")).toBe("Magen-Darm-Beschwerden");
    expect(canonicalSymptom("Rachenraumentzündung")).toBe("Mund- und Rachenentzündungen");
    expect(canonicalSymptom("hufrehe")).toBe("Hufrehe");
  });
});

describe("normalizePlantSymptoms", () => {
  it("renames, collapses variants and moves the instructions", () => {
    const r = normalizePlantSymptoms(
      { human: ["Magenkrämpfe", "Verdauungsbeschwerden", "Husten"], poultry: [] },
      { human: { Magenkrämpfe: "Als Tee trinken.", Verdauungsbeschwerden: "Nach dem Essen kauen.", Husten: "" } },
    );
    expect(r.changed).toBe(true);
    expect(r.symptoms).toEqual({ human: ["Magen-Darm-Beschwerden", "Husten"], poultry: [] });
    expect(r.applications.human).toEqual({ "Magen-Darm-Beschwerden": "Als Tee trinken. Nach dem Essen kauen.", Husten: "" });
  });

  it("leaves clean data alone", () => {
    const r = normalizePlantSymptoms({ human: ["Husten", "Legenot"] }, { human: { Husten: "Tee." } });
    expect(r.changed).toBe(false);
    expect(normalizePlantSymptoms(r.symptoms, r.applications).changed).toBe(false);
  });
});
