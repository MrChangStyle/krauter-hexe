import { describe, expect, it } from "vitest";
import { OPERATOR, operatorDataIncomplete } from "@/lib/legal";

describe("Betreiberangaben", () => {
  it("are complete, with a real street address and postcode", () => {
    expect(operatorDataIncomplete()).toBe(false);
    expect(OPERATOR.city).toMatch(/^\d{5} /);
    expect(OPERATOR.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/);
  });
});
