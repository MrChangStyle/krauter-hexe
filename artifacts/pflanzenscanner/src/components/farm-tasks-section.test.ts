import { describe, expect, it } from "vitest";
import type { FarmTask } from "@workspace/api-client-react";
import { dueText, intervalText, sortTasks } from "@/components/farm-tasks-section";

const t = (id: number, over: Partial<FarmTask>): FarmTask => ({
  id,
  animalId: null,
  animalName: null,
  herdId: null,
  herdName: null,
  actionType: "Füttern",
  notes: null,
  intervalValue: 1,
  intervalUnit: "Tage",
  reminderTime: "07:00",
  isActive: true,
  lastCompletedAt: null,
  createdAt: "2026-10-01T05:00:00Z",
  dueDate: "2026-10-18",
  isDue: true,
  ...over,
});

describe("stall task texts", () => {
  it("speaks the interval", () => {
    expect(intervalText(1, "Tage")).toBe("jeden Tag");
    expect(intervalText(1, "Wochen")).toBe("jede Woche");
    expect(intervalText(3, "Monate")).toBe("alle 3 Monate");
  });

  it("says when it is due", () => {
    expect(dueText({ dueDate: "2026-10-18", isDue: true }, "2026-10-18")).toBe("heute fällig");
    expect(dueText({ dueDate: "2026-10-15", isDue: true }, "2026-10-18")).toBe("überfällig seit 15.10.2026");
    expect(dueText({ dueDate: "2026-10-20", isDue: false }, "2026-10-18")).toBe("nächstes Mal am 20.10.2026");
  });

  it("lists due tasks first and paused ones last", () => {
    const sorted = sortTasks([
      t(1, { isDue: false, dueDate: "2026-10-19" }),
      t(2, { isActive: false }),
      t(3, { reminderTime: "18:00" }),
      t(4, {}),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([4, 3, 1, 2]);
  });
});
