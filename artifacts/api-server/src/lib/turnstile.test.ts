/**
 * Tests for the Cloudflare Turnstile check: inert without keys, and failing
 * closed whenever Cloudflare does not clearly confirm the token.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getTurnstileConfig, verifyTurnstileToken } from "./turnstile";

const config = { siteKey: "site", secretKey: "secret" };

function answer(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  delete process.env["TURNSTILE_SITE_KEY"];
  delete process.env["TURNSTILE_SECRET_KEY"];
});

describe("getTurnstileConfig", () => {
  it("is off unless both keys are set", () => {
    expect(getTurnstileConfig()).toBeNull();
    process.env["TURNSTILE_SITE_KEY"] = "site";
    expect(getTurnstileConfig()).toBeNull();
    process.env["TURNSTILE_SECRET_KEY"] = "secret";
    expect(getTurnstileConfig()).toEqual(config);
  });
});

describe("verifyTurnstileToken", () => {
  it("accepts a token Cloudflare confirms and sends secret, token and address", async () => {
    const fetchImpl = answer({ success: true });
    expect(await verifyTurnstileToken(config, "tok", "203.0.113.7", fetchImpl)).toBe(true);
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("rejects a token Cloudflare does not confirm", async () => {
    expect(await verifyTurnstileToken(config, "tok", undefined, answer({ success: false }))).toBe(false);
  });

  it("rejects a missing token without asking Cloudflare", async () => {
    const fetchImpl = answer({ success: true });
    expect(await verifyTurnstileToken(config, undefined, undefined, fetchImpl)).toBe(false);
    expect(await verifyTurnstileToken(config, "", undefined, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when Cloudflare errors or is unreachable", async () => {
    expect(await verifyTurnstileToken(config, "tok", undefined, answer({}, 500))).toBe(false);
    const broken = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await verifyTurnstileToken(config, "tok", undefined, broken)).toBe(false);
  });
});
