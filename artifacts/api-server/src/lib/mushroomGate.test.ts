/**
 * Pilz-Scan (docs/scannen.md): a mushroom is only rated edible with all three
 * photos – from above, from the side and the gills from below – and a
 * confident identification. The owner's release rewrites the verdict text.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { prompts, answer } = vi.hoisted(() => ({ prompts: [] as string[], answer: { value: {} as unknown } }));

vi.mock("./geminiClient", () => ({
  ai: {
    models: {
      generateContent: ({ contents }: { contents: Array<{ parts: Array<{ text?: string }> }> }) => {
        prompts.push(contents[0]!.parts.map((p) => p.text ?? "").join("|"));
        return Promise.resolve({ text: JSON.stringify(answer.value) });
      },
    },
  },
}));

import { identifyPlant } from "./plantIdentification";
import { releasedDetails, withoutVerdict } from "./mushroomRelease";

const IMG = "data:image/webp;base64,AAAA";
const champignon = (confident: boolean) => ({
  istPflanze: true,
  germanName: "Wiesenchampignon",
  botanicalName: "Agaricus campestris",
  category: "mushroom",
  humanStatus: "edible",
  mushroomEdibleConfident: confident,
  edibilityDetails: "Essbar, Verwechslung mit Karbol-Champignon möglich.",
});

beforeEach(() => {
  prompts.length = 0;
});

describe("mushroom safety gate", () => {
  it("rates a confident find with all three photos edible and shows the AI all three views", async () => {
    answer.value = champignon(true);
    const r = await identifyPlant(IMG, IMG, IMG);
    expect(r.humanStatus).toBe("edible");
    expect(prompts[0]).toContain("ALLER DREI");
    expect(prompts[0]).toContain("Bild 3 - Lamellen bzw. Unterseite von unten:");
  });

  it("keeps a find with only two photos not edible – asks for the gills", async () => {
    answer.value = champignon(true);
    const r = await identifyPlant(IMG, IMG);
    expect(r.humanStatus).toBe("poisonous");
    expect(r.edibilityDetails).toMatch(/^⚠️ Nicht als essbar bestätigt: Für die Essbar-Einstufung eines Pilzes sind drei Fotos nötig/);
    expect(prompts[0]).not.toContain("Bild 3 - Lamellen");
  });

  it("ignores the gills without the side view, and keeps an unsure find not edible", async () => {
    answer.value = champignon(true);
    expect((await identifyPlant(IMG, undefined, IMG)).humanStatus).toBe("poisonous");
    answer.value = champignon(false);
    const unsure = await identifyPlant(IMG, IMG, IMG);
    expect(unsure.humanStatus).toBe("poisonous");
    expect(unsure.edibilityDetails).toContain("nicht eindeutig genug");
  });
});

describe("release by the owner", () => {
  const at = new Date("2026-10-30T12:00:00Z");

  it("replaces the scan's verdict with the release, keeps the rest, and can take it back", () => {
    const scanned = "⚠️ Nicht als essbar bestätigt: Die Bestimmung war nicht eindeutig genug. Zur Sicherheit …\n\nEssbar, Verwechslung mit Karbol-Champignon möglich.";
    const released = releasedDetails(scanned, true, at);
    expect(released).toBe(
      "✅ Vom Betreiber am 30.10.2026 anhand der Fotos geprüft und als essbar freigegeben. Trotzdem gilt: Pilze nur essen, wenn du dir sicher bist – im Zweifel eine Pilzberatungsstelle fragen.\n\nEssbar, Verwechslung mit Karbol-Champignon möglich.",
    );
    const back = releasedDetails(released, false, at);
    expect(back.startsWith("⚠️ Nicht als essbar bestätigt: Der Betreiber hat die Freigabe am 30.10.2026 zurückgenommen.")).toBe(true);
    expect(withoutVerdict(back)).toBe("Essbar, Verwechslung mit Karbol-Champignon möglich.");
  });
});
