import { describe, expect, it } from "vitest";
import { guessRepeatKind, repeatDue } from "@/lib/medical-repeat";

describe("medical repeat", () => {
  it("guesses deworming and vaccination from the text", () => {
    expect(guessRepeatKind("Entwurmung")).toBe("deworm");
    expect(guessRepeatKind("Wurmkur", null)).toBe("deworm");
    expect(guessRepeatKind("Kotprobe", "Kokzidiose behandelt")).toBe("deworm");
    expect(guessRepeatKind("Impfung RHD-2")).toBe("vaccinate");
    expect(guessRepeatKind("Moderhinke", "Zinkbad")).toBeNull();
  });

  it("counts the due day like the server", () => {
    expect(repeatDue("2026-04-01", 12, "Wochen")).toBe("2026-06-24");
    expect(repeatDue("2026-06-20", 3, "Monate")).toBe("2026-09-18");
    expect(repeatDue("2026-12-30", 5, "Tage")).toBe("2027-01-04");
  });
});
