import { describe, expect, it } from "vitest";
import { certifiedIn, organicAdviceIn, organicAreasFor } from "./farming-labels";

describe("Bio je Bereich", () => {
  it("offers the areas the level knows", () => {
    expect(organicAreasFor("conventional")).toEqual([]);
    expect(organicAreasFor("natural").map((a) => a.key)).toEqual(["plants", "garden"]);
    expect(organicAreasFor("association").map((a) => a.key)).toEqual(["plants", "garden", "feed", "space", "treatments", "products"]);
  });

  it("applies Bio only where the farm keeps it on", () => {
    const bio = { level: "organic" as const, organicOff: ["feed" as const] };
    expect(certifiedIn(bio, "feed")).toBe(false);
    expect(certifiedIn(bio, "garden")).toBe(true);
    expect(organicAdviceIn(bio, "garden")).toBe(true);
    expect(certifiedIn({ level: "natural", organicOff: [] }, "garden")).toBe(false);
    expect(organicAdviceIn({ level: "natural", organicOff: ["garden"] }, "garden")).toBe(false);
    expect(certifiedIn(undefined, "feed")).toBe(false);
  });
});
