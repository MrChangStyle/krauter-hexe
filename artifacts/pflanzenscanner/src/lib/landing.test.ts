import { describe, expect, it } from "vitest";
import { LANDING_TEXT } from "@/lib/landing";
import { MODULES } from "@/lib/modules";

describe("Landingpage", () => {
  it("explains every module, and only those", () => {
    const modules = MODULES.filter((m) => !m.isArea).map((m) => m.id).sort();
    expect(Object.keys(LANDING_TEXT).sort()).toEqual(modules);
    for (const text of Object.values(LANDING_TEXT)) expect(text!.length).toBeGreaterThan(40);
  });
});
