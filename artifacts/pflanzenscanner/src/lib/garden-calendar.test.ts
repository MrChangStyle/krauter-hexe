import { describe, expect, it } from "vitest";
import type { BedPlanting, Crop, GardenCalendarEntry } from "@workspace/api-client-react";
import { dayRange, inMonth, rotationIssues, rotationText, seasonSummary, upcoming, yearSpan } from "./garden-calendar";

const crop = (key: string, family: string, feeder: Crop["feeder"]) => ({ key, family, feeder }) as Crop;
const crops = new Map([
  ["tomate", crop("tomate", "Nachtschattengewächse", "heavy")],
  ["kartoffel", crop("kartoffel", "Nachtschattengewächse", "heavy")],
  ["kohlrabi", crop("kohlrabi", "Kreuzblütler", "heavy")],
  ["bohne", crop("bohne", "Hülsenfrüchtler", "light")],
]);
const planting = (season: number, cropKey: string, label: string, x = 0, y = 0, w = 2, h = 2) =>
  ({ id: season * 10 + x, season, cropKey, plantId: null, label, x, y, w, h }) as BedPlanting;

describe("garden calendar", () => {
  it("formats and places date ranges", () => {
    expect(dayRange("2026-03-06", "2026-04-09")).toBe("6.3.–9.4.");
    expect(inMonth({ start: "2026-03-06", end: "2026-04-09" }, 2026, 4)).toBe(true);
    expect(inMonth({ start: "2026-03-06", end: "2026-04-09" }, 2026, 5)).toBe(false);
    const span = yearSpan("2026-07-01", "2026-12-31", 2026)!;
    expect(span.left).toBeCloseTo(181 / 365);
    expect(span.left + span.width).toBeCloseTo(1);
    expect(yearSpan("2026-10-01", "2027-03-31", 2026)!.left + yearSpan("2026-10-01", "2027-03-31", 2026)!.width).toBeCloseTo(1);
    expect(yearSpan("2027-01-01", "2027-03-31", 2026)).toBeNull();
  });

  it("splits open dates into now and soon", () => {
    const e = (start: string, end: string, open = true) => ({ start, end, open }) as GardenCalendarEntry;
    const list = [e("2026-05-01", "2026-05-30"), e("2026-05-20", "2026-06-10"), e("2026-05-01", "2026-05-30", false), e("2026-07-01", "2026-07-30")];
    const { now, soon } = upcoming(list, "2026-05-15");
    expect(now).toEqual([list[0]]);
    expect(soon).toEqual([list[1]]);
  });
});

describe("crop rotation", () => {
  const history = [planting(2025, "kartoffel", "Kartoffel"), planting(2024, "kohlrabi", "Kohlrabi", 2), planting(2022, "tomate", "Tomate", 4)];

  it("warns about the same family on the same cells within three years", () => {
    expect(rotationIssues({ x: 1, y: 1, w: 2, h: 2 }, crops.get("tomate")!, 2026, history, crops)).toEqual([
      { kind: "family", season: 2025, label: "Kartoffel", family: "Nachtschattengewächse" },
    ]);
    // Other cells, or four years ago: fine.
    expect(rotationIssues({ x: 4, y: 0, w: 2, h: 2 }, crops.get("tomate")!, 2026, history, crops)).toEqual([]);
  });

  it("warns about a heavy feeder after a heavy feeder", () => {
    const issues = rotationIssues({ x: 0, y: 0, w: 2, h: 2 }, crops.get("kohlrabi")!, 2026, history, crops);
    expect(issues.map((i) => [i.kind, i.season])).toEqual([["heavy", 2025]]);
    expect(rotationText(issues[0]!)).toMatch(/Starkzehrer nach Starkzehrer/);
    // Beans after potatoes are fine.
    expect(rotationIssues({ x: 0, y: 0, w: 2, h: 2 }, crops.get("bohne")!, 2026, history, crops)).toEqual([]);
  });

  it("sums up the last seasons", () => {
    expect(seasonSummary(history, crops, 2026)).toEqual([
      { season: 2025, labels: ["Kartoffel"], families: ["Nachtschattengewächse"] },
      { season: 2024, labels: ["Kohlrabi"], families: ["Kreuzblütler"] },
      { season: 2023, labels: [], families: [] },
    ]);
  });
});
