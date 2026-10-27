/** Hof-Aufgaben (docs/hof-aufgaben.md): due days, area and action from the text. */
import { describe, expect, it } from "vitest";
import { farmTaskDue, guessFarmTaskAction, guessFarmTaskArea } from "./farmTaskRules";

const base = { repeats: true, startsOn: null, createdDay: "2026-10-20", completedDay: null, intervalDays: 1 };

describe("Hof-Aufgaben – due day", () => {
  it("keeps the old rule without a first day: one interval after creation, then after each tick", () => {
    expect(farmTaskDue(base)).toEqual({ dueDate: "2026-10-21", done: false });
    expect(farmTaskDue({ ...base, completedDay: "2026-10-27", intervalDays: 7 })).toEqual({ dueDate: "2026-11-03", done: false });
  });

  it("starts a daily task on its first day, today included", () => {
    expect(farmTaskDue({ ...base, startsOn: "2026-10-20" }).dueDate).toBe("2026-10-20");
    expect(farmTaskDue({ ...base, startsOn: "2026-10-20", completedDay: "2026-10-20" }).dueDate).toBe("2026-10-21");
    // A first day later than the next interval wins.
    expect(farmTaskDue({ ...base, startsOn: "2026-11-01", completedDay: "2026-10-20" }).dueDate).toBe("2026-11-01");
  });

  it("has a one-off task due on its day and done for good once ticked off", () => {
    const once = { ...base, repeats: false, startsOn: "2026-10-27" };
    expect(farmTaskDue(once)).toEqual({ dueDate: "2026-10-27", done: false });
    expect(farmTaskDue({ ...once, completedDay: "2026-10-27" })).toEqual({ dueDate: "2026-10-27", done: true });
  });
});

describe("Hof-Aufgaben – area and action from the text", () => {
  // The list from the request: what is to be done today on the Hof.
  const cases: Array<[string, string, string]> = [
    ["Eier von den Hühnern einsammeln", "tiere", "Eier sammeln"],
    ["Meerschweinchen Gras geben", "tiere", "Füttern"],
    ["Gänsen Nassfutter geben", "tiere", "Füttern"],
    ["Gänsen Trockenfutter geben", "tiere", "Füttern"],
    ["Teichpumpe kontrollieren", "hof", "Sonstiges"],
    ["Mit dem Kescher die Federn aus dem Teich holen", "hof", "Sonstiges"],
    ["Hochbeet gießen", "garten", "Sonstiges"],
    ["Tomaten ernten", "garten", "Sonstiges"],
    ["Ziegen Wasser auffüllen", "tiere", "Tränken"],
    ["Hühnerstall ausmisten", "tiere", "Ausmisten"],
  ];
  it.each(cases)("%s → %s, %s", (title, area, action) => {
    expect(guessFarmTaskArea(title)).toBe(area);
    expect(guessFarmTaskAction(title)).toBe(action);
  });

  it("does not take words that only contain an animal", () => {
    expect(guessFarmTaskArea("Heute Wirtschaftsweg kehren")).toBe("hof");
    expect(guessFarmTaskArea("Installation der Teichpumpe prüfen")).toBe("hof");
    expect(guessFarmTaskArea("Computer neu starten")).toBe("hof");
  });
});
