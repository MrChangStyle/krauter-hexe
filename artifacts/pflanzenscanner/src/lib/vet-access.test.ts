import { describe, expect, it } from "vitest";
import type { FarmContact } from "@workspace/api-client-react";
import { VET_ACCESS_DAYS, VET_MODULES, isVetGrant, vetInviteDefaults } from "./vet-access";

const contact = (over: Partial<FarmContact>): FarmContact => ({ id: 1, kind: "vet", name: "Dr. Klee", role: null, phone: null, email: null, note: null, ...over });

describe("Tierarzt-Zugang", () => {
  it("presets the vet's email from the contacts and ends in 14 days", () => {
    const contacts = [contact({ kind: "family", email: "oma@example.org" }), contact({ email: null }), contact({ id: 3, email: "praxis@example.org" })];
    expect(vetInviteDefaults("2026-10-29", contacts)).toEqual({ email: "praxis@example.org", until: "2026-11-12" });
    expect(vetInviteDefaults("2026-12-25", undefined)).toEqual({ email: "", until: "2027-01-08" });
    expect(VET_ACCESS_DAYS).toBe(14);
  });

  it("recognises the vet's grants", () => {
    expect(isVetGrant(VET_MODULES)).toBe(true);
    expect(isVetGrant(["export", "medicines"])).toBe(true);
    expect(isVetGrant(["medicines"])).toBe(false);
    expect(isVetGrant(null)).toBe(false);
  });
});
