import { describe, expect, it } from "vitest";
import { GARDEN_CATALOG, cropByKey } from "./gardenCatalog";

describe("Anbaudaten catalog", () => {
  it("has unique keys and only refers to crops it knows", () => {
    const keys = GARDEN_CATALOG.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of GARDEN_CATALOG) {
      for (const k of [...c.good, ...c.bad]) expect(cropByKey(k), `${c.key} → ${k}`).toBeDefined();
      expect(c.good, c.key).not.toContain(c.key);
      expect(c.bad, c.key).not.toContain(c.key);
    }
  });

  it("never calls a pair good and bad at the same time", () => {
    const conflicts: string[] = [];
    for (const a of GARDEN_CATALOG) {
      for (const k of a.good) {
        if (a.bad.includes(k)) conflicts.push(`${a.key}: ${k} good and bad`);
        if (cropByKey(k)!.bad.includes(a.key)) conflicts.push(`${a.key} likes ${k}, ${k} dislikes ${a.key}`);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("has plausible numbers", () => {
    for (const c of GARDEN_CATALOG) {
      expect(c.spacingCm, c.key).toBeGreaterThan(0);
      expect(c.rowSpacingCm, c.key).toBeGreaterThanOrEqual(c.spacingCm > 100 ? 100 : 10);
      for (const r of [c.sowIndoor, c.directSow, c.plantOut]) if (r) expect(r.from, c.key).toBeLessThanOrEqual(r.to);
      expect(c.sowIndoor ?? c.directSow ?? c.plantOut, c.key).not.toBeNull();
      expect(c.harvest.from >= 1 && c.harvest.from <= 12 && c.harvest.to >= 1 && c.harvest.to <= 12, c.key).toBe(true);
      expect(c.color, c.key).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
