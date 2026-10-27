/**
 * runModelChain with a time budget: a model that never answers must not keep
 * the person waiting – the chain gives up once the budget is spent.
 */

import { describe, expect, it, vi } from "vitest";

const { calls, thinking } = vi.hoisted(() => ({ calls: [] as string[], thinking: [] as unknown[] }));

// A model that hangs until its abort signal fires, like an unanswered request.
vi.mock("./geminiClient", () => ({
  ai: {
    models: {
      generateContent: ({ model, config }: { model: string; config: { abortSignal?: AbortSignal; thinkingConfig?: Record<string, unknown> } }) => {
        calls.push(model);
        thinking.push(config.thinkingConfig ?? null);
        if (model === "fast") return Promise.resolve({ text: '{"ok": true}' });
        // Like Gemini 2.5: knows a thinking budget, not a thinking level.
        if (model === "older") {
          return config.thinkingConfig && "thinkingLevel" in config.thinkingConfig
            ? Promise.reject(Object.assign(new Error("Invalid JSON payload: unknown field thinking_level"), { status: 400 }))
            : Promise.resolve({ text: '{"ok": "older"}' });
        }
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

describe("runModelChain quick", () => {
  it("asks for minimal thinking, and falls back to a budget of 0 where the model does not know the level", async () => {
    calls.length = 0;
    thinking.length = 0;
    const cfg = { maxOutputTokens: 10, responseMimeType: "application/json" };
    expect(await runModelChain([], [{ name: "older", attempts: 1 }], cfg, { quick: true })).toEqual({ ok: "older" });
    expect(thinking).toEqual([{ thinkingLevel: "MINIMAL" }, { thinkingBudget: 0 }]);
    // Remembered: the next call goes straight to the budget.
    thinking.length = 0;
    await runModelChain([], [{ name: "older", attempts: 1 }], cfg, { quick: true });
    expect(thinking).toEqual([{ thinkingBudget: 0 }]);
    // Without quick nothing about thinking is sent.
    thinking.length = 0;
    await runModelChain([], [{ name: "fast", attempts: 1 }], cfg);
    expect(thinking).toEqual([null]);
  });
});

describe("aiErrorDetail", () => {
  it("names status and cause, never the key", async () => {
    const { aiErrorDetail } = await import("../routes/farmRouteHelpers");
    expect(aiErrorDetail(Object.assign(new Error("models/gemini-x is not found ?key=geheim123"), { status: 404 }))).toBe(
      "404 · models/gemini-x is not found ?key=…",
    );
    expect(aiErrorDetail(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }))).toBe("AbortError · This operation was aborted");
  });
});
