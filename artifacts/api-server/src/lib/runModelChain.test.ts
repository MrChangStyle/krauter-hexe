/**
 * runModelChain with a time budget: a model that never answers must not keep
 * the person waiting – the chain gives up once the budget is spent.
 */

import { describe, expect, it, vi } from "vitest";

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));

// A model that hangs until its abort signal fires, like an unanswered request.
vi.mock("./geminiClient", () => ({
  ai: {
    models: {
      generateContent: ({ model, config }: { model: string; config: { abortSignal?: AbortSignal } }) => {
        calls.push(model);
        if (model === "fast") return Promise.resolve({ text: '{"ok": true}' });
        return new Promise((_resolve, reject) => {
          config.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      },
    },
  },
}));

import { runModelChain } from "./plantIdentification";

describe("runModelChain with timeoutMs", () => {
  it("gives up after the budget instead of waiting for ever", async () => {
    const started = Date.now();
    await expect(
      runModelChain([], [{ name: "a", attempts: 2 }, { name: "b", attempts: 1 }], { maxOutputTokens: 10, responseMimeType: "application/json" }, { timeoutMs: 300 }),
    ).rejects.toThrow();
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(250);
    expect(took).toBeLessThan(2000);
    // The first model used up the whole budget; nothing more was tried after it.
    expect(calls).toEqual(["a"]);
  });

  it("gives the next model its turn when one model is slow", async () => {
    calls.length = 0;
    const answer = await runModelChain([], [{ name: "slow", attempts: 1 }, { name: "fast", attempts: 1 }], { maxOutputTokens: 10, responseMimeType: "application/json" }, { timeoutMs: 2000, attemptTimeoutMs: 200 });
    expect(answer).toEqual({ ok: true });
    expect(calls).toEqual(["slow", "fast"]);
  });
});
