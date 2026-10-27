import { describe, expect, it } from "vitest";
import { appendPhrase, speechSupported, spokenPunctuation } from "@/lib/speech";

describe("Spracheingabe", () => {
  it("adds dictated phrases as sentences", () => {
    expect(appendPhrase("", "bitte eine dunkle ansicht")).toBe("Bitte eine dunkle ansicht");
    expect(appendPhrase("Toll", "noch was")).toBe("Toll. Noch was");
    expect(appendPhrase("Toll!", "noch was")).toBe("Toll! Noch was");
    expect(appendPhrase("Text  ", "")).toBe("Text  ");
  });

  it("knows when the browser cannot listen", () => {
    expect(speechSupported()).toBe(false);
  });
});

describe("spoken punctuation", () => {
  it("turns said marks into marks", () => {
    expect(spokenPunctuation("Nudeln Komma Eier Komma Milch Punkt")).toBe("Nudeln, Eier, Milch.");
    expect(spokenPunctuation("Brot neue Zeile Butter")).toBe("Brot\nButter");
    expect(appendPhrase("", "nudeln komma eier")).toBe("Nudeln, eier");
  });

  it("leaves words that only contain them alone", () => {
    expect(spokenPunctuation("Treffpunkt am Kommando")).toBe("Treffpunkt am Kommando");
  });

  it("makes one running text for the lists, without a full stop at each pause", () => {
    let t = appendPhrase("", "Nudeln mit roter und mit grüner Soße.", { flow: true });
    t = appendPhrase(t, "Kakis.", { flow: true });
    t = appendPhrase(t, "Orangen", { flow: true });
    expect(t).toBe("Nudeln mit roter und mit grüner Soße Kakis Orangen");
    expect(appendPhrase("Brot", "Butter Komma Milch", { flow: true })).toBe("Brot Butter, Milch");
  });
});
