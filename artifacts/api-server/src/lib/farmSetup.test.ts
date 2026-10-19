import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { START_RATIONS } = await import("./farmSetup");
const { feedByKey } = await import("./feedCatalog");
const { checkRation, needFor } = await import("./feedNeeds");

describe("Hof einrichten – starting rations", () => {
  it("use only feeds of the list and pass the Futterplaner's check without red", () => {
    for (const [species, start] of Object.entries(START_RATIONS)) {
      const items = start!.items.map(([key, grams]) => {
        const feed = feedByKey(key);
        expect(feed, `${species}: ${key}`).toBeDefined();
        return { ...feed!, grams };
      });
      const need = needFor(species as never, start!.stage)!;
      expect(need, species).not.toBeNull();
      const red = checkRation(species as never, need, items).checks.filter((c) => c.severe).map((c) => c.nutrient);
      expect(red, species).toEqual([]);
    }
  });
});
