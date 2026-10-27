import { describe, expect, it } from "vitest";
import type { FarmSummary } from "@workspace/api-client-react";
import { sortFarms } from "@/components/farm-switcher";

const farm = (id: number, role: FarmSummary["role"]): FarmSummary => ({ id, name: `Hof ${id}`, role, modules: null });

describe("Hof wählen", () => {
  it("puts the own farms first, then the shared ones in their order", () => {
    expect(sortFarms([farm(1, "caretaker"), farm(2, "admin"), farm(3, "guest"), farm(4, "admin")]).map((f) => f.id)).toEqual([2, 4, 1, 3]);
  });
});
