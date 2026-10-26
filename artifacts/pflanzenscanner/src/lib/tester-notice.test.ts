import { describe, expect, it } from "vitest";
import { testerText } from "@/components/tester-notice";

describe("Testphase-Hinweis", () => {
  it("speaks to testers only", () => {
    expect(testerText("test")!.text).toMatch(/nach dem Start kostenlos/);
    expect(testerText("tester")!.title).toBe("Danke fürs Testen");
    expect(testerText("manual")).toBeNull();
    expect(testerText("owner")).toBeNull();
    expect(testerText(null)).toBeNull();
  });
});
