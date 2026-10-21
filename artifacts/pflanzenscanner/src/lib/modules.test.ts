import { describe, expect, it } from "vitest";
import { DashboardWidgetId, ModuleId } from "@workspace/api-client-react";
import { MODULES, WIDGET_MODULE, moduleVisible, tierLabel, toggleModule } from "@/lib/modules";

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
});
