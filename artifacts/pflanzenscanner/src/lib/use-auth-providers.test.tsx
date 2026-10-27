// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAuthProviders } from "@/lib/use-auth-providers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAuthProviders", () => {
  it("passes on what the server offers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ google: true, turnstileSiteKey: "0xSITE", openRegistration: true }),
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useAuthProviders());

    await waitFor(() =>
      expect(result.current).toEqual({
        google: true,
        turnstileSiteKey: "0xSITE",
        openRegistration: true,
      }),
    );
  });

  it("offers nothing extra for an older server that only reports Google", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ google: true }), { status: 200 })),
    );

    const { result } = renderHook(() => useAuthProviders());

    await waitFor(() => expect(result.current.google).toBe(true));
    expect(result.current.turnstileSiteKey).toBeNull();
    expect(result.current.openRegistration).toBe(false);
  });

  it("offers nothing extra when the request fails (e.g. offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useAuthProviders());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toEqual({
      google: false,
      turnstileSiteKey: null,
      openRegistration: false,
    });
  });
});
