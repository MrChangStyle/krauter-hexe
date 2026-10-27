import { describe, expect, it } from "vitest";
import type { FarmTask } from "@workspace/api-client-react";
import { dayLabel, hofToday, needsPlan, overdueText, planLocally, scheduleText, splitTaskList, taskTitle } from "@/lib/hof-tasks";

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

describe("KI-Aufgabenplan – without the AI", () => {
  const today = "2026-10-27"; // a Tuesday
  const team = [
    { userId: "u-stefan", displayName: "Stefan Huber" },
    { userId: "u-maria", displayName: "Maria Huber" },
  ];
  const none = { assigneeId: null, repeats: false };

  it("reads day, repetition, time and person, and carries a day said once", () => {
    const plan = planLocally("Heute Eier einsammeln. Gänse füttern jeden Tag um 7 Uhr. Morgen für Maria die Blumen gießen", today, team, none);
    expect(plan.map((p) => [p.title, p.startsOn, p.repeats, p.intervalUnit, p.reminderTime, p.assigneeName, p.area])).toEqual([
      ["Eier einsammeln", "2026-10-27", false, "Tage", "08:00", null, "tiere"],
      ["Gänse füttern", "2026-10-27", true, "Tage", "07:00", null, "tiere"],
      ["Die Blumen gießen", "2026-10-28", false, "Tage", "08:00", "Maria Huber", "garten"],
    ]);
  });

  it("applies what is said for everything, and knows weekdays and intervals", () => {
    const plan = planLocally("Eier einsammeln, Teichpumpe prüfen, das Ganze ist für übermorgen", today, team, none);
    expect(plan.map((p) => p.startsOn)).toEqual(["2026-10-29", "2026-10-29"]);
    const [a, b, c] = planLocally("Stall ausmisten jeden Freitag. Rasen mähen alle zwei Wochen. Am Montag abends Holz holen", today, team, none);
    expect(a).toMatchObject({ title: "Stall ausmisten", startsOn: "2026-10-30", repeats: true, intervalValue: 1, intervalUnit: "Wochen" });
    expect(b).toMatchObject({ title: "Rasen mähen", repeats: true, intervalValue: 2, intervalUnit: "Wochen" });
    expect(c).toMatchObject({ title: "Holz holen", startsOn: "2026-11-02", reminderTime: "18:00", repeats: false });
  });

  it("uses the quick entry's choice where nothing is said; 'für alle' and 'einmalig' win", () => {
    const [a, b] = planLocally("Eier einsammeln. Einmalig für alle Holz holen", today, team, { assigneeId: "u-maria", repeats: true });
    expect(a).toMatchObject({ assigneeId: "u-maria", repeats: true });
    expect(b).toMatchObject({ title: "Holz holen", assigneeId: null, repeats: false });
  });

  it("sends only plain single tasks straight to the list", () => {
    expect(needsPlan("Eier einsammeln")).toBe(false);
    expect(needsPlan("Teichpumpe kontrollieren")).toBe(false);
    expect(needsPlan("Eier einsammeln, Gänse füttern")).toBe(true);
    expect(needsPlan("Morgen Eier einsammeln")).toBe(true);
    expect(needsPlan("Heute müssen die Eier eingesammelt werden und die Gänse gefüttert werden")).toBe(true);
    expect(dayLabel("2026-10-27", today)).toBe("heute");
    expect(dayLabel("2026-10-28", today)).toBe("morgen");
    expect(dayLabel("2026-10-30", today)).toBe("Fr., 30.10.");
  });
});
