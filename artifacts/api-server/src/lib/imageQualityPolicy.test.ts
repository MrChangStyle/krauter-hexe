import { describe, expect, it } from "vitest";
import { coerceQuality, shouldReplaceSharedImage } from "./imageQualityPolicy";

describe("coerceQuality", () => {
  it("accepts whole and fractional numbers and numeric strings within 1-10", () => {
    expect(coerceQuality(7)).toBe(7);
    expect(coerceQuality(7.6)).toBe(8);
    expect(coerceQuality("9")).toBe(9);
  });
  it("rejects anything outside 1-10 or not a number", () => {
    expect(coerceQuality(0)).toBeNull();
    expect(coerceQuality(11)).toBeNull();
    expect(coerceQuality("gut")).toBeNull();
    expect(coerceQuality(undefined)).toBeNull();
  });
});

describe("shouldReplaceSharedImage", () => {
  it("replaces only with a clearly better photo", () => {
    expect(shouldReplaceSharedImage({ locked: false, current: 5, candidate: 7 })).toBe(true);
    expect(shouldReplaceSharedImage({ locked: false, current: 5, candidate: 6 })).toBe(false);
  });
  it("treats an unrated shared photo as average", () => {
    expect(shouldReplaceSharedImage({ locked: false, current: null, candidate: 8 })).toBe(true);
    expect(shouldReplaceSharedImage({ locked: false, current: null, candidate: 7 })).toBe(false);
  });
  it("never replaces a locked photo or without a rating", () => {
    expect(shouldReplaceSharedImage({ locked: true, current: 2, candidate: 10 })).toBe(false);
    expect(shouldReplaceSharedImage({ locked: false, current: 2, candidate: null })).toBe(false);
  });
});
