/**
 * Bio (docs/bio.md) in Pflanzendoc and Pflege-Guide: with organic advice the
 * AI is told to name organic means only, the mineral advice is dropped and a
 * mineral fertilising day becomes an organic one. Without it, all stays as it was.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prompts, answer } = vi.hoisted(() => ({ prompts: [] as string[], answer: { value: {} as unknown } }));

vi.mock("./geminiClient", () => ({
  ai: {
    models: {
      generateContent: ({ contents }: { contents: Array<{ parts: Array<{ text?: string }> }> }) => {
        prompts.push(contents[0]!.parts.map((p) => p.text ?? "").join(""));
        return Promise.resolve({ text: JSON.stringify(answer.value) });
      },
    },
  },
}));

import { checkPlantHealth, generateCareGuide } from "./plantIdentification";

const IMAGE = "data:image/jpeg;base64,AAAA";
const HEALTH = {
  pflanzen_name: "Tomate (Solanum lycopersicum)",
  gesundheits_score: 70,
  symptome: ["Blattflecken"],
  hausmittel: [],
  duenge_biologisch: "Kompost und Brennnesseljauche.",
  duenge_chemisch: "Blaukorn alle zwei Wochen.",
};

beforeEach(() => {
  prompts.length = 0;
});

describe("checkPlantHealth", () => {
  it("keeps both kinds of advice by default", async () => {
    answer.value = HEALTH;
    const r = await checkPlantHealth(IMAGE);
    expect(r).toMatchObject({ duenge_chemisch: "Blaukorn alle zwei Wochen.", organic: false });
    expect(prompts[0]).not.toContain("wirtschaftet biologisch");
  });

  it("names organic means only when asked", async () => {
    answer.value = HEALTH; // the model ignored the rule – the mineral advice is dropped anyway
    const r = await checkPlantHealth(IMAGE, { organic: true });
    expect(r).toMatchObject({ duenge_biologisch: "Kompost und Brennnesseljauche.", duenge_chemisch: "", organic: true });
    expect(prompts[0]).toContain("wirtschaftet biologisch");
  });
});

describe("generateCareGuide", () => {
  const plan = { targetHumidity: "60 %", potSizeRecommendation: "Aktueller Topf ist ausreichend", recommendedPotDiameter: null, recommendedSoilType: "Erde", dailyPlan: [{ day: 1, duengen: true, duengerart: "mineralisch" }] };
  const params = { plantName: "Tomate", healthScore: 70, symptoms: [], duengeBiologisch: "Kompost", duegeChemisch: "Blaukorn" };

  it("keeps mineral days by default", async () => {
    answer.value = plan;
    expect((await generateCareGuide(params)).dailyPlan[0]!.duengerart).toBe("mineralisch");
    expect(prompts[0]).toContain("Mineralische Düngeempfehlung: Blaukorn");
  });

  it("fertilises organically only when asked", async () => {
    answer.value = plan;
    expect((await generateCareGuide({ ...params, organic: true })).dailyPlan[0]!.duengerart).toBe("biologisch");
    expect(prompts[0]).not.toContain("Mineralische Düngeempfehlung");
    expect(prompts[0]).toContain("wirtschaftet biologisch");
  });
});
