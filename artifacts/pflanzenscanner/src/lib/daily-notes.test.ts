import { describe, expect, it } from "vitest";
import type { DailyNote } from "@workspace/api-client-react";
import { groupNotes, notesNeedPlan, splitNotes } from "@/lib/daily-notes";

const note = (id: number, over: Partial<DailyNote> = {}): DailyNote => ({
  id,
  listOwnerId: "stefan",
  listOwnerName: "Stefan",
  kind: "einkauf",
  category: "lebensmittel",
  text: `Notiz ${id}`,
  done: false,
  doneAt: null,
  doneByName: null,
  addedByName: "Stefan",
  isOwnList: true,
  createdAt: "2026-10-27T08:00:00Z",
  ...over,
});

describe("Alltagsnotizen – grouping", () => {
  it("groups the shopping list by section in shop order, then remembering, then done", () => {
    const g = groupNotes(
      [
        note(1, { category: "drogerie" }),
        note(2),
        note(3, { kind: "merken", category: null }),
        note(4, { done: true }),
        note(5, { category: null }),
        note(6, { listOwnerId: "maria" }),
      ],
      "stefan",
    );
    expect(g.shopping.map((s) => [s.category, s.notes.map((n) => n.id)])).toEqual([
      ["lebensmittel", [2]],
      ["drogerie", [1]],
      ["sonstiges", [5]],
    ]);
    expect(g.remember.map((n) => n.id)).toEqual([3]);
    expect(g.done.map((n) => n.id)).toEqual([4]);
  });
});

describe("Alltagsnotizen – a list without the AI", () => {
  it("splits at commas, sentences and 'und', and takes the filler out", () => {
    expect(splitNotes("Ich muss Zahnbürsten kaufen und Fleisch holen. Oma anrufen, Milch").map((n) => n.text)).toEqual([
      "Zahnbürsten",
      "Fleisch",
      "Oma anrufen",
      "Milch",
    ]);
    expect(splitNotes("  ")).toEqual([]);
    expect(splitNotes("- Brot\n- brot")).toEqual([{ text: "Brot", kind: null, category: null }]);
  });

  it("keeps a lone describing word after 'und' with its thing", () => {
    expect(splitNotes("Nudeln rot und grün").map((n) => n.text)).toEqual(["Nudeln rot und grün"]);
    expect(splitNotes("Nudeln rot und grün, Milch und Brot").map((n) => n.text)).toEqual(["Nudeln rot und grün", "Milch", "Brot"]);
  });

  it("puts one plain thing straight on the list", () => {
    expect(notesNeedPlan("Zahnbürsten")).toBe(false);
    expect(notesNeedPlan("2 kg Hackfleisch")).toBe(false);
    expect(notesNeedPlan("Zahnbürsten und Fleisch")).toBe(true);
    expect(notesNeedPlan("Ich muss heute noch Zahnbürsten kaufen gehen")).toBe(true);
    // Spoken lists without commas, and a shop with the thing.
    expect(notesNeedPlan("Nudeln Eier")).toBe(true);
    expect(notesNeedPlan("bei Penny Nudeln kaufen")).toBe(true);
  });
});
