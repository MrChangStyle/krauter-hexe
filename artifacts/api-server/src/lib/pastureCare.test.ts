import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { careHints, hayWeather, mowPlan, mowPushLine, parasiteHint } = await import("./pastureCare");
const { pushLines } = await import("./pasture");
type G = Parameters<typeof parasiteHint>[3][number];
type C = Parameters<typeof mowPlan>[3][number];

let id = 0;
const g = (startOn: string, endOn: string | null, o: Partial<G> = {}): G => ({ id: ++id, pastureId: 1, label: "Ziegen", species: "goat", startOn, endOn, ...o });
const cut = (cutOn: string, o: Partial<C> = {}): C => ({ id: ++id, pastureId: 1, cutOn, bales: null, notes: null, ...o });
const day = (date: string, precipitationMm: number) => ({ date, minTemp: 10, maxTemp: 22, precipitationMm, maxGustKmh: 20, icon: "sun" as const });

describe("mowPlan", () => {
  it("has no plan for plain pastures and paddocks", () => {
    expect(mowPlan("pasture", 1, [], [], "2026-06-01")).toBeNull();
    expect(mowPlan("paddock", 1, [], [], "2026-06-01")).toBeNull();
  });

  it("starts in mid-May for a Mähweide and mid-June for a Wiese", () => {
    expect(mowPlan("mowing", 1, [], [], "2026-04-01")).toEqual({ nextCutOn: "2026-05-15", cutsThisYear: 0, lastCutOn: null });
    expect(mowPlan("meadow", 1, [], [], "2026-04-01")!.nextCutOn).toBe("2026-06-15");
  });

  it("counts the regrowth from the last cut or the last grazing, whichever is later", () => {
    expect(mowPlan("mowing", 1, [], [cut("2026-05-20"), cut("2025-08-01")], "2026-06-01")).toEqual({ nextCutOn: "2026-07-01", cutsThisYear: 1, lastCutOn: "2026-05-20" });
    expect(mowPlan("mowing", 1, [g("2026-06-01", "2026-06-10")], [cut("2026-05-20")], "2026-06-20")!.nextCutOn).toBe("2026-07-22");
    // Another pasture's cut does not count.
    expect(mowPlan("mowing", 1, [], [cut("2026-05-20", { pastureId: 2 })], "2026-06-01")!.nextCutOn).toBe("2026-05-15");
  });

  it("waits for next year after September", () => {
    expect(mowPlan("meadow", 1, [], [cut("2026-08-20")], "2026-09-01")!.nextCutOn).toBe("2027-06-15");
    // Nothing cut all year: no cut is due in October any more.
    expect(mowPlan("mowing", 1, [], [], "2026-10-25")!.nextCutOn).toBe("2027-05-15");
    expect(mowPlan("mowing", 1, [], [], "2026-09-30")!.nextCutOn).toBe("2026-05-15");
  });
});

describe("hayWeather", () => {
  it("finds three dry days in a row", () => {
    expect(hayWeather([])).toBeUndefined();
    expect(hayWeather([day("2026-06-01", 0), day("2026-06-02", 0), day("2026-06-03", 0)])).toBe("2026-06-01");
    expect(hayWeather([day("2026-06-01", 4), day("2026-06-02", 0.5), day("2026-06-03", 0), day("2026-06-04", 0)])).toBe("2026-06-02");
    expect(hayWeather([day("2026-06-01", 0), day("2026-06-02", 0), day("2026-06-03", 2), day("2026-06-04", 0)])).toBeNull();
  });
});

