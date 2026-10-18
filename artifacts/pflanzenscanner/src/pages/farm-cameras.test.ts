import { describe, expect, it } from "vitest";
import { webhookUrl, whenText } from "@/pages/farm-cameras";

describe("Wildtier-Radar texts", () => {
  it("builds the webhook address from the app's origin", () => {
    expect(webhookUrl("https://littlefarming.de")).toBe("https://littlefarming.de/api/webhooks/camera");
  });

  it("says how long ago something happened", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(whenText("2026-10-18T11:59:40Z", now)).toBe("gerade eben");
    expect(whenText("2026-10-18T11:45:00Z", now)).toBe("vor 15 Min.");
    expect(whenText("2026-10-18T09:00:00Z", now)).toBe("vor 3 Std.");
  });
});
