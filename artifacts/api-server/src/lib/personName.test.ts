import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, parsePersonName } from "./personName";

describe("parsePersonName", () => {
  it("accepts ordinary names, also with umlauts, hyphen and apostrophe", () => {
    for (const name of ["Yvonne", "Müller-Lüdenscheidt", "O'Brien", "Anna Maria", "Đặng", "St. Clair"]) {
      expect(parsePersonName(name, "Nachname")).toEqual({ ok: true, value: name });
    }
  });

  it("tidies spaces and treats empty as not given", () => {
    expect(parsePersonName("  Anna   Maria ", "Vorname")).toEqual({ ok: true, value: "Anna Maria" });
    expect(parsePersonName("   ", "Vorname")).toEqual({ ok: true, value: null });
    expect(parsePersonName(null, "Vorname")).toEqual({ ok: true, value: null });
  });

  it("rejects digits, markup and names that do not start with a letter", () => {
    for (const name of ["Anna1", "<b>Anna</b>", "-Anna", "...", "Anna@home"]) {
      expect(parsePersonName(name, "Vorname").ok).toBe(false);
    }
  });

  it("rejects overly long names and non-text", () => {
    expect(parsePersonName("A".repeat(MAX_NAME_LENGTH + 1), "Nachname").ok).toBe(false);
    expect(parsePersonName(42, "Nachname").ok).toBe(false);
  });
});
