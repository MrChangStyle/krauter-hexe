/** KI-Aufgabenplan (docs/hof-aufgaben.md): the AI's answer, coerced into tasks. */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { coercePlan, planPrompt, MAX_PLANNED } = await import("./hofTaskPlanner");

const ctx = {
  today: "2026-10-27",
  team: [
    { userId: "u-stefan", name: "Stefan Huber" },
    { userId: "u-maria", name: "Maria Huber" },
  ],
  herds: [{ id: 7, name: "Gänse" }],
  defaults: { assigneeId: null, repeats: false },
};

describe("KI-Aufgabenplan – coercing the answer", () => {
  it("turns the spoken list into tasks with day, repetition, time and person", () => {
    const tasks = coercePlan(
      {
        aufgaben: [
          { titel: "Eier einsammeln", bereich: "tiere", tag: "2026-10-27", wiederholung: null, uhrzeit: "17:00", fuer: "Maria", gruppe: null },
          { titel: "Gänse füttern", bereich: "tiere", tag: "2026-10-28", wiederholung: { alle: 1, einheit: "Tage" }, uhrzeit: null, fuer: null, gruppe: "gänse" },
          { titel: "Blumen gießen.", bereich: "garten", tag: null, wiederholung: "einmalig", uhrzeit: null, fuer: "stefan", gruppe: "Gänse" },
        ],
      },
      ctx,
    );
    expect(tasks).toEqual([
      { title: "Eier einsammeln", area: "tiere", startsOn: "2026-10-27", repeats: false, intervalValue: 1, intervalUnit: "Tage", reminderTime: "17:00", assigneeId: "u-maria", assigneeName: "Maria Huber", herdId: null, herdName: null },
      { title: "Gänse füttern", area: "tiere", startsOn: "2026-10-28", repeats: true, intervalValue: 1, intervalUnit: "Tage", reminderTime: "08:00", assigneeId: null, assigneeName: null, herdId: 7, herdName: "Gänse" },
      // A group only for animals; the dot goes.
      { title: "Blumen gießen", area: "garten", startsOn: "2026-10-27", repeats: false, intervalValue: 1, intervalUnit: "Tage", reminderTime: "08:00", assigneeId: "u-stefan", assigneeName: "Stefan Huber", herdId: null, herdName: null },
    ]);
  });

  it("uses the quick entry's choice where the text says nothing – but 'für alle' and 'einmalig' win", () => {
    const withDefaults = { ...ctx, defaults: { assigneeId: "u-maria", repeats: true } };
    const [a, b, c] = coercePlan(
      {
        aufgaben: [
          { titel: "Teichpumpe kontrollieren" },
          { titel: "Holz holen", fuer: "alle", wiederholung: "einmalig" },
          { titel: "Stall fegen", wiederholung: { alle: 2, einheit: "Wochen" } },
        ],
      },
      withDefaults,
    );
    expect(a).toMatchObject({ area: "hof", repeats: true, intervalValue: 1, intervalUnit: "Tage", assigneeId: "u-maria", startsOn: "2026-10-27" });
    expect(b).toMatchObject({ repeats: false, assigneeId: null });
    expect(c).toMatchObject({ area: "tiere", repeats: true, intervalValue: 2, intervalUnit: "Wochen" });
  });

  it("does not trust the model: bad days, times, units, people and duplicates are cleaned up", () => {
    const tasks = coercePlan(
      {
        aufgaben: [
          { titel: "eier einsammeln", tag: "2026-10-20", uhrzeit: "25:00", fuer: "Bert", bereich: "keller" },
          { titel: "Eier einsammeln" },
          { titel: "x" },
          null,
          "Gänse füttern",
          { titel: "Gänse füttern", tag: "2026-02-30", wiederholung: { alle: 0, einheit: "Jahre" } },
          { titel: "Zaun prüfen", tag: "2030-01-01" },
          { titel: "a".repeat(120) },
        ],
      },
      ctx,
    );
    expect(tasks.map((t) => t.title)).toEqual(["Eier einsammeln", "Gänse füttern", "Zaun prüfen", "A" + "a".repeat(79)]);
    expect(tasks[0]).toMatchObject({ startsOn: "2026-10-27", reminderTime: "08:00", assigneeId: null, area: "tiere" });
    expect(tasks[1]).toMatchObject({ startsOn: "2026-10-27", repeats: false });
    // More than a year ahead → today.
    expect(tasks[2]!.startsOn).toBe("2026-10-27");
    expect(coercePlan(null, ctx)).toEqual([]);
    expect(coercePlan({ aufgaben: "nein" }, ctx)).toEqual([]);
  });

  it("takes at most 20 tasks", () => {
    const many = { aufgaben: Array.from({ length: 30 }, (_, i) => ({ titel: `Aufgabe ${i}` })) };
    expect(coercePlan(many, ctx)).toHaveLength(MAX_PLANNED);
  });

  it("tells the model the dates, the team and the groups", () => {
    const prompt = planPrompt("Heute Eier einsammeln", ctx);
    expect(prompt).toContain("Heute ist 2026-10-27 (Dienstag). Morgen: 2026-10-28 (Mittwoch).");
    expect(prompt).toContain("Team: Stefan Huber, Maria Huber.");
    expect(prompt).toContain("Tiergruppen auf dem Hof: Gänse.");
    expect(prompt).toContain('"""Heute Eier einsammeln"""');
  });
});
