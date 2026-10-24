import { describe, expect, it } from "vitest";
import { kindForCrop, suggestBestBefore } from "@/lib/pantry-labels";

describe("pantry labels", () => {
  it("suggests the same best-before dates as the server", () => {
    expect(suggestBestBefore("canned", "2026-08-15")).toBe("2027-08-15");
    expect(suggestBestBefore("frozen", "2026-08-15")).toBe("2027-05-15");
    expect(suggestBestBefore("eggs", "2026-10-01")).toBe("2026-10-29");
    expect(suggestBestBefore("fermented", "2026-08-31")).toBe("2027-02-28");
    expect(suggestBestBefore("other", "2026-08-31")).toBe("");
  });

  it("guesses how a harvest is kept", () => {
    expect(["tomate", "erdbeere", "basilikum", "gurke", null].map(kindForCrop)).toEqual(["canned", "frozen", "dried", "pickled", "canned"]);
  });
});
