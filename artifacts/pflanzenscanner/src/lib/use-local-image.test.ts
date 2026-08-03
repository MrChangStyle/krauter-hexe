// @vitest-environment jsdom
/**
 * Tests for the useLocalImage hook.
 *
 * Key correctness invariants:
 *  1. Legacy rows (no localImageId): always show legacyUrl, including when
 *     legacyUrl changes asynchronously after the initial render (data load).
 *  2. Community shortcut (localImageId=undefined, legacyUrl=""): always returns
 *     the placeholder immediately — no IndexedDB access, isPlaceholder=true.
 *  3. New rows (localImageId set, IndexedDB hit): show the data URL, isPlaceholder=false.
 *  4. New rows (localImageId set, IndexedDB miss): show placeholder, isPlaceholder=true.
 *  5. Switching between records — hook re-runs cleanly.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLocalImage } from "@/lib/use-local-image";

// Mock the IndexedDB image store so tests never touch real storage.
vi.mock("@/lib/image-store", () => ({
  getImage: vi.fn(),
}));

import { getImage } from "@/lib/image-store";
const mockGetImage = getImage as ReturnType<typeof vi.fn>;

const PLACEHOLDER = "/placeholders/plant-edible.svg";

beforeEach(() => {
  mockGetImage.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. No localImageId (legacy rows) ──────────────────────────────────────

describe("useLocalImage – no localImageId (legacy rows)", () => {
  it("returns legacyUrl immediately when no localImageId is given", () => {
    const { result } = renderHook(() =>
      useLocalImage(undefined, "/api/plants/1/image", PLACEHOLDER),
    );
    expect(result.current.src).toBe("/api/plants/1/image");
    expect(result.current.isPlaceholder).toBe(false);
    expect(mockGetImage).not.toHaveBeenCalled();
  });

  it("returns legacyUrl when localImageId is null", () => {
    const { result } = renderHook(() =>
      useLocalImage(null, "/api/plants/2/image", PLACEHOLDER),
    );
    expect(result.current.src).toBe("/api/plants/2/image");
    expect(result.current.isPlaceholder).toBe(false);
    expect(mockGetImage).not.toHaveBeenCalled();
  });

  it("updates when legacyUrl changes (async data load scenario)", async () => {
    // Simulate: component mounts with empty legacyUrl (data not yet loaded),
    // then data arrives and legacyUrl becomes a real server URL.
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) => useLocalImage(undefined, url, PLACEHOLDER),
      { initialProps: { url: "" } },
    );

    // Initially no legacyUrl → placeholder
    expect(result.current.src).toBe(PLACEHOLDER);
    expect(result.current.isPlaceholder).toBe(true);

    rerender({ url: "/api/plants/5/image" });

    await waitFor(() => {
      expect(result.current.src).toBe("/api/plants/5/image");
      expect(result.current.isPlaceholder).toBe(false);
    });

    expect(mockGetImage).not.toHaveBeenCalled();
  });

  it("empty string localImageId is treated as absent — no IndexedDB lookup", () => {
    const { result } = renderHook(() =>
      useLocalImage("", "/api/plants/3/image", PLACEHOLDER),
    );
    expect(result.current.src).toBe("/api/plants/3/image");
    expect(result.current.isPlaceholder).toBe(false);
    expect(mockGetImage).not.toHaveBeenCalled();
  });
});

// ─── 2. Community shortcut (no localImageId, no legacyUrl) ─────────────────

describe("useLocalImage – community shortcut", () => {
  it("returns placeholder immediately with no IndexedDB call", () => {
    const { result } = renderHook(() =>
      useLocalImage(undefined, "", PLACEHOLDER),
    );
    expect(result.current.src).toBe(PLACEHOLDER);
    expect(result.current.isPlaceholder).toBe(true);
    expect(mockGetImage).not.toHaveBeenCalled();
  });

  it("null localImageId with empty legacyUrl also returns placeholder", () => {
    const { result } = renderHook(() =>
      useLocalImage(null, "", PLACEHOLDER),
    );
    expect(result.current.src).toBe(PLACEHOLDER);
    expect(result.current.isPlaceholder).toBe(true);
    expect(mockGetImage).not.toHaveBeenCalled();
  });
});

// ─── 3. localImageId present, IndexedDB hit ─────────────────────────────────

describe("useLocalImage – localImageId present, IndexedDB hit", () => {
  it("returns the data URL from IndexedDB when found, isPlaceholder=false", async () => {
    mockGetImage.mockResolvedValue("data:image/jpeg;base64,abc123");

    const { result } = renderHook(() =>
      useLocalImage("uuid-1", "/api/plants/10/image", PLACEHOLDER),
    );

    // Initial synchronous state is the placeholder while lookup runs.
    expect(result.current.src).toBe(PLACEHOLDER);
    expect(result.current.isPlaceholder).toBe(true);

    // After the async lookup the data URL is returned.
    await waitFor(() => {
      expect(result.current.src).toBe("data:image/jpeg;base64,abc123");
      expect(result.current.isPlaceholder).toBe(false);
    });
    expect(mockGetImage).toHaveBeenCalledWith("uuid-1");
  });
});

// ─── 4. localImageId present, IndexedDB miss ────────────────────────────────

describe("useLocalImage – localImageId present, IndexedDB miss", () => {
  it("returns placeholder when getImage returns null (no legacyUrl fallback for new rows)", async () => {
    mockGetImage.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useLocalImage("uuid-miss", "/api/plants/20/image", PLACEHOLDER),
    );

    await waitFor(() => {
      expect(result.current.src).toBe(PLACEHOLDER);
      expect(result.current.isPlaceholder).toBe(true);
    });
  });

  it("returns placeholder when getImage rejects", async () => {
    mockGetImage.mockRejectedValue(new Error("IDB unavailable"));

    const { result } = renderHook(() =>
      useLocalImage("uuid-err", "/api/plants/21/image", PLACEHOLDER),
    );

    await waitFor(() => {
      expect(result.current.src).toBe(PLACEHOLDER);
      expect(result.current.isPlaceholder).toBe(true);
    });
  });
});

// ─── 5. Switching between records ───────────────────────────────────────────

describe("useLocalImage – switching between records", () => {
  it("switches from local data URL to placeholder when localImageId is removed (new→legacy transition)", async () => {
    mockGetImage.mockResolvedValue("data:image/jpeg;base64,firstRecord");

    const { result, rerender } = renderHook(
      ({ id, url }: { id: string | undefined; url: string }) =>
        useLocalImage(id, url, PLACEHOLDER),
      { initialProps: { id: "uuid-a", url: "/api/plants/30/image" } },
    );

    await waitFor(() => {
      expect(result.current.src).toBe("data:image/jpeg;base64,firstRecord");
    });

    // Switch to a legacy record (no localImageId, but has legacyUrl).
    rerender({ id: undefined, url: "/api/plants/31/image" });

    await waitFor(() => {
      expect(result.current.src).toBe("/api/plants/31/image");
      expect(result.current.isPlaceholder).toBe(false);
    });
  });

  it("re-queries IndexedDB when localImageId changes to a new UUID", async () => {
    mockGetImage
      .mockResolvedValueOnce("data:image/jpeg;base64,first")
      .mockResolvedValueOnce("data:image/jpeg;base64,second");

    const { result, rerender } = renderHook(
      ({ id, url }: { id: string; url: string }) =>
        useLocalImage(id, url, PLACEHOLDER),
      { initialProps: { id: "uuid-a", url: "/api/plants/40/image" } },
    );

    await waitFor(() => {
      expect(result.current.src).toBe("data:image/jpeg;base64,first");
    });

    rerender({ id: "uuid-b", url: "/api/plants/41/image" });

    await waitFor(() => {
      expect(result.current.src).toBe("data:image/jpeg;base64,second");
      expect(result.current.isPlaceholder).toBe(false);
    });

    expect(mockGetImage).toHaveBeenCalledTimes(2);
    expect(mockGetImage).toHaveBeenNthCalledWith(1, "uuid-a");
    expect(mockGetImage).toHaveBeenNthCalledWith(2, "uuid-b");
  });

  it("resets to placeholder immediately on rerender before the new lookup resolves", async () => {
    let resolveSecond: (v: string | null) => void;
    const secondPromise = new Promise<string | null>((res) => {
      resolveSecond = res;
    });

    mockGetImage
      .mockResolvedValueOnce("data:image/jpeg;base64,first")
      .mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(
      ({ id, url }: { id: string; url: string }) =>
        useLocalImage(id, url, PLACEHOLDER),
      { initialProps: { id: "uuid-a", url: "/api/plants/50/image" } },
    );

    await waitFor(() => {
      expect(result.current.src).toBe("data:image/jpeg;base64,first");
    });

    // Switch records — the hook must reset to placeholder immediately.
    rerender({ id: "uuid-b", url: "/api/plants/51/image" });

    // Before the second lookup resolves we should see the placeholder.
    expect(result.current.src).toBe(PLACEHOLDER);
    expect(result.current.isPlaceholder).toBe(true);

    // Now resolve the second lookup.
    await act(async () => {
      resolveSecond!("data:image/jpeg;base64,second");
    });

    await waitFor(() => {
      expect(result.current.src).toBe("data:image/jpeg;base64,second");
      expect(result.current.isPlaceholder).toBe(false);
    });
  });
});
