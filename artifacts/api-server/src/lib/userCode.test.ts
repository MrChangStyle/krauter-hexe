import { describe, expect, it } from "vitest";

const { digitsFor, parseUserCode } = await import("./userCode");

describe("Nutzer-ID", () => {
  it("has four digits until most of those are taken, then five", () => {
    expect(digitsFor(0)).toBe(4);
    expect(digitsFor(7199)).toBe(4); // 80 % of 9000
    expect(digitsFor(7200)).toBe(5);
    expect(digitsFor(79_199)).toBe(5); // 80 % of 9000 + 90000
    expect(digitsFor(79_200)).toBe(6);
  });

  it("reads what people type and refuses everything else", () => {
    expect(parseUserCode(4821)).toBe(4821);
    expect(parseUserCode(" 48 21 ")).toBe(4821);
    expect(parseUserCode("#4821")).toBe(4821);
    expect(parseUserCode("12345")).toBe(12345);
    for (const bad of ["", "482", "0482", "abcd", "4821x", null, undefined, 3.5, "12345678"]) expect(parseUserCode(bad)).toBeNull();
  });
});
