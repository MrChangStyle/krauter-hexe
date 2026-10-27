/**
 * Alltagsnotizen (docs/alltagsnotizen.md): the shopping list by section of
 * the shop, things to remember, and a spoken or typed text turned into
 * single notes when the AI is not there.
 */
import type { DailyNote, NoteCategory, NoteKind } from "@workspace/api-client-react";

export const KIND_LABELS: Record<NoteKind, string> = { einkauf: "Einkaufsliste", merken: "Merken & Erledigen" };

/** The sections in the order of a walk through the shop. */
export const CATEGORY_ORDER: NoteCategory[] = ["lebensmittel", "getraenke", "drogerie", "haushalt", "tierbedarf", "garten", "sonstiges"];

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  lebensmittel: "Lebensmittel",
  getraenke: "Getränke",
  drogerie: "Drogerie & Apotheke",
  haushalt: "Haushalt",
  tierbedarf: "Tierbedarf",
  garten: "Garten & Baumarkt",
  sonstiges: "Sonstiges",
};

/** A note to create; kind and section null = the server sorts it from the words. */
export interface NoteDraft {
  text: string;
  kind: NoteKind | null;
  category: NoteCategory | null;
}

export interface NoteGroups {
  /** Shopping, open, by section in shop order. */
  shopping: Array<{ category: NoteCategory; notes: DailyNote[] }>;
  remember: DailyNote[];
  done: DailyNote[];
}

/** The notes of one list (owner), grouped for the page. */
export function groupNotes(notes: DailyNote[], ownerId: string | null): NoteGroups {
  const list = ownerId === null ? notes : notes.filter((n) => n.listOwnerId === ownerId);
  const open = list.filter((n) => !n.done);
  const shopping = CATEGORY_ORDER.map((category) => ({
    category,
    notes: open.filter((n) => n.kind === "einkauf" && (n.category ?? "sonstiges") === category),
  })).filter((g) => g.notes.length > 0);
  return { shopping, remember: open.filter((n) => n.kind === "merken"), done: list.filter((n) => n.done) };
}

export const MAX_NOTES = 30;

// Word boundaries that also hold for ä, ö, ü and ß (\b does not).
const w = (src: string, flags = "giu") => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, flags);

const FILLER = w("ich|wir|muss|müssen|musst|soll|sollen|noch|mal|bitte|auch|unbedingt|dringend|heute|morgen|kaufen|einkaufen|holen|besorgen|mitbringen|nachkaufen|brauche|brauchen|nicht vergessen|vergessen|zu|dann");

/**
 * A spoken or typed list → notes, without the AI: new lines, commas,
 * sentences and "und" separate ("Zahnbürsten und Fleisch" are two things),
 * filler like "ich muss … kaufen" goes. A note that names a doing
 * ("anrufen") stays whole. The server sorts kind and section.
 */
export function splitNotes(text: string): NoteDraft[] {
  const parts = text
    .split(/[\n,;]+|[.!?](?:\s+|$)|\s+und\s+|\s+sowie\s+|\s+außerdem\s+|\s+dann\s+/i)
    .map((p) => {
      const keepsVerb = w("anruf\\w*|termin|bezahl\\w*|überweis\\w*|abholen|abgeben|zurückbringen|melden|schreiben|reparier\\w*", "iu").test(p);
      const cleaned = keepsVerb ? p.replace(w("ich|wir|muss|müssen|noch|mal|bitte|unbedingt"), " ") : p.replace(FILLER, " ");
      return cleaned.replace(/\s+/g, " ").trim().replace(/^[-•*\d.)\s]+/, "").replace(/[.!?]+$/, "");
    })
    .filter((p) => p.length >= 2)
    .map((p) => (p.charAt(0).toLocaleUpperCase("de-DE") + p.slice(1)).slice(0, 120));
  return [...new Set(parts)].slice(0, MAX_NOTES).map((t) => ({ text: t, kind: null, category: null }));
}

/** One plain thing ("Zahnbürsten") goes straight on the list; anything longer goes through the AI. */
export function notesNeedPlan(text: string): boolean {
  const t = text.trim();
  return /[,;\n.!?]|\s(und|sowie|dann)\s/i.test(t) || t.split(/\s+/).length > 4;
}
