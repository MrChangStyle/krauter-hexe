import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
});

const { cycleLines, cycleState, nextHeat } = await import("./breedingCycle");

describe("Brunstkalender – next heat", () => {
  it("adds whole cycles to the last heat, a heat still going on counts", () => {
    // Cow: 21 days, heat lasts a day.
    expect(nextHeat("cattle", "2026-03-01", "2026-03-10")).toBe("2026-03-22");
    expect(nextHeat("cattle", "2026-03-01", "2026-03-22")).toBe("2026-03-22");
    expect(nextHeat("cattle", "2026-03-01", "2026-03-23")).toBe("2026-04-12");
    // Mare: in heat for six days – on day 3 of the next heat it is still that one.
    expect(nextHeat("horse", "2026-05-01", "2026-05-24")).toBe("2026-05-22");
  });

  it("predicts nothing after three cycles, out of season or for species without a calendar", () => {
    expect(nextHeat("cattle", "2026-01-01", "2026-03-10")).toBeNull();
    // Goats come into heat from August to February.
    expect(nextHeat("goat", "2026-02-20", "2026-03-01")).toBeNull();
    expect(nextHeat("goat", "2026-10-01", "2026-10-05")).toBe("2026-10-22");
    expect(nextHeat("rabbit", "2026-10-01", "2026-10-05")).toBeNull();
  });
});

describe("Brunstkalender – where a female stands", () => {
  it("is pregnant until the due day", () => {
    expect(cycleState("goat", { dueOn: "2027-03-01", lastBirth: null, lastHeat: "2026-10-01" }, "2026-10-20")).toMatchObject({ status: "pregnant", until: "2027-03-01", nextHeat: null });
  });

  it("nurses until weaning, then rests until she may be mated again", () => {
    // Cow: weaning after 240 days, ready 60 days after calving – nursing wins.
    expect(cycleState("cattle", { dueOn: null, lastBirth: { endedOn: "2026-03-01", alive: 1 }, lastHeat: null }, "2026-04-01")).toMatchObject({ status: "nursing", until: "2026-10-27" });
    // Calf lost: resting until day 60.
    expect(cycleState("cattle", { dueOn: null, lastBirth: { endedOn: "2026-03-01", alive: 0 }, lastHeat: null }, "2026-04-01")).toMatchObject({ status: "resting", until: "2026-04-30" });
    // Sow: rauscht about five days after the piglets are weaned (35 days).
    expect(cycleState("pig", { dueOn: null, lastBirth: { endedOn: "2026-03-01", alive: 10 }, lastHeat: null }, "2026-04-07")).toMatchObject({ status: "resting", until: "2026-04-10" });
    expect(cycleState("pig", { dueOn: null, lastBirth: { endedOn: "2026-03-01", alive: 10 }, lastHeat: null }, "2026-04-10")).toMatchObject({ status: "open", until: null });
  });

  it("knows the season", () => {
    expect(cycleState("sheep", { dueOn: null, lastBirth: null, lastHeat: null }, "2026-05-01").inSeason).toBe(false);
    expect(cycleState("sheep", { dueOn: null, lastBirth: null, lastHeat: null }, "2026-09-01").inSeason).toBe(true);
    expect(cycleState("cattle", { dueOn: null, lastBirth: null, lastHeat: null }, "2026-05-01").inSeason).toBe(true);
  });
});

describe("Brunstkalender – push", () => {
  it("names heats expected tomorrow (not for pregnant ones) and weanings due today", () => {
    const animal = (name: string, status: "open" | "pregnant", nextHeat: string | null) => ({
      id: 1,
      name,
      species: "cattle" as const,
      status,
      until: null,
      lastHeat: null,
      nextHeat,
      inSeason: true,
      season: null,
      signs: "",
      heats: [],
    });
    const lines = cycleLines(
      {
        animals: [animal("Berta", "open", "2026-04-02"), animal("Liesel", "pregnant", "2026-04-02"), animal("Erna", "open", "2026-04-03")],
        weanings: [
          { recordId: 1, species: "goat", motherName: "Lotte", bornOn: "2026-01-07", alive: 2, weanOn: "2026-04-01", text: "Kitze absetzen." },
          { recordId: 2, species: "pig", motherName: null, bornOn: "2026-02-28", alive: 9, weanOn: "2026-04-04", text: "Ferkel absetzen." },
        ],
      },
      "2026-04-01",
    );
    expect(lines).toEqual(["Berta: Brunst ab morgen erwartet – beobachten.", "Lotte: Kitze absetzen."]);
  });
});
