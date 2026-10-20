import { describe, expect, it } from "vitest";
import { EXPENSE_LABELS, changeText, euro, num } from "./yield-labels";

describe("yield labels", () => {
  it("formats money, amounts and the change to last year", () => {
    expect(euro(12.5)).toBe("12,50 €");
    expect(euro(1234)).toBe("1.234 €");
    expect(num(12.25)).toBe("12,25");
    expect(changeText(120, 100)).toBe("+20 % zum Vorjahr");
    expect(changeText(95, 100)).toBe("−5 % zum Vorjahr");
    expect(changeText(50, 0)).toBeNull();
    expect(Object.keys(EXPENSE_LABELS)).toEqual(["feed", "vet", "bedding", "seeds", "animals", "equipment", "other"]);
  });
});
