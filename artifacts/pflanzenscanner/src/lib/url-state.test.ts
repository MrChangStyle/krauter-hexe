import { describe, expect, it } from "vitest";
import { buildSearchString, canonicaliseSymptoms, parseUrlState } from "@/lib/url-state";

// ---------------------------------------------------------------------------
// buildSearchString
// ---------------------------------------------------------------------------

describe("buildSearchString", () => {
  it("encodes commas inside symptom names as %2C", () => {
    const result = buildSearchString(
      "human",
      new Set(["Husten, Schnupfen"]),
      "",
    );
    const p = new URLSearchParams(result);
    // The raw symptoms value must not contain a plain comma inside the name
    expect(p.get("symptoms")).toBe("Husten%2C%20Schnupfen");
  });

  it("uses a plain comma as the delimiter between multiple symptoms", () => {
    const result = buildSearchString(
      "human",
      new Set(["Husten", "Fieber"]),
      "",
    );
    const p = new URLSearchParams(result);
    const raw = p.get("symptoms") ?? "";
    // Two tokens separated by a literal comma
    const tokens = raw.split(",");
    expect(tokens).toHaveLength(2);
  });

  it("sets the target parameter", () => {
    const result = buildSearchString("rabbit", new Set(), "");
    const p = new URLSearchParams(result);
    expect(p.get("target")).toBe("rabbit");
  });

  it("sets the query parameter when non-empty", () => {
    const result = buildSearchString("human", new Set(), "  Husten  ");
    const p = new URLSearchParams(result);
    expect(p.get("q")).toBe("Husten");
  });

  it("omits the symptoms parameter when the set is empty", () => {
    const result = buildSearchString("human", new Set(), "");
    const p = new URLSearchParams(result);
    expect(p.get("symptoms")).toBeNull();
  });

  it("omits the query parameter when blank", () => {
    const result = buildSearchString("human", new Set(), "   ");
    const p = new URLSearchParams(result);
    expect(p.get("q")).toBeNull();
  });

  it("encodes special characters in symptom names", () => {
    const result = buildSearchString(
      "human",
      new Set(["Haut & Schleimhaut"]),
      "",
    );
    const p = new URLSearchParams(result);
    // & must be percent-encoded so it doesn't break the query string
    expect(p.get("symptoms")).not.toContain("&");
  });
});

// ---------------------------------------------------------------------------
// parseUrlState
// ---------------------------------------------------------------------------

