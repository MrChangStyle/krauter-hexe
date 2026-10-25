import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERAL_HELP, MODULE_HELP, helpForPath, searchHelp } from "@/lib/help";
import { MODULES } from "@/lib/modules";

/**
 * Hilfe & FAQ stays complete: a new module needs its entry in lib/help.ts –
 * the box at the top of its page and the help area come from there.
 */
describe("Hilfe & FAQ", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");

  it("explains every module, with steps and questions, on a page that exists", () => {
    for (const m of MODULES) {
      const e = MODULE_HELP[m.id];
      expect(e, m.id).toBeDefined();
      expect(e.intro.length, m.id).toBeGreaterThan(60);
      expect(e.steps.length, m.id).toBeGreaterThanOrEqual(3);
      expect(e.faq.length, m.id).toBeGreaterThanOrEqual(1);
      expect(app, `${m.id}: ${e.href}`).toContain(`path="${e.href}"`);
    }
    expect(Object.keys(MODULE_HELP).sort()).toEqual(MODULES.map((m) => m.id).sort());
    expect(GENERAL_HELP.every((t) => t.faq.length > 0)).toBe(true);
  });

  it("finds the module of a page for the box at the top, not of pages below it", () => {
    expect(helpForPath("/farm/bienen")?.id).toBe("bees");
    expect(helpForPath("/farm/bienen/")?.id).toBe("bees");
    expect(helpForPath("/farm/bienen/3")).toBeNull();
    expect(helpForPath("/")).toBeNull();
    expect(helpForPath("/hilfe")).toBeNull();
  });

  it("searches titles, explanations and questions", () => {
    const ids = MODULES.map((m) => m.id);
    expect(searchHelp("ohrmarke", ids)).toEqual(expect.arrayContaining(["animals"]));
    expect(searchHelp("Feuchtigkeit Standort", ids)).toEqual(["bees"]);
    expect(searchHelp("", ["bees", "feed"])).toEqual(["bees", "feed"]);
  });
});
