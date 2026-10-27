import { describe, expect, it } from "vitest";
import { AI_TOO_SLOW, withPlanTimeout } from "@/lib/ai-plan";

describe("withPlanTimeout", () => {
  it("passes a quick answer through", async () => {
    await expect(withPlanTimeout(Promise.resolve(42), 50)).resolves.toBe(42);
  });

  it("gives up on an answer that never comes", async () => {
    await expect(withPlanTimeout(new Promise(() => {}), 20)).rejects.toBe(AI_TOO_SLOW);
  });
});
