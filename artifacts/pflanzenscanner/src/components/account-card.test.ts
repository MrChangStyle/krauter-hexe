import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "@/components/account-card";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestAccountDeletion", () => {
  it("sends the confirmation as JSON with the session cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await requestAccountDeletion({ password: "geheim123" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/user$/);
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ password: "geheim123" });
  });

  it("passes on the server's German message when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Das Passwort ist falsch." }), { status: 403 }),
      ),
    );

    await expect(requestAccountDeletion({ password: "x" })).rejects.toThrow(
      "Das Passwort ist falsch.",
    );
  });

  it("explains a missing connection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(requestAccountDeletion({ confirmEmail: "a@b.de" })).rejects.toThrow(
      /Keine Verbindung/,
    );
  });
});
