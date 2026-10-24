import { describe, expect, it } from "vitest";
import { readTheme, resolveTheme } from "@/lib/theme";

describe("Darstellung", () => {
  it("follows the device unless chosen", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the device without storage", () => {
    expect(readTheme()).toBe("system");
  });
});
