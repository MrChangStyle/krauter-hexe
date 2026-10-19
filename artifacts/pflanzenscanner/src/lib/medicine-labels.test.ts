import { describe, expect, it } from "vitest";
import { deDay, medicineWithdrawal } from "./medicine-labels";
import { doseText } from "./farm-health";

describe("medicine labels", () => {
  it("shows withdrawal periods, dates and the dose with its batch", () => {
    expect(medicineWithdrawal({ withdrawalMeatDays: 7, withdrawalMilkDays: null, withdrawalEggsDays: 1 })).toBe("Fleisch 7 Tage · Eier 1 Tag");
    expect(medicineWithdrawal({ withdrawalMeatDays: null, withdrawalMilkDays: null, withdrawalEggsDays: null })).toBeNull();
    expect(deDay("2027-03-31")).toBe("31.03.2027");
    expect(doseText({ dose: 12.5, doseUnit: "g", batch: "CH-4711" })).toBe("12,5 g, Ch. CH-4711");
    expect(doseText({ dose: null, doseUnit: null, batch: null })).toBe("");
  });
});
