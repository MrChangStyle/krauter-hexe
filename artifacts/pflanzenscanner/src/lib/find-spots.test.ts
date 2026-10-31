import { describe, expect, it } from "vitest";
import { currentFindSpot, roundToCell } from "@/lib/find-spots";

const pos = { lat: 47.8723, lon: 12.1189 };

describe("roundToCell", () => {
  it("sends the cell centre, not the position, and is stable", () => {
    const c = roundToCell(pos.lat, pos.lon);
    expect(c).not.toEqual(pos);
    expect(Math.abs(c.lat - pos.lat)).toBeLessThan(0.01);
    expect(roundToCell(c.lat, c.lon)).toEqual(c);
    expect(roundToCell(47.87231, 12.11891)).toEqual(c);
  });
});

describe("currentFindSpot", () => {
  const nav = (state: PermissionState) =>
    ({
      permissions: { query: async () => ({ state }) },
      geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: pos.lat, longitude: pos.lon } } as GeolocationPosition) },
    }) as unknown as Navigator;

  it("only with consent and an allowed location", async () => {
    expect(await currentFindSpot(null, nav("granted"))).toBeNull();
    expect(await currentFindSpot(false, nav("granted"))).toBeNull();
    expect(await currentFindSpot(true, nav("prompt"))).toBeNull();
    expect(await currentFindSpot(true, nav("granted"))).toEqual(roundToCell(pos.lat, pos.lon));
  });
});
