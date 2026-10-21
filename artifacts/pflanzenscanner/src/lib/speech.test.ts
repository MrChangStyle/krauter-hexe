import { describe, expect, it } from "vitest";
import { appendPhrase, speechSupported } from "@/lib/speech";

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
