import { describe, expect, it } from "vitest";
import { SETUP_STEPS, defaultGroupName } from "./farm-setup";

describe("Hof einrichten", () => {
  it("lists the server's steps in order, each with a way to do it", () => {
    expect(SETUP_STEPS.map((s) => s.key)).toEqual(["name", "location", "animals", "rations", "tasks", "beds", "members"]);
    for (const s of SETUP_STEPS) expect(s.action.length).toBeGreaterThan(0);
    expect(defaultGroupName("poultry")).toBe("Hühner");
  });
});
