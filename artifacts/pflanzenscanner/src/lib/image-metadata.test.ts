import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "@/lib/image";

// SOI, APP0 (JFIF, kept), APP1 (EXIF with "GPS", removed), DQT (kept), SOS + data, EOI.
const segment = (marker: number, payload: number[]) => [0xff, marker, 0, payload.length + 2, ...payload];
const gps = [...new TextEncoder().encode("Exif\0\0GPS 47.87 12.11")];
const jpeg = new Uint8Array([
  0xff, 0xd8,
  ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]),
  ...segment(0xe1, gps),
  ...segment(0xdb, [1, 2, 3]),
  0xff, 0xda, 0, 4, 9, 9, 0x11, 0x22, 0xff, 0xd9,
]);

describe("stripJpegMetadata", () => {
  it("removes EXIF/GPS and keeps everything else", () => {
    const out = stripJpegMetadata(jpeg);
    const text = new TextDecoder("latin1").decode(out);
    expect(text).not.toContain("GPS");
    expect(text).toContain("JFIF");
    expect(out.length).toBe(jpeg.length - (gps.length + 4));
    expect([...out.slice(-6)]).toEqual([9, 9, 0x11, 0x22, 0xff, 0xd9]);
  });

  it("leaves anything that is not a JPEG unchanged", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect(stripJpegMetadata(png)).toBe(png);
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
    expect(stripJpegMetadata(broken)).toBe(broken);
  });
});
