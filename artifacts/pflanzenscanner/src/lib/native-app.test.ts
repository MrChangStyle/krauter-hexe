import { describe, expect, it } from "vitest";
import { isNativeApp } from "./native-app";

describe("Store-App", () => {
  it("recognises the Capacitor shell", () => {
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => true } })).toBe(true);
    expect(isNativeApp({ Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(isNativeApp({})).toBe(false);
  });
});
