import { afterEach, describe, expect, it } from "vitest";
import { getAppConfig } from "./appConfig";

afterEach(() => {
  delete process.env["PUBLIC_BASE_URL"];
  delete process.env["LEGACY_ORIGINS"];
});

describe("getAppConfig", () => {
  it("has no canonical address when PUBLIC_BASE_URL is unset (no move helper)", () => {
    expect(getAppConfig()).toEqual({ canonicalOrigin: null, legacyOrigins: [] });
  });

  it("reduces PUBLIC_BASE_URL to its origin", () => {
    process.env["PUBLIC_BASE_URL"] = "https://littlefarming.de/";
    expect(getAppConfig().canonicalOrigin).toBe("https://littlefarming.de");
  });

  it("lists valid old addresses, without duplicates or the new one", () => {
    process.env["PUBLIC_BASE_URL"] = "https://littlefarming.de";
    process.env["LEGACY_ORIGINS"] =
      " https://kraeuter-hexe.onrender.com/ ,https://kraeuter-hexe.onrender.com, nonsense, http://evil.example, https://littlefarming.de";
    expect(getAppConfig().legacyOrigins).toEqual(["https://kraeuter-hexe.onrender.com"]);
  });
});
