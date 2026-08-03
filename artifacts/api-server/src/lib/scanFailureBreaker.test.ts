/**
 * Unit tests for the scan cost brake. Every case injects its own clock, so no
 * test depends on wall-clock timing.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  checkScanBrake,
  photoFingerprint,
  recordScanAbort,
  recordScanFailure,
  recordScanSuccess,
  resetScanBrake,
  MAX_PHOTO_FAILURES,
  MAX_PHOTO_ABORTS,
  MAX_GLOBAL_FAILURES,
  ABORT_BLOCK_MS,
  PHOTO_BLOCK_MS,
  GLOBAL_BLOCK_MS,
  GLOBAL_WINDOW_MS,
} from "./scanFailureBreaker";

const T0 = 1_700_000_000_000;

beforeEach(() => {
  resetScanBrake();
});

describe("per-photo brake", () => {
  it("allows the first attempt for an unknown photo", () => {
    expect(checkScanBrake("plant", "photo-a", T0)).toEqual({ blocked: false });
  });

  it("allows attempts up to the limit, then blocks", () => {
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      expect(checkScanBrake("plant", "photo-a", T0 + i).blocked).toBe(false);
      recordScanFailure("plant", "photo-a", T0 + i);
    }

    const result = checkScanBrake("plant", "photo-a", T0 + MAX_PHOTO_FAILURES);
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toBe("photo");
  });

  it("does not block a different photo", () => {
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", "photo-a", T0);
    }
    expect(checkScanBrake("plant", "photo-b", T0).blocked).toBe(false);
  });

  it("reports how long the caller has to wait", () => {
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", "photo-a", T0);
    }
    const result = checkScanBrake("plant", "photo-a", T0 + 60_000);
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.retryAfterMs).toBe(PHOTO_BLOCK_MS - 60_000);
  });

  it("grants a fresh set of attempts once the block has been served", () => {
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", "photo-a", T0);
    }
    expect(checkScanBrake("plant", "photo-a", T0 + PHOTO_BLOCK_MS).blocked).toBe(false);
    // ...and the counter really was cleared, not just skipped once.
    recordScanFailure("plant", "photo-a", T0 + PHOTO_BLOCK_MS);
    expect(checkScanBrake("plant", "photo-a", T0 + PHOTO_BLOCK_MS).blocked).toBe(false);
  });

  it("forgets a photo's failures after a success", () => {
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", "photo-a", T0);
    }
    recordScanSuccess("plant", "photo-a");
    expect(checkScanBrake("plant", "photo-a", T0).blocked).toBe(false);
  });

  it("tracks a photo across scopes by its key, not per endpoint", () => {
    // A photo key is unique to one captured photo, so its history follows it.
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", "photo-a", T0);
    }
    expect(checkScanBrake("insect", "photo-a", T0).blocked).toBe(true);
  });

  it("never blocks when the request carries no photo identity", () => {
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", null, T0);
    }
    expect(checkScanBrake("plant", null, T0).blocked).toBe(false);
  });
});

describe("global brake", () => {
  it("trips after enough failures across different photos", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0 + i);
    }
    const result = checkScanBrake("plant", "brand-new-photo", T0 + MAX_GLOBAL_FAILURES);
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.reason).toBe("global");
  });

  it("blocks even a photo with no failures of its own", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0);
    }
    expect(checkScanBrake("plant", null, T0).blocked).toBe(true);
  });

  it("releases after the block window", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0);
    }
    expect(checkScanBrake("plant", "x", T0 + GLOBAL_BLOCK_MS).blocked).toBe(false);
  });

  it("does not trip on failures spread outside the window", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES * 2; i += 1) {
      // One failure per window: the sliding window never accumulates.
      recordScanFailure("plant", `photo-${i}`, T0 + i * (GLOBAL_WINDOW_MS + 1));
    }
    const last = T0 + (MAX_GLOBAL_FAILURES * 2 - 1) * (GLOBAL_WINDOW_MS + 1);
    expect(checkScanBrake("plant", "x", last).blocked).toBe(false);
  });

  it("does not immediately re-trip on the first failure after release", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0);
    }
    const after = T0 + GLOBAL_BLOCK_MS;
    recordScanFailure("plant", "photo-new", after);
    expect(checkScanBrake("plant", "another", after).blocked).toBe(false);
  });

  it("is cleared by a successful scan in the same scope", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0);
    }
    recordScanSuccess("plant", "photo-0");
    expect(checkScanBrake("plant", "x", T0).blocked).toBe(false);
  });
});

describe("global brake is isolated per scope", () => {
  it("does not pause insect scans when plant scans are failing", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0);
    }
    expect(checkScanBrake("plant", "p", T0).blocked).toBe(true);
    expect(checkScanBrake("insect", "i", T0).blocked).toBe(false);
  });

  it("is NOT lifted by a success in the other scope", () => {
    // The regression this guards: an insect scan succeeding would otherwise
    // cancel the plant pause, letting a broken plant path burn AI calls again.
    for (let i = 0; i < MAX_GLOBAL_FAILURES; i += 1) {
      recordScanFailure("plant", `photo-${i}`, T0);
    }
    recordScanSuccess("insect", "some-insect-photo");
    expect(checkScanBrake("plant", "p", T0).blocked).toBe(true);
  });

  it("counts each scope's failures separately", () => {
    // Just under the limit on each side must not trip either brake.
    for (let i = 0; i < MAX_GLOBAL_FAILURES - 1; i += 1) {
      recordScanFailure("plant", `plant-${i}`, T0);
      recordScanFailure("insect", `insect-${i}`, T0);
    }
    expect(checkScanBrake("plant", "p", T0).blocked).toBe(false);
    expect(checkScanBrake("insect", "i", T0).blocked).toBe(false);
  });
});

describe("photoFingerprint", () => {
  it("is stable for the same image", () => {
    expect(photoFingerprint("data:image/png;base64,AAA")).toBe(
      photoFingerprint("data:image/png;base64,AAA"),
    );
  });

  it("differs for different images", () => {
    expect(photoFingerprint("data:image/png;base64,AAA")).not.toBe(
      photoFingerprint("data:image/png;base64,BBB"),
    );
  });

  it("gives an old client without localImageId per-photo protection", () => {
    const key = photoFingerprint("data:image/png;base64,AAA");
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", key, T0);
    }
    expect(checkScanBrake("plant", key, T0).blocked).toBe(true);
  });
});

describe("aborted attempts", () => {
  it("does not block a photo for a few aborts", () => {
    for (let i = 0; i < MAX_PHOTO_ABORTS - 1; i += 1) {
      recordScanAbort("photo-a", T0);
    }
    expect(checkScanBrake("plant", "photo-a", T0).blocked).toBe(false);
  });

  it("pauses a photo that keeps getting aborted", () => {
    for (let i = 0; i < MAX_PHOTO_ABORTS; i += 1) {
      recordScanAbort("photo-a", T0);
    }
    const result = checkScanBrake("plant", "photo-a", T0);
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toBe("aborts");
      expect(result.retryAfterMs).toBe(ABORT_BLOCK_MS);
    }
  });

  it("tolerates more aborts than real failures", () => {
    // A dropped connection outdoors is normal; a 5xx is not.
    expect(MAX_PHOTO_ABORTS).toBeGreaterThan(MAX_PHOTO_FAILURES);
  });

  it("releases the photo again after the shorter abort pause", () => {
    for (let i = 0; i < MAX_PHOTO_ABORTS; i += 1) {
      recordScanAbort("photo-a", T0);
    }
    expect(checkScanBrake("plant", "photo-a", T0 + ABORT_BLOCK_MS).blocked).toBe(false);
    // The counter was cleared, so one more abort must not re-block immediately.
    recordScanAbort("photo-a", T0 + ABORT_BLOCK_MS);
    expect(checkScanBrake("plant", "photo-a", T0 + ABORT_BLOCK_MS).blocked).toBe(false);
  });

  it("never trips the global brake, so other users keep scanning", () => {
    for (let i = 0; i < MAX_GLOBAL_FAILURES * 3; i += 1) {
      recordScanAbort(`photo-${i}`, T0);
    }
    expect(checkScanBrake("plant", "fresh-photo", T0).blocked).toBe(false);
  });

  it("does not affect a different photo", () => {
    for (let i = 0; i < MAX_PHOTO_ABORTS; i += 1) {
      recordScanAbort("photo-a", T0);
    }
    expect(checkScanBrake("plant", "photo-b", T0).blocked).toBe(false);
  });

  it("is forgotten after the photo finally succeeds", () => {
    for (let i = 0; i < MAX_PHOTO_ABORTS; i += 1) {
      recordScanAbort("photo-a", T0);
    }
    recordScanSuccess("plant", "photo-a");
    expect(checkScanBrake("plant", "photo-a", T0).blocked).toBe(false);
  });

  it("ignores aborts when the request carries no photo identity", () => {
    for (let i = 0; i < MAX_PHOTO_ABORTS * 2; i += 1) {
      recordScanAbort(null, T0);
    }
    expect(checkScanBrake("plant", null, T0).blocked).toBe(false);
  });

  it("keeps counting real failures alongside aborts", () => {
    recordScanAbort("photo-a", T0);
    for (let i = 0; i < MAX_PHOTO_FAILURES; i += 1) {
      recordScanFailure("plant", "photo-a", T0);
    }
    const result = checkScanBrake("plant", "photo-a", T0);
    expect(result.blocked).toBe(true);
    // The harder failure brake wins, and its block is the longer one.
    if (result.blocked) expect(result.reason).toBe("photo");
  });
});
