import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, WIDGETS, plantTaskDue, topCounts, widgetsOf } from "@/lib/dashboard";

describe("Hof-Dashboard", () => {
  it("knows every widget once and starts with a default for both areas", () => {
    expect(new Set(WIDGETS.map((w) => w.id)).size).toBe(WIDGETS.length);
    for (const id of DEFAULT_LAYOUT) expect(WIDGETS.some((w) => w.id === id), id).toBe(true);
    expect(widgetsOf(DEFAULT_LAYOUT, "pflanzen").map((w) => w.id)).toEqual(["plant-tasks", "garden"]);
    expect(widgetsOf(DEFAULT_LAYOUT, "tiere").length).toBeGreaterThan(3);
    // The layout decides the order; unknown ids are skipped.
    expect(widgetsOf(["animals", "farm-tasks", "nope" as never], "tiere").map((w) => w.id)).toEqual(["animals", "farm-tasks"]);
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
