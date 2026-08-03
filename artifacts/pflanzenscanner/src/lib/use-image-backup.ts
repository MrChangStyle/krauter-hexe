/**
 * Background hook that re-uploads locally-cached plant/insect photos to the
 * server so they are visible on all devices, not just the one that took the
 * photo.
 *
 * Runs once per session (tracked in sessionStorage). For each entry whose
 * image lives in IndexedDB, it calls the backup endpoint which uploads the
 * photo to GCS and stores the object path in image_url on the server.
 * The useLocalImage hook then resolves image_url first (GCS, sync, all devices)
 * so the photo appears everywhere, not just on the scanning device.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getImage } from "@/lib/image-store";

const SESSION_KEY = "image-backup-done-v1";
const BASE = () => (import.meta.env.BASE_URL as string).replace(/\/$/, "");

function loadDoneSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDoneSet(set: Set<string>): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
  } catch {
    // Storage full – best effort
  }
}

/**
 * Returns true when the server confirmed the image was newly stored in GCS
 * (i.e. response json contains { stored: true }).
 */
async function backupOneImage(
  type: "plant" | "insect",
  id: number,
  localImageId: string,
): Promise<boolean> {
  const dataUrl = await getImage(localImageId);
  if (!dataUrl) return false; // Not in this device's IndexedDB – nothing to backup

  const base = BASE();
  try {
    const res = await fetch(`${base}/api/${type}s/${id}/image/backup`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: dataUrl }),
    });
    if (!res.ok) return false;
    const json = await res.json() as { stored?: boolean };
    return json.stored === true;
  } catch {
    return false;
  }
}

/**
 * Accepts a list of plant or insect entries and, for each one whose photo
 * lives in the local IndexedDB, POSTs it to the server backup endpoint.
 * Already-backed-up entries (tracked per session) are skipped.
 *
 * @param entries  List from an API response – only entries with localImageId matter.
 * @param type     "plant" or "insect"
 */
export function useImageBackup(
  entries: Array<{ id: number; localImageId?: string | null }> | undefined,
  type: "plant" | "insect",
): void {
  // Initialise once per mount from sessionStorage so we don't re-upload
  // across rerenders, but do re-upload across full page loads in the same
  // browser session when the user explicitly reloads.
  const doneRef = useRef<Set<string>>(null!);
  if (!doneRef.current) doneRef.current = loadDoneSet();

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!entries?.length) return;

    let cancelled = false;
    const done = doneRef.current;

    const toProcess = entries.filter(
      (e) => e.localImageId && !done.has(`${type}-${e.id}`),
    );
    if (!toProcess.length) return;

    (async () => {
      let anyNewlyUploaded = false;
      for (const entry of toProcess) {
        if (cancelled) break;
        const key = `${type}-${entry.id}`;
        const stored = await backupOneImage(type, entry.id, entry.localImageId!);
        if (stored) anyNewlyUploaded = true;
        // Mark as processed regardless of outcome so we don't retry this
        // session. Failed uploads will be retried on the next page load.
        done.add(key);
        saveDoneSet(done);
      }
      // At least one image was newly uploaded to GCS. Invalidate all plant/
      // insect list queries so the UI refetches and gets the new imageUrl values,
      // making photos visible without a manual page reload.
      if (anyNewlyUploaded && !cancelled) {
        void queryClient.invalidateQueries({
          queryKey: type === "plant" ? ["/api/plants"] : ["/api/insects"],
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entries, type, queryClient]);
}
