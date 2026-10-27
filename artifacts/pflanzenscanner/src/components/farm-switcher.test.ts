import { describe, expect, it } from "vitest";
import type { FarmSummary } from "@workspace/api-client-react";
import { farmLine, groupFarms } from "@/components/farm-switcher";

const farm = (id: number, role: FarmSummary["role"], extra: Partial<FarmSummary> = {}): FarmSummary => ({ id, name: `Hof ${id}`, role, modules: null, ...extra });

describe("Wähle deine Farm", () => {
  it("groups own farms, the Demo-Hof and the linked farms, each in its order", () => {
    const g = groupFarms([farm(1, "caretaker"), farm(2, "admin"), farm(3, "guest"), farm(4, "admin"), farm(5, "admin")], 4);
    expect(g.own.map((f) => f.id)).toEqual([2, 5]);
    expect(g.demo.map((f) => f.id)).toEqual([4]);
    expect(g.shared.map((f) => f.id)).toEqual([1, 3]);
  });

  it("names whose a farm is", () => {
    expect(farmLine(farm(1, "admin"), null)).toBe("Mein Hof");
    expect(farmLine(farm(1, "admin"), 1)).toBe("Beispieldaten");
    expect(farmLine(farm(2, "caretaker", { ownerName: "Stefan" }), null)).toBe("Geteilt von Stefan · Mitarbeiter");
    expect(farmLine(farm(2, "caretaker", { ownerName: "Stefan", accessUntil: "2026-11-01" }), null)).toBe("Vertretung von Stefan · Mitarbeiter");
  });
});
