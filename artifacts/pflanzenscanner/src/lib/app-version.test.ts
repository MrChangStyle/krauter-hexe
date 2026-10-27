import { describe, expect, it } from "vitest";
import { formatBuild, markUpdating, takeUpdated } from "@/lib/app-version";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("app version", () => {
  it("says 'App aktualisiert' exactly once after an update", () => {
    const s = memory();
    expect(takeUpdated(s)).toBe(false);
    markUpdating(s);
    expect(takeUpdated(s)).toBe(true);
    expect(takeUpdated(s)).toBe(false);
  });

  it("shows the build time in Berlin time", () => {
    expect(formatBuild("2026-10-27T18:28:00Z")).toBe("27.10.2026, 19:28");
    expect(formatBuild(null)).toBeNull();
    expect(formatBuild("kaputt")).toBeNull();
  });
});
