import { describe, expect, it } from "vitest";
import { DashboardWidgetId } from "@workspace/api-client-react";
import { DEFAULT_LAYOUT, WIDGETS, effectiveLayout, moveWidget, plantTaskDue, toggleWidget, topCounts, widgetsOf } from "@/lib/dashboard";

describe("Hof-Dashboard", () => {
  it("knows every widget once and starts with a default for both areas", () => {
    expect(new Set(WIDGETS.map((w) => w.id)).size).toBe(WIDGETS.length);
    for (const id of DEFAULT_LAYOUT) expect(WIDGETS.some((w) => w.id === id), id).toBe(true);
    expect(widgetsOf(DEFAULT_LAYOUT, "pflanzen").map((w) => w.id)).toEqual(["plant-tasks", "garden"]);
    expect(widgetsOf(DEFAULT_LAYOUT, "tiere").length).toBeGreaterThan(3);
    // The layout decides the order; unknown ids are skipped.
    expect(widgetsOf(["animals", "farm-tasks", "nope" as never], "tiere").map((w) => w.id)).toEqual(["animals", "farm-tasks"]);
  });

  it("has a widget for every id the server accepts, and no more", () => {
    expect(WIDGETS.map((w) => w.id).sort()).toEqual(Object.values(DashboardWidgetId).sort());
  });

  it("uses the account's layout, else the default, without what this build leaves out", () => {
    expect(effectiveLayout(null, () => true)).toEqual([...DEFAULT_LAYOUT]);
    expect(effectiveLayout(["grow", "animals"], () => true)).toEqual(["grow", "animals"]);
    expect(effectiveLayout(["grow", "animals"], (id) => id !== "grow")).toEqual(["animals"]);
    expect(effectiveLayout([], () => true)).toEqual([]);
  });

  it("switches and moves widgets within their area", () => {
    const layout = ["plant-tasks", "animals", "garden", "duties"] as const;
    expect(toggleWidget(layout, "animals")).toEqual(["plant-tasks", "garden", "duties"]);
    expect(toggleWidget(layout, "seeds")).toEqual([...layout, "seeds"]);
    // garden goes before plant-tasks; the animals in between stay put.
    expect(moveWidget(layout, "garden", -1)).toEqual(["garden", "animals", "plant-tasks", "duties"]);
    expect(moveWidget(layout, "duties", -1)).toEqual(["plant-tasks", "duties", "garden", "animals"]);
    expect(moveWidget(layout, "plant-tasks", -1)).toEqual([...layout]);
    expect(moveWidget(layout, "duties", 1)).toEqual([...layout]);
  });

  it("finds care tasks due by the day", () => {
    const now = new Date(2026, 9, 21, 9, 0);
    const task = { isActive: true, lastCompletedAt: new Date(2026, 9, 18, 20, 0).toISOString(), createdAt: new Date(2026, 8, 1).toISOString(), intervalValue: 3, intervalUnit: "Tage" as const };
    expect(plantTaskDue(task, now)).toBe(true);
    expect(plantTaskDue({ ...task, intervalValue: 4 }, now)).toBe(false);
    expect(plantTaskDue({ ...task, intervalUnit: "Wochen" }, now)).toBe(false);
    expect(plantTaskDue({ ...task, lastCompletedAt: null }, now)).toBe(true);
    expect(plantTaskDue({ ...task, isActive: false }, now)).toBe(false);
  });

  it("names the biggest groups", () => {
    const label = (k: string, n: number) => `${n} ${k}`;
    expect(topCounts(["Huhn", "Ziege", "Huhn", "Schaf", "Huhn", "Ziege", "Ente"], label)).toBe("3 Huhn, 2 Ziege und 2 weitere Arten");
    expect(topCounts(["Huhn"], label)).toBe("1 Huhn");
    expect(topCounts(["Huhn", "Ziege", "Schaf"], label, 2)).toMatch(/und 1 weitere Art$/);
  });
});
