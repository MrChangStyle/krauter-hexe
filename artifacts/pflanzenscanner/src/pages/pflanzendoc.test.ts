import { describe, expect, it } from "vitest";
import { limitText } from "@/pages/pflanzendoc";

describe("limitText", () => {
  it("shows the server's sentence", () => {
    expect(limitText({ status: 429, data: { error: "Du hast heute schon 15 KI-Anfragen gestellt. Morgen geht es weiter." } })).toBe(
      "Du hast heute schon 15 KI-Anfragen gestellt. Morgen geht es weiter.",
    );
  });

  it("falls back to a sentence of its own", () => {
    expect(limitText({ status: 429, data: null })).toMatch(/Tageslimit/);
    expect(limitText(null)).toMatch(/Tageslimit/);
  });
});
