import { beforeEach, describe, expect, it, vi } from "vitest";

// Node test environment: provide the two browser globals the module uses.
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});
vi.stubGlobal("window", {
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

const stored = new Set<string>();
vi.mock("@/lib/image-store", () => ({
  hasImage: vi.fn(async (id: string) => stored.has(id)),
  getImage: vi.fn(async (id: string) => (stored.has(id) ? `data:${id}` : null)),
  deleteImage: vi.fn(async (id: string) => void stored.delete(id)),
}));

const { getMyPhotoId, recordScanPhoto, resolvePhotoChoice } = await import("./my-photos");

function choices() {
  return JSON.parse(storage.get("lf-my-photos-v1") ?? "{}").choices ?? [];
}

beforeEach(() => {
  storage.clear();
  stored.clear();
});

describe("my photos", () => {
  it("takes the first scan's photo as the user's photo", async () => {
    stored.add("a");
    await recordScanPhoto({ kind: "plant", id: 1, newLocalId: "a" });
    expect(getMyPhotoId("plant", 1)).toBe("a");
    expect(choices()).toHaveLength(0);
  });

  it("asks for a choice on a repeat scan and deletes the photo not kept", async () => {
    stored.add("a");
    await recordScanPhoto({ kind: "plant", id: 1, newLocalId: "a" });
    stored.add("b");
    await recordScanPhoto({ kind: "plant", id: 1, newLocalId: "b" });
    expect(choices()).toHaveLength(1);
    expect(getMyPhotoId("plant", 1)).toBe("a");

    await resolvePhotoChoice("plant", 1, "new");
    expect(getMyPhotoId("plant", 1)).toBe("b");
    expect(stored.has("a")).toBe(false);
    expect(choices()).toHaveLength(0);
  });

  it("uses this device's photo of an older scan as the old photo", async () => {
    stored.add("legacy");
    stored.add("b");
    await recordScanPhoto({ kind: "insect", id: 7, newLocalId: "b", fallbackOldId: "legacy" });
    expect(choices()).toHaveLength(1);
    await resolvePhotoChoice("insect", 7, "old");
    expect(getMyPhotoId("insect", 7)).toBe("legacy");
    expect(stored.has("b")).toBe(false);
  });

  it("needs no choice when the old photo is no longer on the device", async () => {
    stored.add("b");
    await recordScanPhoto({ kind: "plant", id: 2, newLocalId: "b", fallbackOldId: "gone" });
    expect(getMyPhotoId("plant", 2)).toBe("b");
    expect(choices()).toHaveLength(0);
  });
});
