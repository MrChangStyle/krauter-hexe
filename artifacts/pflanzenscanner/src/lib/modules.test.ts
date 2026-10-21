import { describe, expect, it } from "vitest";
import { DashboardWidgetId, ModuleId } from "@workspace/api-client-react";
import { FARM_MODULE_IDS, MODULES, WIDGET_MODULE, farmModuleGranted, grantSummary, moduleVisible, tierLabel, toggleModule } from "@/lib/modules";

describe("Module", () => {
  it("lists every module the server knows, once", () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(Object.values(ModuleId).sort());
    for (const w of Object.values(DashboardWidgetId)) expect(Object.values(ModuleId), w).toContain(WIDGET_MODULE[w]);
  });

  it("hides a module with itself or with its area", () => {
    expect(moduleVisible([], "grow")).toBe(true);
    expect(moduleVisible(["grow"], "grow")).toBe(false);
    expect(moduleVisible(["plants"], "grow")).toBe(false);
    expect(moduleVisible(["plants"], "feed")).toBe(true);
    expect(moduleVisible(["animals"], "animals")).toBe(false);
  });

  it("labels Lite and Premium only where Premium adds something", () => {
    expect(tierLabel("grow", false)).toBe("Lite");
    expect(tierLabel("grow", true)).toBe("Premium");
    expect(tierLabel("feed", true)).toBeNull();
    expect(toggleModule(["grow"], "grow")).toEqual([]);
    expect(toggleModule([], "feed")).toEqual(["feed"]);
  });

  it("hides farm modules a member was not granted", () => {
    const helper = { role: "caretaker", modules: ["feed"] as ModuleId[] };
    expect(farmModuleGranted(helper, "feed")).toBe(true);
    expect(farmModuleGranted(helper, "farm-tasks")).toBe(false);
    // Not a farm module, admins, members without a list, no farm yet: shown.
    expect(farmModuleGranted(helper, "lexicon")).toBe(true);
    expect(farmModuleGranted({ role: "admin", modules: [] }, "feed")).toBe(true);
    expect(farmModuleGranted({ role: "guest", modules: null }, "feed")).toBe(true);
    expect(farmModuleGranted(null, "feed")).toBe(true);
    expect(grantSummary(null)).toBe("Alle Module");
    expect(grantSummary(["feed", "garden"])).toBe(`2 von ${FARM_MODULE_IDS.length} Modulen`);
    expect(grantSummary([])).toBe("Keine Module");
    // Every farm module is a known module.
    for (const id of FARM_MODULE_IDS) expect(MODULES.some((m) => m.id === id), id).toBe(true);
  });
});