describe("Schnitt hints", () => {
  const meadow = { id: 1, name: "Talwiese", kind: "meadow" as const };

  it("says when a cut is due, with the hay weather, urgent three weeks late", () => {
    expect(careHints(meadow, null, [], [], "2026-06-14")).toEqual([]);
    expect(careHints(meadow, null, [], [], "2026-06-15")).toEqual([{ kind: "mow", pastureId: 1, urgent: false, text: "Talwiese: 1. Schnitt fällig (Richtwert ab 15.06.)." }]);
    const dry = [day("2026-06-20", 3), day("2026-06-21", 0), day("2026-06-22", 0), day("2026-06-23", 0)];
    expect(careHints(meadow, null, [], [], "2026-06-20", dry)[0]!.text).toBe("Talwiese: 1. Schnitt fällig (Richtwert ab 15.06.). Heuwetter: ab 21.06. 3 trockene Tage.");
    const wet = [day("2026-07-06", 3), day("2026-07-07", 5), day("2026-07-08", 0)];
    expect(careHints(meadow, null, [], [], "2026-07-06", wet)[0]).toMatchObject({
      urgent: true,
      text: "Talwiese: 1. Schnitt fällig (Richtwert ab 15.06.) – das Gras wird jetzt holzig. In den nächsten Tagen keine 3 trockenen Tage am Stück – fürs Heu abwarten, für Silage reicht ein trockener Tag.",
    });
    expect(careHints(meadow, null, [], [cut("2026-06-16")], "2026-06-20")).toEqual([]);
  });

  it("does not ask for a cut while a herd grazes", () => {
    const now = g("2026-06-10", null, { species: "cattle", label: "Rinder" });
    expect(careHints({ ...meadow, kind: "mowing" }, now, [now], [], "2026-06-20")).toEqual([]);
    expect(mowPushLine({ ...meadow, kind: "mowing" }, true, [now], [], "2026-05-15")).toBeNull();
  });

  it("pushes on the day the cut comes due", () => {
    const facts = { ...meadow, restDays: 35, maxGrazeDays: 10, areaHa: 1 };
    expect(pushLines([facts], [], "2026-06-15", [])).toEqual(["Talwiese: Schnitt fällig"]);
    expect(pushLines([facts], [], "2026-06-16", [])).toEqual([]);
    expect(pushLines([facts], [], "2026-08-10", [{ id: 1, pastureId: 1, cutOn: "2026-06-15", bales: 12, notes: null }])).toEqual(["Talwiese: Schnitt fällig"]);
  });
});

describe("parasiteHint", () => {
  it("warns when the same kind of animals stood here within the guide value", () => {
    const before = g("2026-04-20", "2026-05-01");
    const now = g("2026-06-01", null);
    expect(parasiteHint("Hang", 1, now, [before, now])).toEqual({
      kind: "parasite",
      pastureId: 1,
      urgent: false,
      text: "Auf Hang standen Ziegen schon bis 01.05. – Larven von Magen-Darm-Würmern (u. a. Roter Magenwurm) können noch im Gras sein. Kotprobe in 3–4 Wochen; besser Wechselweide mit Rindern oder Pferden, oder nach dem Abtreiben nachmähen.",
    });
  });

  it("knows goats and sheep share their worms, and adds the late summer", () => {
    const before = g("2026-06-01", "2026-06-10", { species: "sheep", label: "Schafe Nord" });
    const now = g("2026-08-01", null);
    expect(parasiteHint("Hang", 1, now, [before, now])!.text).toMatch(/^Auf Hang standen Schafe \(Schafe Nord\) schon bis 10\.06\. – .* Im Spätsommer ist der Wurmdruck am höchsten\.$/);
  });

  it("stays quiet after a long rest, for other species, other pastures and unknown animals", () => {
    const now = g("2026-08-01", null);
    expect(parasiteHint("Hang", 1, now, [g("2026-03-01", "2026-04-30"), now])).toBeNull();
    expect(parasiteHint("Hang", 1, now, [g("2026-07-01", "2026-07-10", { species: "cattle" }), now])).toBeNull();
    expect(parasiteHint("Hang", 1, now, [g("2026-07-01", "2026-07-10", { pastureId: 2 }), now])).toBeNull();
    expect(parasiteHint("Hang", 1, now, [g("2026-07-01", "2026-07-10", { species: null }), now])).toBeNull();
    const other = g("2026-08-01", null, { species: null, label: "Pferde vom Nachbarn" });
    expect(parasiteHint("Hang", 1, other, [g("2026-07-01", "2026-07-10"), other])).toBeNull();
    expect(parasiteHint("Hang", 1, null, [])).toBeNull();
  });

  it("gives pig worm eggs a whole year", () => {
    const now = g("2026-08-01", null, { species: "pig", label: "Schweine" });
    expect(parasiteHint("Auslauf", 1, now, [g("2025-10-01", "2025-11-30", { species: "pig", label: "Schweine" }), now])!.text).toContain("Spulwurm-Eier");
  });
});
