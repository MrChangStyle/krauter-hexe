// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isNoise, reportError } from "./error-reporter";

describe("error reporter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ignores browser noise", () => {
    expect(isNoise("Script error.")).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isNoise("Failed to fetch")).toBe(true);
    expect(isNoise("Cannot read properties of undefined (reading 'name')")).toBe(false);
  });

  it("sends each kind of error once, with the page path but nothing personal", () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const err = new Error("Cannot read properties of undefined (reading 'label')");
    reportError(err, "Render");
    reportError(err, "Render");
    reportError(new Error("Script error."));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/client-errors$/);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ message: "Render: Cannot read properties of undefined (reading 'label')", path: window.location.pathname });
    expect(Object.keys(body).sort()).toEqual(["message", "path", "release", "stack"]);
  });
});
