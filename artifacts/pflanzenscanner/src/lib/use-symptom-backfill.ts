import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBackfillPlantSymptoms } from "@workspace/api-client-react";
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

// Owner-only background fill of the treatable-symptom tags for plants scanned
// before the "Kräuter-Hexe" feature existed. The endpoint is idempotent and
// processes a small batch per call, so this simply loops until the server
// reports it is done. When plants get filled, the shared plant list is
// invalidated so the Kräuter-Hexe symptom filter picks up the new tags.
//
// It runs when the owner is online, and re-attempts if connectivity returns
// mid-session, but never runs again once the backfill has reported "done".
//
// `enabled` gates the start on the animal backfill having finished: symptom
// generation reads the per-animal benefit texts, so running it before those are
// filled would produce empty tags that get permanently marked "done".
export function useSymptomBackfill(enabled: boolean): void {
  const { user } = useAuthContext();
  const isOwner = !!user?.isOwner;
  const queryClient = useQueryClient();
  const backfill = useBackfillPlantSymptoms();
  const doneRef = useRef(false);
  const runningRef = useRef(false);
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
    // Skip until the animal backfill has finished (enabled), and if not the
    // owner, already finished, currently running, or offline.
    // Re-running when isOnline flips back to true covers the reconnect case.
    if (!enabled || !isOwner || doneRef.current || runningRef.current || !isOnline)
      return;
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
    });

    return () => {
      cancelled = true;
    };
    // mutateAsync/queryClient are stable; doneRef/runningRef guard against
    // duplicate and post-completion runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, isOnline, enabled]);
}
