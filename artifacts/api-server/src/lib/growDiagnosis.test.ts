import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { coerceHealth, coerceTrichomes, tagebuchFacts, trichomeStage } = await import("./growDiagnosis");

describe("Grow-Check – health", () => {
  it("keeps the findings in shape and drops unknown categories", () => {
    const r = coerceHealth(
      {
        status: "problem",
        zusammenfassung: "Gelbe untere Blätter.",
        befunde: [
          { name: "Stickstoffmangel", kategorie: "deficiency", wahrscheinlich: true, anzeichen: "untere Blätter gelb", massnahmen: ["Wachstumsdünger", 5, ""] },
          { name: "Spinnmilben", kategorie: "insekt", wahrscheinlich: false },
          { kategorie: "pest" },
        ],
      },
      [],
    );
    expect(r).toEqual({
      status: "problem",
      summary: "Gelbe untere Blätter.",
      findings: [
        { name: "Stickstoffmangel", category: "deficiency", likely: true, signs: "untere Blätter gelb", actions: ["Wachstumsdünger"] },
        { name: "Spinnmilben", category: "other", likely: false, signs: null, actions: [] },
      ],
      facts: [],
    });
  });

  it("does not call it a problem without a likely finding, nor healthy against the Tagebuch", () => {
    expect(coerceHealth({ status: "problem", befunde: [{ name: "Thripse", kategorie: "pest", wahrscheinlich: false }] }, []).status).toBe("watch");
    expect(coerceHealth({ status: "healthy" }, ["pH 7,4 …"]).status).toBe("watch");
    expect(coerceHealth({ status: "healthy" }, [])).toMatchObject({ status: "healthy", summary: "Die Pflanze sieht gesund aus." });
    expect(coerceHealth({ status: "egal" }, []).status).toBe("watch");
  });

  it("compares the latest Tagebuch values with the plan", () => {
    const target = { ph: [6.2, 6.8] as [number, number], ec: [1.0, 1.6] as [number, number] };
    const facts = tagebuchFacts({ date: "2026-05-10", ph: 7.4, ec: 2.1 }, target, "2026-05-12");
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatch(/^pH 7,4 \(Tagebuch 10\.05\.\) liegt außerhalb des Ziels 6,2–6,8/);
    expect(facts[1]).toMatch(/^EC 2,1 liegt über dem Ziel 1–1,6 – Gefahr von Überdüngung/);
    expect(tagebuchFacts({ date: "2026-05-10", ph: 6.5, ec: 1.2 }, target, "2026-05-12")).toEqual([]);
    // Older than a week: no longer says anything about today.
    expect(tagebuchFacts({ date: "2026-05-01", ph: 7.4, ec: null }, target, "2026-05-12")).toEqual([]);
    expect(tagebuchFacts(null, target, "2026-05-12")).toEqual([]);
  });
});

describe("Grow-Check – trichomes", () => {
  it("sets the stage from the shares", () => {
    expect(trichomeStage(60, 40, 0)).toBe("early");
    expect(trichomeStage(10, 80, 10)).toBe("window");
    expect(trichomeStage(25, 70, 5)).toBe("early");
    expect(trichomeStage(0, 60, 40)).toBe("late");
  });

  it("scales the shares to 100 and ignores the model's opinion on the stage", () => {
    expect(coerceTrichomes({ sichtbar: true, klar: 5, milchig: 40, bernstein: 5, zusammenfassung: "Meist milchig.", stage: "late" })).toEqual({
      clear: 10,
      milky: 80,
      amber: 10,
      stage: "window",
      summary: "Meist milchig.",
      advice: expect.stringMatching(/^Erntefenster/),
    });
    expect(coerceTrichomes({ sichtbar: false, klar: 50 })).toBeNull();
    expect(coerceTrichomes({ klar: "x" })).toBeNull();
    expect(coerceTrichomes({ klar: 150, milchig: -3, bernstein: 0 })).toMatchObject({ clear: 100, milky: 0, amber: 0, stage: "early" });
  });
});
