import { describe, expect, it } from "vitest";
import { VET_ACCESS_DAYS, VET_MODULES, isVetGrant, vetInviteDefaults } from "./vet-access";

describe("Tierarzt-Zugang", () => {
  it("ends the vet's access in 14 days", () => {
    expect(vetInviteDefaults("2026-10-29")).toEqual({ until: "2026-11-12" });
    expect(vetInviteDefaults("2026-12-25")).toEqual({ until: "2027-01-08" });
    expect(VET_ACCESS_DAYS).toBe(14);
  });

  it("recognises the vet's grants", () => {
    expect(isVetGrant(VET_MODULES)).toBe(true);
    expect(isVetGrant(["export", "medicines"])).toBe(true);
    expect(isVetGrant(["medicines"])).toBe(false);
    expect(isVetGrant(null)).toBe(false);
  });
});
