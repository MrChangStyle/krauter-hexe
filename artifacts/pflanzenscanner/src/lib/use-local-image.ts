/**
 * React hook that resolves a plant or insect image to a renderable src string,
 * along with an `isPlaceholder` flag indicating whether the returned src is a
 * category illustration rather than a real photo.
 *
 * ## Fallback chain (in priority order)
 *
 * 1. **`imageUrl`** (public https URL on the image CDN): used directly, no async
 *    lookup needed. Set for all scans stored on the CDN. Rows from before that
 *    switch may still hold an internal `/objects/...` path; those are ignored
 *    here because nothing can serve them any more, so the chain falls through
 *    to the device's own copy.
 *
 * 2. **`localImageId`** (IndexedDB UUID): async lookup in the device's local
 *    image store.  On miss, HEAD-checks `legacyUrl` as a server-side fallback
 *    (relevant for images backed up via the backup endpoint).
 *
 * 3. **`legacyUrl`** (e.g. `/api/plants/:id/image`): used directly for old rows
 *    that still carry server-stored `imageData` bytes.
 *
 * 4. **`placeholderUrl`**: category illustration SVG.
 *
 * ## Dependency note
 * All inputs are included in the effect dependency array so the hook
 * re-evaluates correctly when data loads asynchronously.
 */

import { useEffect, useState } from "react";
import { getImage } from "@/lib/image-store";

export interface LocalImageResult {
  /** A CDN URL, data URL, legacy server URL, or category placeholder URL. */
  src: string;
  /**
   * `true` when `src` is a category placeholder illustration rather than a
   * real photo. Use this to suppress lightbox zoom controls.
   */
  isPlaceholder: boolean;
}

/**
 * Only absolute http(s) URLs can be rendered directly. Values left over from
 * the old internal object storage (`/objects/...`) are treated as "no remote
 * image" so the hook falls back to the device's own copy instead of firing off
 * a request that can only 404.
 */
function remoteImageSrc(imageUrl: string | null | undefined): string | null {
  return typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl)
    ? imageUrl
    : null;
}

/**
 * @param localImageId  IndexedDB UUID (null/undefined for old rows or community view)
 * @param legacyUrl     Legacy server endpoint (e.g. "/pflanzenscanner/api/plants/1/image")
 * @param placeholderUrl Category SVG placeholder
 * @param imageUrl      Public CDN URL — highest priority
 */
export function useLocalImage(
  localImageId: string | null | undefined,
  legacyUrl: string,
  placeholderUrl: string,
  imageUrl?: string | null,
): LocalImageResult {
  /** Compute the correct value synchronously given the current inputs. */
  function resolveSync(): LocalImageResult {
    // 1. CDN URL (highest priority, synchronous)
    const remote = remoteImageSrc(imageUrl);
    if (remote) {
      return { src: remote, isPlaceholder: false };
    }
    // 2. Old row without IndexedDB: legacy server endpoint
    if (!localImageId) {
      return legacyUrl
        ? { src: legacyUrl, isPlaceholder: false }
        : { src: placeholderUrl, isPlaceholder: true };
    }
    // 3. New row with IndexedDB UUID: placeholder until async lookup completes
    return { src: placeholderUrl, isPlaceholder: true };
  }

  const [result, setResult] = useState<LocalImageResult>(resolveSync);

  useEffect(() => {
    // 1. CDN URL available — resolve immediately, no async needed.
    const remote = remoteImageSrc(imageUrl);
    if (remote) {
      setResult({ src: remote, isPlaceholder: false });
      return;
    }

    if (!localImageId) {
      // Old row or community shortcut: resolve immediately.
      setResult(
        legacyUrl
          ? { src: legacyUrl, isPlaceholder: false }
          : { src: placeholderUrl, isPlaceholder: true },
      );
      return;
    }

    // New row: reset to placeholder while the async lookup runs so any
    // previously displayed image from a different record is cleared.
    setResult({ src: placeholderUrl, isPlaceholder: true });

    let cancelled = false;
    getImage(localImageId)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) {
          // Image found in this device's IndexedDB.
          setResult({ src: dataUrl, isPlaceholder: false });
        } else {
          // IndexedDB miss on this device. The useImageBackup hook will upload
          // this photo to the CDN in the background; imageUrl will be set on the
          // next data fetch. Until then, show the category placeholder — do NOT
          // HEAD-check the legacy server URL (it always returns 404 now that
          // imageData is no longer stored in the database, and triggering 100+
          // parallel HEAD requests hurts performance).
          setResult({ src: placeholderUrl, isPlaceholder: true });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ src: placeholderUrl, isPlaceholder: true });
      });

    return () => {
      cancelled = true;
    };
  }, [localImageId, legacyUrl, placeholderUrl, imageUrl]);

  return result;
}
