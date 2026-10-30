import { describe, expect, it, vi } from "vitest";

// The pure helpers need the schema constants, not a database connection.
vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});
vi.mock("./plantIdentification", () => ({ MODELS: [], TEXT_MODELS: [], parseDataUrl: vi.fn(), runModelChain: vi.fn() }));

const { buildFeedAnalysis, coerceGuide, coerceSpeciesSuggestion, pickHelpfulPlants, speciesKey, statusFor } = await import("./farmAi");

const archiveEntry = (status: "safe" | "poisonous") => ({
  plantId: 7,
  germanName: "Eibe",
  botanicalName: "Taxus baccata",
  status,
  toxicityLevel: status === "poisonous" ? ("lethal" as const) : null,
  details: "…",
});

describe("species suggestion", () => {
  it("keeps only known species keys and clamps the confidence", () => {
    expect(coerceSpeciesSuggestion({ istTier: true, tierart: "goat", rasse: " Saanenziege ", sicherheit: 1.7 })).toEqual({
      isAnimal: true,
      species: "goat",
      breed: "Saanenziege",
      confidence: 1,
    });
    expect(coerceSpeciesSuggestion({ istTier: true, tierart: "dragon", sicherheit: "0.4" }).species).toBeNull();
    expect(coerceSpeciesSuggestion({ istTier: false, tierart: "goat" })).toEqual({
      isAnimal: false,
      species: null,
      breed: null,
      confidence: 0,
    });
  });
});

describe("Haltungs-Wiki", () => {
  it("is only accepted complete", () => {
    const full = { summary: "a", nutrition: "b", housing: "c", care: "d", health: "e", lifeExpectancy: "f" };
    expect(coerceGuide(full)).toEqual(full);
    expect(coerceGuide({ ...full, health: " " })).toBeNull();
  });
});

describe("plant archive bridge", () => {
  it("matches on genus and species only", () => {
    expect(speciesKey("Taxus baccata L.")).toBe("taxus baccata");
    expect(speciesKey("Taxus")).toBeNull();
  });

  it("reads the per-animal status and falls back to the legacy poultry columns", () => {
    const row = {
      id: 1,
      germanName: "Eibe",
      botanicalName: "Taxus baccata",
      animals: { horse: { status: "poisonous" as const, toxicityLevel: "lethal" as const, toxicityDetails: "Taxin", benefits: "" } },
      poultryStatus: "poisonous" as const,
      animalToxicityDetails: "alt",
    };
    expect(statusFor(row, "horse")).toMatchObject({ status: "poisonous", toxicityLevel: "lethal", details: "Taxin" });
    expect(statusFor(row, "poultry")).toMatchObject({ status: "poisonous", details: "alt" });
    expect(statusFor(row, "rabbit")).toBeNull();
  });

  it("lets the horse stand in for the donkey until the donkey is filled", () => {
    const horse = { status: "poisonous" as const, toxicityLevel: "lethal" as const, toxicityDetails: "Taxin", benefits: "" };
    const base = { id: 1, germanName: "Eibe", botanicalName: "Taxus baccata", poultryStatus: "poisonous" as const, animalToxicityDetails: "alt" };
    expect(statusFor({ ...base, animals: { horse } }, "donkey")).toMatchObject({ details: "Taxin" });
    const donkey = { ...horse, toxicityDetails: "Esel" };
    expect(statusFor({ ...base, animals: { horse, donkey } }, "donkey")).toMatchObject({ details: "Esel" });
    expect(statusFor({ ...base, animals: { horse } }, "dog")).toBeNull();
  });
});

