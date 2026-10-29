import { describe, expect, it } from "vitest";
import { campaignOf, trackingRefused } from "./site-visit";

describe("Besucher der Homepage", () => {
  it("respects Global Privacy Control and Do Not Track", () => {
    expect(trackingRefused({ globalPrivacyControl: true } as Navigator)).toBe(true);
    expect(trackingRefused({ doNotTrack: "1" } as unknown as Navigator)).toBe(true);
    expect(trackingRefused({ doNotTrack: "0" } as unknown as Navigator)).toBe(false);
  });

  it("takes the campaign from utm_source, else ref", () => {
    expect(campaignOf("?utm_source=instagram&utm_medium=social")).toBe("instagram");
    expect(campaignOf("?ref=huehnerforum")).toBe("huehnerforum");
    expect(campaignOf("?start=login")).toBeNull();
  });
});
