import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { DUTIES, countOn, dutiesFor, reportMessage, yearlyItem } = await import("./farmDuties");
const { STATES, STATE_CODES, reportPushDays } = await import("./dutyStates");

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
      body: "Stand 1. Januar laut App: Hühner 1, Ziegen 1. Bitte bis 15.01. an Tierseuchenkasse und HI-Tier melden und in der App abhaken.",
    });
    expect(reportMessage([])).toBeNull();
  });
});

describe("Pflichten je Bundesland", () => {
  const hit = DUTIES.find((d) => d.key === "hit_report")!;

  it("has every Land with its Kasse, a stock day and a January deadline", () => {
    expect(STATE_CODES).toHaveLength(16);
    for (const code of STATE_CODES) {
      const s = STATES[code];
      expect(s.tsk, code).not.toBe("");
      expect([1, 3], code).toContain(s.stockDay);
      if (s.dueDay !== null) expect(s.dueDay - 13, code).toBeGreaterThan(s.stockDay - 1);
      if (s.url) expect(s.url, code).toMatch(/^https:\/\//);
    }
  });

  it("uses the Land's stock day and deadline for the Tierseuchenkasse, not for HI-Tier", () => {
    const sheep = [{ species: "sheep" as const, from: "2026-01-02", until: null }];
    // Niedersachsen counts on 3 January: an animal from 2 January counts, due by the 17th.
    expect(yearlyItem(tsk, sheep, new Map(), "2026-01-10", STATES.NI)).toMatchObject({ status: "due", dueOn: "2026-01-17", stock: { day: "2026-01-03", current: false } });
    expect(yearlyItem(tsk, sheep, new Map(), "2026-01-18", STATES.NI).status).toBe("overdue");
    // Before the stock day the animals now count.
    expect(yearlyItem(tsk, sheep, new Map(), "2026-01-02", STATES.NI)).toMatchObject({ status: "due", stock: { day: "2026-01-03", current: true } });
    expect(yearlyItem(tsk, goats, new Map(), "2026-01-10", STATES.NW).dueOn).toBe("2026-01-31");
    // In NRW (stock day 1 January) the sheep from 2 January are next year's.
    expect(yearlyItem(tsk, sheep, new Map(), "2026-01-10", STATES.NW)).toMatchObject({ status: "upcoming", dueOn: "2027-01-31" });
    expect(yearlyItem(hit, sheep, new Map(), "2026-01-10", STATES.NI)).toMatchObject({ status: "upcoming", dueOn: "2027-01-15" });
    // Without a checked deadline: mid-January.
    expect(yearlyItem(tsk, sheep, new Map(), "2026-10-19", STATES.HE)).toMatchObject({ status: "upcoming", dueOn: "2027-01-15", stock: { day: "2027-01-01" } });
  });

  it("names and links the Kasse, says what differs and leaves the other duties alone", () => {
    const by = dutiesFor(["goat"], goats, new Map(), "2026-10-19", false, "BY");
    expect(by.find((d) => d.key === "tsk_member")).toMatchObject({ link: { label: "Bayerische Tierseuchenkasse", url: "https://www.btsk.de" }, source: "Tiergesundheitsgesetz, Landesrecht Bayern" });
    expect(by.find((d) => d.key === "tsk_report")).toMatchObject({ source: "Tierseuchenkasse Bayern", dueOn: "2026-01-20" });
    expect(by.find((d) => d.key === "registration")).toMatchObject({ link: null, note: null });
    const he = dutiesFor(["goat"], goats, new Map(), "2026-10-19", false, "HE").find((d) => d.key === "tsk_report")!;
    expect(he.note).toBe("Die genaue Frist steht im Meldebogen der Kasse; die App rechnet mit dem 15. Januar.");
    expect(dutiesFor(["goat"], goats, new Map(), "2026-10-19").find((d) => d.key === "tsk_report")).toMatchObject({ link: null, note: null, source: "Tierseuchenkasse des Bundeslandes" });
  });

  it("pushes two weeks and three days before the deadline, each report with its own", () => {
    expect(reportPushDays(15)).toEqual([2, 12]);
    expect(reportPushDays(31)).toEqual([18, 28]);
    const nw = dutiesFor(["goat"], goats, new Map(), "2026-01-12", false, "NW").filter((d) => d.status === "due");
    expect(reportMessage(nw)!.body).toBe("Stand 1. Januar laut App: Hühner 1, Ziegen 1. Bitte bis 31.01. an Tierseuchenkasse NRW (Landwirtschaftskammer) und bis 15.01. an HI-Tier melden und in der App abhaken.");
  });
});
