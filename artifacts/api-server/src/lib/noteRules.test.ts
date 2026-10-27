/** Alltagsnotizen (docs/alltagsnotizen.md): shopping or remembering, and the section of the shop. */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { guessNoteCategory, guessNoteKind } = await import("./noteRules");
const { coerceNotes, notesPrompt, MAX_PLANNED_NOTES } = await import("./dailyNotes");

describe("Alltagsnotizen – kind and section", () => {
  it.each([
    ["Zahnbürsten", "einkauf", "drogerie"],
    ["Fleisch holen", "einkauf", "lebensmittel"],
    ["2 Kästen Wasser", "einkauf", "getraenke"],
    ["Spülmaschinentabs", "einkauf", "haushalt"],
    ["Legemehl für die Hühner", "einkauf", "tierbedarf"],
    ["Blumenerde", "einkauf", "garten"],
    ["Geschenk für Oma", "einkauf", "sonstiges"],
    ["Oma anrufen", "merken", null],
    ["Tierarzt Termin ausmachen", "merken", null],
    ["Rechnung bezahlen", "merken", null],
  ])("%s → %s, %s", (text, kind, category) => {
    const k = guessNoteKind(text);
    expect(k).toBe(kind);
    expect(guessNoteCategory(text, k)).toBe(category);
  });
});

describe("Alltagsnotizen – the AI's answer", () => {
  it("keeps text, kind and section; guesses what is missing or wrong; drops duplicates", () => {
    expect(
      coerceNotes({
        notizen: [
          { text: "Zahnbürsten", art: "einkauf", bereich: "drogerie" },
          { text: "fleisch.", art: "einkauf", bereich: "metzger" },
          { text: "Oma anrufen", art: "merken", bereich: "lebensmittel" },
          { text: "Zahnbürsten" },
          { text: "x" },
          null,
          "Brot",
          { text: "Brot", art: "kaufen" },
        ],
      }),
    ).toEqual([
      { text: "Zahnbürsten", kind: "einkauf", category: "drogerie" },
      { text: "Fleisch", kind: "einkauf", category: "lebensmittel" },
      { text: "Oma anrufen", kind: "merken", category: null },
      { text: "Brot", kind: "einkauf", category: "lebensmittel" },
    ]);
    expect(coerceNotes(null)).toEqual([]);
    expect(coerceNotes({ notizen: Array.from({ length: 40 }, (_, i) => ({ text: `Ding ${i}` })) })).toHaveLength(MAX_PLANNED_NOTES);
  });

  it("gives the model the text and the sections", () => {
    const prompt = notesPrompt("Ich muss Zahnbürsten kaufen");
    expect(prompt).toContain('"""Ich muss Zahnbürsten kaufen"""');
    expect(prompt).toContain('"drogerie" (Drogerie & Apotheke)');
  });
});
