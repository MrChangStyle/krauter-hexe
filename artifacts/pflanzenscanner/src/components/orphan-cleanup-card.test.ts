import { describe, expect, it } from "vitest";
import { describeOrphans } from "@/components/orphan-cleanup-card";

describe("describeOrphans", () => {
  it("lists only tables with leftovers, in German", () => {
    expect(
      describeOrphans({ favorites: 3, tasks: 0, plants: 2, scan_attempts: 1 }),
    ).toEqual([
      "Favoriten: 3",
      "Pflanzen im Archiv (nur Bezug entfernt): 2",
      "Scan-Zähler: 1",
    ]);
  });

  it("falls back to the table name for a table it does not know yet", () => {
    expect(describeOrphans({ farm_animals: 4 })).toEqual(["farm_animals: 4"]);
  });

  it("returns nothing when everything is clean", () => {
    expect(describeOrphans({ favorites: 0, plants: 0 })).toEqual([]);
  });
});
