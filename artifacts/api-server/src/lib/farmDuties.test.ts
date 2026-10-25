import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { DUTIES, countOn, dutiesFor, reportMessage, yearlyItem } = await import("./farmDuties");

const goats = [
  { species: "goat" as const, from: "2025-05-01", until: null },
  { species: "goat" as const, from: "2025-05-01", until: "2025-12-20" },
  { species: "goat" as const, from: "2026-03-01", until: null },
  { species: "poultry" as const, from: "2025-06-01", until: null },
  { species: "dog" as const, from: "2024-01-01", until: null },
];
const tsk = DUTIES.find((d) => d.key === "tsk_report")!;

describe("Pflichten – catalog", () => {
  it("has unique keys and a text and source for every duty", () => {
    expect(new Set(DUTIES.map((d) => d.key)).size).toBe(DUTIES.length);
    for (const d of DUTIES) {
      expect(d.text.length, d.key).toBeGreaterThan(40);
      expect(d.source, d.key).not.toBe("");
      expect(d.species.length > 0 || d.bees === true, d.key).toBe(true);
    }
  });

  it("shows only the duties of the species on the farm", () => {
    const keys = (species: Parameters<typeof dutiesFor>[0]) => dutiesFor(species, [], new Map(), "2026-10-19").map((d) => d.key);
    expect(keys(["guineaPig"])).toEqual([]);
    expect(keys(["rabbit"])).toEqual(["catering_waste", "rabbit_vaccination"]);
    expect(keys(["poultry"])).toEqual(expect.arrayContaining(["registration", "tsk_member", "tsk_report", "nd_vaccination", "avian_flu"]));
    expect(keys(["poultry"])).not.toContain("hit_report");
    expect(keys(["goat"])).toContain("hit_report");
    // Only the farm's own species are named on a duty.
    expect(dutiesFor(["goat", "dog"], [], new Map(), "2026-10-19").find((d) => d.key === "registration")!.species).toEqual(["goat"]);
  });

  it("adds the bee duties only for farms with colonies", () => {
    const bees = ["bee_registration", "bee_tsk", "bee_varroa", "bee_moving"];
    expect(dutiesFor([], [], new Map(), "2026-10-19", true).map((d) => d.key)).toEqual(bees);
    expect(dutiesFor(["goat"], [], new Map(), "2026-10-19").map((d) => d.key)).not.toContain("bee_varroa");
    expect(dutiesFor(["goat"], [], new Map(), "2026-10-19", true).map((d) => d.key)).toEqual(expect.arrayContaining(["hit_report", ...bees]));
    expect(dutiesFor([], [], new Map(), "2026-10-19", true).find((d) => d.key === "bee_registration")).toMatchObject({ status: "open", species: [] });
  });
});

describe("Pflichten – stock on 1 January", () => {
  it("counts the animals entered by then and not yet archived", () => {
    expect(countOn(goats, ["goat", "poultry"], "2026-01-01")).toEqual([
      { species: "goat", count: 1 },
      { species: "poultry", count: 1 },
    ]);
    expect(countOn(goats, ["goat"], "2026-10-19")).toEqual([{ species: "goat", count: 2 }]);
    expect(countOn(goats, ["pig"], "2026-10-19")).toEqual([]);
  });

  it("is due until 15 January, then overdue, and done once ticked", () => {
    expect(yearlyItem(tsk, goats, new Map(), "2026-01-05")).toMatchObject({ status: "due", period: "2026", dueOn: "2026-01-15" });
    expect(yearlyItem(tsk, goats, new Map(), "2026-01-15").status).toBe("due");
    expect(yearlyItem(tsk, goats, new Map(), "2026-01-16").status).toBe("overdue");
    const done = yearlyItem(tsk, goats, new Map([["tsk_report:2026", "2026-01-08"]]), "2026-10-19");
    expect(done).toMatchObject({ status: "done", doneOn: "2026-01-08", stock: { day: "2026-01-01", current: false } });
  });

  it("is about next year when the farm had no such animals on 1 January", () => {
    const newFarm = [{ species: "sheep" as const, from: "2026-04-01", until: null }];
    expect(yearlyItem(tsk, newFarm, new Map(), "2026-10-19")).toEqual({
      status: "upcoming",
      period: "2027",
      doneOn: null,
      dueOn: "2027-01-15",
      stock: { day: "2027-01-01", counts: [{ species: "sheep", count: 1 }], current: true },
    });
  });
});

describe("Pflichten – push", () => {
  it("names the counted animals, where to report and the deadline", () => {
    const open = dutiesFor(["goat", "poultry"], goats, new Map(), "2026-01-02").filter((d) => d.status === "due");
    expect(open.map((d) => d.key)).toEqual(["tsk_report", "hit_report"]);
    expect(reportMessage(open)).toEqual({
      title: "Bestandsmeldung fällig",
      body: "Stand 1. Januar laut App: Geflügel 1, Ziegen 1. Bitte bis 15.01. an Tierseuchenkasse und HI-Tier melden und in der App abhaken.",
    });
    expect(reportMessage([])).toBeNull();
  });
});
