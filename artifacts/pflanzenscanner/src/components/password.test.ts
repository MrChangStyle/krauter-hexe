import { describe, expect, it, vi } from "vitest";
import { postJson, resetTokenFrom } from "@/components/password";

describe("resetTokenFrom", () => {
  it("reads the token of a reset link", () => {
    expect(resetTokenFrom("?token=AbC_def-0123456789xyzXYZ")).toBe("AbC_def-0123456789xyzXYZ");
  });

  it("ignores missing, short or odd tokens", () => {
    expect(resetTokenFrom("")).toBeNull();
    expect(resetTokenFrom("?token=kurz")).toBeNull();
    expect(resetTokenFrom("?token=<script>alert(1)</script>xxxxxxxx")).toBeNull();
  });
});

describe("postJson", () => {
  it("posts JSON with the cookie and returns the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ mail: false }), { status: 200 }));
    await expect(postJson("/auth/password-reset", { email: "a@b.de" }, fetchMock)).resolves.toEqual({ mail: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/auth\/password-reset$/);
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ email: "a@b.de" });
  });

  it("passes on the server's German message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Dieser Link ist abgelaufen." }), { status: 400 }));
    await expect(postJson("/auth/password-reset/confirm", {}, fetchMock)).rejects.toThrow("Dieser Link ist abgelaufen.");
  });

  it("says when there is no connection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(postJson("/auth/password", {}, fetchMock)).rejects.toThrow(/Keine Verbindung/);
  });
});
