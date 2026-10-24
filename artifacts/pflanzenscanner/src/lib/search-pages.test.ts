import { describe, expect, it } from "vitest";
import { matchPages } from "@/lib/search-pages";

describe("Suche: App-Seiten", () => {
  it("finds pages by name and everyday words, names first", () => {
    expect(matchPages("futter", () => true).map((p) => p.title)).toEqual(["Futterplaner", "Futtervorrat", "Stall-Aufgaben"]);
    expect(matchPages("wurmkur", () => true).map((p) => p.title)).toEqual(["Arzneimittel"]);
    expect(matchPages("Gießen", () => true)[0]!.title).toBe("Pflegeplan");
  });

  it("leaves out hidden modules and too short queries", () => {
    expect(matchPages("futter", (id) => id !== "feed").map((p) => p.title)).toEqual(["Stall-Aufgaben"]);
    expect(matchPages("f", () => true)).toEqual([]);
  });
});
