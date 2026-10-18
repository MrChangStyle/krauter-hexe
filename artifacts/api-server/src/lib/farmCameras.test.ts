import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["DATABASE_URL"] ??= "postgres://unused@127.0.0.1:1/unused";
  process.env["GEMINI_API_KEY"] ??= "test-key";
});

const { coercePredatorCheck, hashSecret, isPrivateAddress, validRelayUrl } = await import("./farmCameras");

describe("relay address", () => {
  it("knows private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.178.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2a01:4f8::1", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("accepts public http(s) URLs only", () => {
    expect(validRelayUrl("https://shelly-12-eu.shelly.cloud/device/relay/control?id=abc&turn=on")).toMatch(/^https:\/\/shelly/);
    expect(validRelayUrl("  ")).toBeNull();
    for (const bad of ["ftp://x.de/a", "http://localhost/on", "http://192.168.1.20/relay/0?turn=on", "http://[::1]/x", "https://u:p@relay.de/", "http://hof.local/on", "kein url"]) {
      expect(() => validRelayUrl(bad), bad).toThrow();
    }
  });
});

describe("predator check", () => {
  it("is coerced and clamped", () => {
    expect(coercePredatorCheck({ predatorDetected: true, species: " Fuchs ", confidence: 1.4 })).toEqual({
      predatorDetected: true,
      species: "Fuchs",
      confidence: 1,
    });
    expect(coercePredatorCheck({ predatorDetected: "yes", confidence: "x" })).toEqual({
      predatorDetected: false,
      species: null,
      confidence: 0,
    });
  });

  it("hashes secrets with sha256", () => {
    expect(hashSecret("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