describe("parseUrlState", () => {
  it("round-trips symptoms that contain commas", () => {
    const original = new Set(["Husten, Schnupfen", "Fieber"]);
    const search = buildSearchString("human", original, "");
    const { symptoms } = parseUrlState(search);
    expect(symptoms).toHaveLength(2);
    expect(symptoms).toContain("Husten, Schnupfen");
    expect(symptoms).toContain("Fieber");
  });

  it("round-trips symptoms that contain special characters", () => {
    const original = new Set(["Haut & Schleimhaut", "Übelkeit", "Schmerz (akut)"]);
    const search = buildSearchString("human", original, "");
    const { symptoms } = parseUrlState(search);
    expect(symptoms).toHaveLength(3);
    expect(symptoms).toContain("Haut & Schleimhaut");
    expect(symptoms).toContain("Übelkeit");
    expect(symptoms).toContain("Schmerz (akut)");
  });

  it("returns an empty symptoms array when the param is absent", () => {
    const { symptoms } = parseUrlState("?target=human");
    expect(symptoms).toEqual([]);
  });

  it("returns an empty symptoms array for an empty string", () => {
    const { symptoms } = parseUrlState("");
    expect(symptoms).toEqual([]);
  });

  it("defaults target to 'human' when the param is absent", () => {
    const { target } = parseUrlState("");
    expect(target).toBe("human");
  });

  it("defaults target to 'human' for an unrecognised target value", () => {
    const { target } = parseUrlState("?target=dragon");
    expect(target).toBe("human");
  });

  it("recognises valid target values", () => {
    for (const key of ["human", "poultry", "rabbit", "guineaPig", "cat", "horse"] as const) {
      const { target } = parseUrlState(`?target=${key}`);
      expect(target).toBe(key);
    }
  });

  it("returns the query string trimmed", () => {
    const { query } = parseUrlState("?q=Husten");
    expect(query).toBe("Husten");
  });

  it("returns an empty query when the param is absent", () => {
    const { query } = parseUrlState("?target=human");
    expect(query).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Combined round-trip: all three params set simultaneously
// ---------------------------------------------------------------------------

describe("full round-trip (target + symptoms + query)", () => {
  it("round-trips a non-default target, symptoms with a comma, and a query with umlauts", () => {
    const originalTarget = "rabbit";
    const originalSymptoms = new Set([
      "Husten, Schnupfen", // contains a literal comma
      "Übelkeit",
    ]);
    const originalQuery = "Krämpfe und Schäden";

    const search = buildSearchString(originalTarget, originalSymptoms, originalQuery);
    const { target, symptoms, query } = parseUrlState(search);

    expect(target).toBe(originalTarget);
    expect(symptoms).toHaveLength(2);
    expect(symptoms).toContain("Husten, Schnupfen");
    expect(symptoms).toContain("Übelkeit");
    expect(query).toBe(originalQuery);
  });
});

// ---------------------------------------------------------------------------
// q (query) round-trip tests
// ---------------------------------------------------------------------------

describe("q round-trip (buildSearchString → parseUrlState)", () => {
  it("round-trips a query with German umlauts", () => {
    const original = "Übelkeit und Schäden";
    const search = buildSearchString("human", new Set(), original);
    const { query } = parseUrlState(search);
    expect(query).toBe(original);
  });

  it("round-trips a query with spaces", () => {
    const original = "Husten und Fieber";
    const search = buildSearchString("human", new Set(), original);
    const { query } = parseUrlState(search);
    expect(query).toBe(original);
  });

  it("round-trips a query with mixed special characters", () => {
    const original = "Köpfschmerz & Müdigkeit (stark)";
    const search = buildSearchString("human", new Set(), original);
    const { query } = parseUrlState(search);
    expect(query).toBe(original);
  });

  it("trims leading and trailing spaces during build, round-trip returns trimmed value", () => {
    const padded = "  Husten  ";
    const search = buildSearchString("human", new Set(), padded);
    const { query } = parseUrlState(search);
    expect(query).toBe("Husten");
  });

  it("omits q from the URL and returns empty string for an empty query", () => {
    const search = buildSearchString("human", new Set(), "");
    const p = new URLSearchParams(search);
    expect(p.get("q")).toBeNull();
    const { query } = parseUrlState(search);
    expect(query).toBe("");
  });

  it("omits q from the URL and returns empty string for a whitespace-only query", () => {
    const search = buildSearchString("human", new Set(), "   ");
    const p = new URLSearchParams(search);
    expect(p.get("q")).toBeNull();
    const { query } = parseUrlState(search);
    expect(query).toBe("");
  });
});

// ---------------------------------------------------------------------------
// canonicaliseSymptoms — case-insensitive reconciliation
// ---------------------------------------------------------------------------

describe("canonicaliseSymptoms", () => {
  const available = ["Husten", "Fieber", "Übelkeit", "Haut & Schleimhaut"];

  it("exact-case match returns the symptom unchanged in canonical list", () => {
    const { canonical, notFound } = canonicaliseSymptoms(["Husten"], available);
    expect(canonical).toEqual(["Husten"]);
    expect(notFound).toEqual([]);
  });

  it("remaps a lower-cased URL symptom to the canonical (server) form", () => {
    const { canonical, notFound } = canonicaliseSymptoms(["husten"], available);
    expect(canonical).toEqual(["Husten"]);
    expect(notFound).toEqual([]);
  });

  it("remaps an upper-cased URL symptom to the canonical form", () => {
    const { canonical, notFound } = canonicaliseSymptoms(["FIEBER"], available);
    expect(canonical).toEqual(["Fieber"]);
    expect(notFound).toEqual([]);
  });

  it("remaps mixed-case URL symptom to canonical form", () => {
    const { canonical, notFound } = canonicaliseSymptoms(["üBeLkEiT"], available);
    expect(canonical).toEqual(["Übelkeit"]);
    expect(notFound).toEqual([]);
  });

  it("places an unrecognised symptom in notFound and NOT in canonical", () => {
    const { canonical, notFound } = canonicaliseSymptoms(
      ["Veraltete Beschwerde"],
      available,
    );
    expect(canonical).toEqual([]);
    expect(notFound).toEqual(["Veraltete Beschwerde"]);
  });

  it("splits a mixed list correctly: case-variant goes to canonical, unknown to notFound", () => {
    const { canonical, notFound } = canonicaliseSymptoms(
      ["husten", "UnbekanntesBeschwerden"],
      available,
    );
    expect(canonical).toEqual(["Husten"]);
    expect(notFound).toEqual(["UnbekanntesBeschwerden"]);
  });

  it("handles multiple matching symptoms with different capitalisation", () => {
    const { canonical, notFound } = canonicaliseSymptoms(
      ["HUSTEN", "fieber"],
      available,
    );
    expect(canonical).toEqual(["Husten", "Fieber"]);
    expect(notFound).toEqual([]);
  });

  it("returns empty arrays when urlSymptoms is empty", () => {
    const { canonical, notFound } = canonicaliseSymptoms([], available);
    expect(canonical).toEqual([]);
    expect(notFound).toEqual([]);
  });

  it("places all symptoms in notFound when none match available", () => {
    const { canonical, notFound } = canonicaliseSymptoms(
      ["Symptom A", "Symptom B"],
      available,
    );
    expect(canonical).toEqual([]);
    expect(notFound).toEqual(["Symptom A", "Symptom B"]);
  });

  it("preserves the original (not canonical) casing of unmatched symptoms in notFound", () => {
    const { notFound } = canonicaliseSymptoms(["VERALTETES SYMPTOM"], available);
    expect(notFound).toEqual(["VERALTETES SYMPTOM"]);
  });

  it("works for symptoms containing special characters like & with different case", () => {
    const { canonical, notFound } = canonicaliseSymptoms(
      ["haut & schleimhaut"],
      available,
    );
    expect(canonical).toEqual(["Haut & Schleimhaut"]);
    expect(notFound).toEqual([]);
  });

  it("integrates correctly with the round-tripped URL: case-variant from URL is remapped", () => {
    // Simulate a URL built with lowercase symptom (as might come from an old
    // link or a manually edited URL) — parseUrlState + canonicaliseSymptoms
    // should recover the canonical form.
    const search = buildSearchString("human", new Set(["husten", "fieber"]), "");
    const { symptoms: urlSymptoms } = parseUrlState(search);
    const { canonical, notFound } = canonicaliseSymptoms(urlSymptoms, available);
    // buildSearchString does not alter casing, so we get back "husten"/"fieber"
    expect(canonical).toEqual(["Husten", "Fieber"]);
    expect(notFound).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// not-found logic (mirrors the component's useEffect)
// ---------------------------------------------------------------------------

describe("not-found symptom detection", () => {
  /**
   * Replicates what the component does: compare the symptoms from the URL
   * against the list of available symptoms and collect any that are missing.
   */
  function findMissing(urlSearch: string, available: string[]): string[] {
    const { symptoms: urlSymptoms } = parseUrlState(urlSearch);
    if (urlSymptoms.length === 0) return [];
    const set = new Set(available);
    return urlSymptoms.filter((s) => !set.has(s));
  }

  it("produces an empty not-found list when all symptoms match", () => {
    const search = buildSearchString(
      "human",
      new Set(["Husten", "Fieber"]),
      "",
    );
    const missing = findMissing(search, ["Husten", "Fieber", "Schnupfen"]);
    expect(missing).toEqual([]);
  });

  it("lists symptoms from the URL that are absent from available symptoms", () => {
    const search = buildSearchString(
      "human",
      new Set(["Husten", "Veraltete Beschwerde"]),
      "",
    );
    const missing = findMissing(search, ["Husten", "Fieber"]);
    expect(missing).toEqual(["Veraltete Beschwerde"]);
  });

  it("lists all URL symptoms as missing when none match", () => {
    const search = buildSearchString(
      "human",
      new Set(["Symptom A", "Symptom B"]),
      "",
    );
    const missing = findMissing(search, ["Völlig anderes Symptom"]);
    expect(missing).toContain("Symptom A");
    expect(missing).toContain("Symptom B");
    expect(missing).toHaveLength(2);
  });

  it("returns an empty list when there are no URL symptoms at all", () => {
    const missing = findMissing("?target=human", ["Husten", "Fieber"]);
    expect(missing).toEqual([]);
  });

  it("correctly identifies missing symptoms that contain commas", () => {
    const search = buildSearchString(
      "human",
      new Set(["Husten, Schnupfen", "Fieber"]),
      "",
    );
    // Only "Fieber" is available; the comma-symptom should appear as missing
    const missing = findMissing(search, ["Fieber"]);
    expect(missing).toEqual(["Husten, Schnupfen"]);
  });
});
