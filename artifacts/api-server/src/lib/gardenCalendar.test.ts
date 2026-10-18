import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { cropEvents, digestMessage, frostTender, stillOpen } = await import("./gardenCalendar");
const { cropByKey } = await import("./gardenCatalog");

const tomate = cropByKey("tomate")!;
const gurke = cropByKey("gurke")!;

describe("garden calendar from the crop data", () => {
  it("counts weeks from the bed's last frost", () => {
    expect(cropEvents(tomate, "05-15", 2026)).toEqual([
      { kind: "sow_indoor", start: "2026-03-06", end: "2026-04-09" },
      { kind: "plant_out", start: "2026-05-15", end: "2026-06-11" },
      { kind: "harvest", start: "2026-07-01", end: "2026-10-31" },
    ]);
    // A later frost moves everything with it.
    expect(cropEvents(tomate, "05-29", 2026)[1]).toEqual({ kind: "plant_out", start: "2026-05-29", end: "2026-06-25" });
  });

  it("lets a winter harvest run into the next year", () => {
    const winter = { ...gurke, sowIndoor: null, plantOut: null, directSow: { from: 12, to: 14 }, harvest: { from: 10, to: 3 } };
    expect(cropEvents(winter, "04-20", 2026).at(-1)).toEqual({ kind: "harvest", start: "2026-10-01", end: "2027-03-31" });
  });

  it("drops the other way of sowing once one is ticked off", () => {
    expect(stillOpen("direct_sow", new Set())).toBe(true);
    expect(stillOpen("direct_sow", new Set(["sow_indoor"]))).toBe(false);
    expect(stillOpen("sow_indoor", new Set(["direct_sow"]))).toBe(false);
    expect(stillOpen("plant_out", new Set(["direct_sow"]))).toBe(false);
    expect(stillOpen("plant_out", new Set(["sow_indoor"]))).toBe(true);
    expect(stillOpen("harvest", new Set(["harvest"]))).toBe(false);
  });

  it("knows when frost-tender plants are outside", () => {
    const events = cropEvents(tomate, "05-15", 2026);
    expect(frostTender(tomate, events, new Set(), "2026-05-01")).toBe(false);
    expect(frostTender(tomate, events, new Set(["plant_out"]), "2026-05-01")).toBe(true);
    expect(frostTender(tomate, events, new Set(), "2026-05-20")).toBe(true);
    expect(frostTender(tomate, events, new Set(["harvest"]), "2026-05-20")).toBe(false);
    expect(frostTender(tomate, events, new Set(), "2026-11-02")).toBe(false);
    const kohlrabi = cropByKey("kohlrabi")!;
    expect(frostTender(kohlrabi, cropEvents(kohlrabi, "05-15", 2026), new Set(), "2026-05-20")).toBe(false);
  });

  it("writes one short push", () => {
    expect(digestMessage([], [])).toBeNull();
    expect(digestMessage([{ label: "Gurke", kind: "direct_sow" }, { label: "Gurke", kind: "direct_sow" }], [])).toEqual({
      title: "Heute im Garten",
      body: "Ab heute: Gurke säen.",
    });
    const frost = [{ bedId: 1, bedName: "Hochbeet", night: "2026-05-20", minTemp: -1.5, plants: ["Tomate", "Basilikum"] }];
    expect(digestMessage([], frost)).toEqual({
      title: "Frostwarnung für deinen Garten",
      body: "Frost bis −1,5 °C heute Nacht – Tomate, Basilikum im Beet „Hochbeet“ schützen.",
    });
    expect(digestMessage([], [{ ...frost[0]!, minTemp: 1 }])!.body).toMatch(/^Bodenfrost möglich \(1 °C\)/);
    const many = ["A", "B", "C", "D", "E", "F"].map((label) => ({ label, kind: "harvest" as const }));
    expect(digestMessage(many, [])!.body).toBe("Ab heute: A ernten, B ernten, C ernten, D ernten und 2 mehr.");
  });
});
