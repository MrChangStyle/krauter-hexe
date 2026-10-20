import { describe, expect, it } from "vitest";
import { KNOWLEDGE } from "./grow-knowledge";
import { LEGAL_POINTS, LEGAL_SOURCES } from "./grow-legal";
import { dayText, defaultFlowerWeeks, rangeText } from "./grow-labels";

describe("grow labels", () => {
  it("formats ranges and days", () => {
    expect(rangeText([6.2, 6.8])).toBe("6,2–6,8");
    expect(rangeText([22, 26], "°C")).toBe("22–26 °C");
    expect(rangeText(null)).toBeNull();
    expect(dayText(32)).toBe("Tag 32 · Woche 5");
    expect(defaultFlowerWeeks("sativa", "photo")).toBe(11);
    expect(defaultFlowerWeeks("indica", "auto")).toBe(7);
  });

  it("has a guide with unique sections and legal points with sources", () => {
    expect(new Set(KNOWLEDGE.map((s) => s.id)).size).toBe(KNOWLEDGE.length);
    for (const s of KNOWLEDGE) expect(s.points.length, s.id).toBeGreaterThan(1);
    for (const p of LEGAL_POINTS) expect(p.ref, p.title).not.toBe("");
    for (const s of LEGAL_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });
});
