import { describe, expect, it } from "vitest";
import { dutyBadge, openDuties, speciesCount, stockText } from "./duty-labels";

describe("duty labels", () => {
  it("names counts in singular and plural", () => {
    expect(speciesCount("goat", 1)).toBe("1 Ziege");
    expect(speciesCount("goat", 3)).toBe("3 Ziegen");
    expect(speciesCount("poultry", 12)).toBe("12 Hühner");
  });

  it("shows the state of a duty", () => {
    expect(dutyBadge({ status: "due", dueOn: "2027-01-15", doneOn: null, period: "2027" })!.label).toBe("Fällig bis 15.01.2027");
    expect(dutyBadge({ status: "overdue", dueOn: "2026-01-15", doneOn: null, period: "2026" })!.label).toBe("2026 noch nicht abgehakt");
    expect(dutyBadge({ status: "done", dueOn: null, doneOn: "2026-10-19", period: "once" })!.label).toBe("Erledigt am 19.10.2026");
    expect(dutyBadge({ status: "done", dueOn: "2026-01-15", doneOn: "2026-01-08", period: "2026" })!.label).toBe("2026 gemeldet");
    expect(dutyBadge({ status: "upcoming", dueOn: "2027-01-15", doneOn: null, period: "2027" })!.label).toBe("Stichtag 01.01.2027 · Frist 15.01.");
    expect(dutyBadge({ status: "upcoming", dueOn: "2027-01-17", doneOn: null, period: "2027", stock: { day: "2027-01-03", counts: [], current: true } })!.label).toBe("Stichtag 03.01.2027 · Frist 17.01.");
    expect(dutyBadge({ status: "info", dueOn: null, doneOn: null, period: null })).toBeNull();
  });

  it("counts what is open and words the stock", () => {
    const d = (status: string) => ({ status }) as never;
    expect(openDuties([d("open"), d("due"), d("overdue"), d("done"), d("upcoming"), d("info")])).toBe(3);
    expect(stockText({ day: "2026-01-01", current: false, counts: [{ species: "goat", count: 1 }, { species: "poultry", count: 12 }] })).toBe(
      "Stand 1. Januar 2026 laut App: 1 Ziege, 12 Hühner",
    );
    expect(stockText({ day: "2027-01-01", current: true, counts: [] })).toBe("Heute laut App: keine Tiere");
    // Niedersachsen, Thüringen, Mecklenburg-Vorpommern count on 3 January.
    expect(stockText({ day: "2026-01-03", current: false, counts: [{ species: "sheep", count: 4 }] })).toBe("Stand 3. Januar 2026 laut App: 4 Schafe");
  });
});