describe("feed analysis", () => {
  const answer = (giftig: boolean) => ({
    istFutter: true,
    bestandteile: [
      { name: "Heu", botanisch: null, giftig: false },
      { name: "Eibenzweig", botanisch: "Taxus baccata", giftig },
    ],
    naehrstoffe: { protein: "mittel", rohfaser: "hoch" },
    einschaetzung: "Heu ist gut.",
    hinweiseKrankenakte: ["Wegen Moderhinke auf trockenes Futter achten."],
    bewertung: "good",
  });

  it("calls a plant poisonous when the archive says so, even if the AI does not (safety first)", () => {
    const out = buildFeedAnalysis(answer(false), new Map([["taxus baccata", archiveEntry("poisonous")]]));
    expect(out.items[1]).toMatchObject({ name: "Eibenzweig", aiPoisonous: false, poisonous: true, archive: { status: "poisonous" } });
    expect(out.verdict).toBe("unsuitable");
  });

  it("calls a plant poisonous when the AI says so, even if the archive lists it as safe", () => {
    const out = buildFeedAnalysis(answer(true), new Map([["taxus baccata", archiveEntry("safe")]]));
    expect(out.items[1]!.poisonous).toBe(true);
    expect(out.verdict).toBe("unsuitable");
  });

  it("keeps the model's verdict when nothing is poisonous and fills missing fields", () => {
    const out = buildFeedAnalysis(answer(false), new Map());
    expect(out.verdict).toBe("good");
    expect(out.nutrients).toEqual({ protein: "mittel", fat: null, fiber: "hoch", carbohydrates: null, minerals: null });
    expect(out.medicalNotes).toEqual(["Wegen Moderhinke auf trockenes Futter achten."]);
    expect(buildFeedAnalysis({ bewertung: "super" }, new Map()).verdict).toBe("limited");
  });
});

describe("helpful plants", () => {
  const row = (id: number, germanName: string, botanicalName: string, over: Record<string, unknown> = {}) => ({
    id,
    germanName,
    botanicalName,
    category: "medicinal",
    animals: {},
    poultryStatus: "safe" as const,
    animalToxicityDetails: "",
    poultryBenefits: "",
    symptoms: {},
    symptomApplications: {},
    ...over,
  });
  const safe = (benefits = "") => ({ status: "safe" as const, toxicityDetails: "", benefits });
  const kamille = row(1, "Kamille", "Matricaria chamomilla", {
    animals: { cat: safe("beruhigt den Magen"), rabbit: safe() },
    symptoms: { cat: ["Magenbeschwerden"], rabbit: ["Blähungen"] },
    symptomApplications: { cat: { Magenbeschwerden: "Abgekühlten Tee teelöffelweise ins Futter." }, rabbit: { Blähungen: "Getrocknet ins Heu." } },
  });
  const loewenzahn = row(2, "Löwenzahn", "Taraxacum officinale", { category: "edible", animals: { cat: safe(), rabbit: safe() } });
  const eibe = row(3, "Eibe", "Taxus baccata", { animals: { rabbit: { status: "poisonous", toxicityDetails: "", benefits: "" } } });

  it("gives a cat only medicinal plants, with how to use them", () => {
    expect(pickHelpfulPlants([kamille, loewenzahn, eibe], "cat", "carnivore")).toEqual([
      {
        plantId: 1,
        germanName: "Kamille",
        botanicalName: "Matricaria chamomilla",
        use: "medicinal",
        benefits: "beruhigt den Magen",
        applications: [{ symptom: "Magenbeschwerden", howTo: "Abgekühlten Tee teelöffelweise ins Futter." }],
      },
    ]);
  });

  it("gives plant eaters medicinal plants first, then feed plants, and never a poisonous one", () => {
    const out = pickHelpfulPlants([loewenzahn, eibe, kamille], "rabbit", "herbivore");
    expect(out.map((p) => [p.germanName, p.use])).toEqual([
      ["Kamille", "medicinal"],
      ["Löwenzahn", "feed"],
    ]);
  });

  it("drops a species when any archive entry of it is poisonous, and plants of risky categories", () => {
    const duplicate = row(4, "Kamille (2)", "Matricaria chamomilla L.", { animals: { rabbit: { status: "poisonous", toxicityDetails: "", benefits: "" } } });
    const pilz = row(5, "Steinpilz", "Boletus edulis", { category: "mushroom", animals: { rabbit: safe() } });
    expect(pickHelpfulPlants([kamille, duplicate, pilz], "rabbit", "herbivore")).toEqual([]);
  });
});
