import { describe, expect, it } from "vitest";
import { isUsernameAllowed } from "./usernameFilter";

describe("isUsernameAllowed", () => {
  it("accepts ordinary names, including ones that contain harmless lookalikes", () => {
    for (const name of ["ANNA", "KRAUT", "SIEGFRID", "DICKE", "HEXE", "Moritz", "SCHAF"]) {
      expect(isUsernameAllowed(name)).toBe(true);
    }
  });

  it("rejects insults and slurs, also inside a longer name", () => {
    for (const name of ["ARSCH", "DUARSCH", "fick", "HITLERX", "NAZIBOB"]) {
      expect(isUsernameAllowed(name)).toBe(false);
    }
  });

  it("rejects names that pretend to speak for the app", () => {
    for (const name of ["ADMIN", "admin", "SUPPORT", "INHABER"]) {
      expect(isUsernameAllowed(name)).toBe(false);
    }
  });
});
