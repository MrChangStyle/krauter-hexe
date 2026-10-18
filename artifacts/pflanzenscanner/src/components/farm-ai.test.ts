import { describe, expect, it } from "vitest";
import { helpfulTitle } from "@/components/farm-ai";

describe("helpful plants title", () => {
  it("offers carnivores medicinal herbs only", () => {
    expect(helpfulTitle("cat", "carnivore")).toBe("Heilkräuter für Katze");
    expect(helpfulTitle("rabbit", "herbivore")).toBe("Heil- und Futterpflanzen für Kaninchen");
  });
});
