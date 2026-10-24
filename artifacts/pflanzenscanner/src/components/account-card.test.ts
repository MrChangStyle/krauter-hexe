import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMyData, requestAccountDeletion } from "@/components/account-card";

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

describe("downloadMyData", () => {
  it("passes on the server's message instead of saving an error page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Bitte versuche es in einer Stunde noch einmal." }), { status: 429 }),
    );
    await expect(downloadMyData(fetchMock)).rejects.toThrow("Bitte versuche es in einer Stunde noch einmal.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/user\/export$/);
    expect(init.credentials).toBe("include");
  });

  it("saves the file under the server's name", async () => {
    const click = vi.fn();
    const link = { click, remove: vi.fn(), href: "", download: "" };
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-disposition": 'attachment; filename="little-farming-daten-2026-10-24.json"' } }),
    );
    await downloadMyData(fetchMock);
    expect(link.download).toBe("little-farming-daten-2026-10-24.json");
    expect(click).toHaveBeenCalled();
  });
});
