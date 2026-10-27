import { describe, expect, it } from "vitest";
import type { FarmTask } from "@workspace/api-client-react";
import { hofToday, overdueText, scheduleText, splitTaskList, taskTitle } from "@/lib/hof-tasks";

const task = (id: number, over: Partial<FarmTask> = {}): FarmTask => ({
  id,
  animalId: null,
  animalName: null,
  herdId: null,
  herdName: null,
  actionType: "Sonstiges",
  title: `Aufgabe ${id}`,
  area: "hof",
  startsOn: "2026-10-27",
  repeats: true,
  assigneeId: null,
  assigneeName: null,
  lastCompletedBy: null,
  lastCompletedByName: null,
  notes: null,
  intervalValue: 1,
  intervalUnit: "Tage",
  reminderTime: "08:00",
  isActive: true,
  lastCompletedAt: null,
  createdAt: "2026-10-27T06:00:00Z",
  dueDate: "2026-10-27",
  isDue: true,
  isDone: false,
  doneToday: false,
  commentCount: 0,
  comments: [],
  ...over,
});

describe("Hof-Aufgaben – the list for today", () => {
  const today = "2026-10-27";
  const tasks = [
    task(1, { reminderTime: "17:00", area: "tiere", assigneeId: "maria" }),
    task(2, { reminderTime: "07:00", dueDate: "2026-10-25" }),
    task(3, { isDue: false, doneToday: true, dueDate: "2026-10-28", area: "garten", assigneeId: "stefan" }),
    task(4, { isDue: false, dueDate: "2026-10-30" }),
    task(5, { isDue: false, dueDate: "2026-12-01" }),
    task(6, { isActive: false }),
    task(7, { repeats: false, isDue: false, isDone: true, doneToday: false }),
  ];

  it("has open (overdue first), done today and the next seven days; paused and finished ones are left out", () => {
    const { open, done, soon } = hofToday(tasks, today);
    expect(open.map((t) => t.id)).toEqual([2, 1]);
    expect(done.map((t) => t.id)).toEqual([3]);
    expect(soon.map((t) => t.id)).toEqual([4]);
  });

  it("filters by area and by person – for me means mine and those for everyone", () => {
    expect(hofToday(tasks, today, "tiere").open.map((t) => t.id)).toEqual([1]);
    expect(hofToday(tasks, today, "mine", "stefan").open.map((t) => t.id)).toEqual([2]);
    expect(hofToday(tasks, today, "mine", "stefan").done.map((t) => t.id)).toEqual([3]);
  });

  it("names the task and its schedule", () => {
    expect(taskTitle({ title: null, actionType: "Füttern" })).toBe("Füttern");
    expect(scheduleText(task(1))).toBe("jeden Tag");
    expect(scheduleText(task(1, { intervalValue: 2, intervalUnit: "Wochen" }))).toBe("alle 2 Wochen");
    expect(scheduleText(task(1, { repeats: false, startsOn: "2026-11-03" }))).toBe("einmalig am 3.11.");
    expect(overdueText("2026-10-26", today)).toBe("seit gestern");
    expect(overdueText("2026-10-24", today)).toBe("seit 3 Tagen");
    expect(overdueText(today, today)).toBeNull();
  });
});

describe("Hof-Aufgaben – a typed or spoken list", () => {
  it("splits the dictation into tasks, sentence by sentence", () => {
    // How the dictation arrives: one sentence per phrase (lib/speech.ts).
    expect(
      splitTaskList(
        "Eier von den Hühnern einsammeln. Den Meerschweinchen Gras geben. Den Gänsen Nassfutter geben. Den Gänsen Trockenfutter geben. Die Teichpumpe kontrollieren. Mit dem Kescher die Federn aus dem Teich holen",
      ),
    ).toEqual([
      "Eier von den Hühnern einsammeln",
      "Den Meerschweinchen Gras geben",
      "Den Gänsen Nassfutter geben",
      "Den Gänsen Trockenfutter geben",
      "Die Teichpumpe kontrollieren",
      "Mit dem Kescher die Federn aus dem Teich holen",
    ]);
  });

  it("splits at commas, new lines and spoken words like dann – but not at a plain und", () => {
    expect(splitTaskList("Eier sammeln, dann Gänse füttern und dann Teich kontrollieren")).toEqual(["Eier sammeln", "Gänse füttern", "Teich kontrollieren"]);
    expect(splitTaskList("- Eier sammeln\n2. Pumpe prüfen\n\n")).toEqual(["Eier sammeln", "Pumpe prüfen"]);
    expect(splitTaskList("Nassfutter und Trockenfutter geben")).toEqual(["Nassfutter und Trockenfutter geben"]);
    expect(splitTaskList("eier sammeln. Eier sammeln")).toEqual(["Eier sammeln"]);
    expect(splitTaskList("  ")).toEqual([]);
    expect(splitTaskList("x".repeat(100))[0]).toHaveLength(80);
  });
});
