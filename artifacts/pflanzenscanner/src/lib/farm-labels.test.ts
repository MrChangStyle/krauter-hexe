import { describe, expect, it } from "vitest";
import { ageText, todayIso } from "@/lib/farm-labels";

const on = (iso: string) => new Date(`${iso}T12:00:00`);

describe("ageText", () => {
  it("speaks in years, months, weeks or days", () => {
    expect(ageText("2020-03-01", on("2026-10-18"))).toBe("6 Jahre");
    expect(ageText("2025-09-01", on("2026-10-18"))).toBe("1 Jahr");
    expect(ageText("2026-03-18", on("2026-10-18"))).toBe("7 Monate");
    expect(ageText("2026-09-18", on("2026-10-18"))).toBe("1 Monat");
    expect(ageText("2026-10-01", on("2026-10-18"))).toBe("2 Wochen");
    expect(ageText("2026-10-17", on("2026-10-18"))).toBe("1 Tag");
  });

  it("counts a birthday only once it is reached", () => {
    expect(ageText("2024-10-19", on("2026-10-18"))).toBe("1 Jahr");
    expect(ageText("2024-10-18", on("2026-10-18"))).toBe("2 Jahre");
  });

  it("has nothing to say without a birth date", () => {
    expect(ageText(null)).toBeNull();
  });
});

describe("todayIso", () => {
  it("formats the local day", () => {
    expect(todayIso(on("2026-01-05"))).toBe("2026-01-05");
  });
});
