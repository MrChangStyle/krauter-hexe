import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBackfillPlantAnimals } from "@workspace/api-client-react";
import { useAuthContext } from "@/lib/auth-context";

// Safety caps so the loop can never run away: at most this many batches per
// attempt, and it gives up after a few unproductive rounds in a row (e.g. the
// AI keeps failing) instead of hammering the server.
const MAX_BATCHES = 40;
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 1500;

function getIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// Owner-only background fill of the per-animal fact sheets for plants scanned
// before the "Status Tiere" feature existed. The endpoint is idempotent and
// processes a small batch per call, so this simply loops until the server
// reports it is done. When plants get filled, the shared plant list is
// invalidated so open detail pages pick up the new animal data.
//
// It runs when the owner is online, and re-attempts if connectivity returns
// mid-session, but never runs again once the backfill has reported "done".
//
// Returns whether the backfill loop has finished for this session (either it
// reported "done" or it gave up/exhausted its batches). The symptom backfill
// waits for this so it never generates symptoms from animal fact sheets that
// have not been filled yet - otherwise it could write empty horse (etc.) tags
// and mark the row "done" before the per-animal benefits exist.
export function useAnimalBackfill(): boolean {
  const { user } = useAuthContext();
  const isOwner = !!user?.isOwner;
  const queryClient = useQueryClient();
  const backfill = useBackfillPlantAnimals();
  const doneRef = useRef(false);
  const runningRef = useRef(false);
  const [finished, setFinished] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(getIsOnline());

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    // Skip if not the owner, already finished, currently running, or offline.
    // Re-running when isOnline flips back to true covers the reconnect case.
    if (!isOwner || doneRef.current || runningRef.current || !isOnline) return;
    runningRef.current = true;

    let cancelled = false;
    void (async () => {
      let failures = 0;
      for (let i = 0; i < MAX_BATCHES && !cancelled; i++) {
        try {
          const result = await backfill.mutateAsync();
          if (cancelled) return;
          if (result.processed > 0) {
            failures = 0; // progress made: reset the give-up counter
            void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
          }
          if (result.done) {
            doneRef.current = true;
            return;
          }
          if (result.processed === 0) {
            // Not done but nothing filled = the remaining plants keep failing to
            // generate; back off and stop after a few tries to avoid a tight loop.
            if (++failures >= MAX_FAILURES) return;
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        } catch {
          if (++failures >= MAX_FAILURES) return;
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    })().finally(() => {
      runningRef.current = false;
      // Signal the symptom backfill it may start: whether we finished cleanly
      // or gave up, whatever animal fact sheets could be filled now are.
      if (!cancelled) setFinished(true);
    });

    return () => {
      cancelled = true;
    };
    // mutateAsync/queryClient are stable; doneRef/runningRef guard against
    // duplicate and post-completion runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, isOnline]);

  // Non-owners never run the backfill, so the symptom backfill (also owner-only)
  // is free to proceed - report finished immediately for them.
  return finished || !isOwner;
}
