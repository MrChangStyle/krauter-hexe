import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBackfillPlantToxicity } from "@workspace/api-client-react";
import { useAuthContext } from "@/lib/auth-context";

const MAX_BATCHES = 40;
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 1500;

function getIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// Owner-only background fill of the three-tier toxicity-level classifications
// (intolerant / poisonous / lethal) for plants scanned before the feature
// existed. The endpoint is idempotent and processes a small batch per call, so
// this simply loops until the server reports it is done.
//
// `enabled` gates the start on the symptom backfill having finished to avoid
// overlapping AI calls and keep server load bounded.
export function useToxicityBackfill(enabled: boolean): boolean {
  const { user } = useAuthContext();
  const isOwner = !!user?.isOwner;
  const queryClient = useQueryClient();
  const backfill = useBackfillPlantToxicity();
  const doneRef = useRef(false);
  const runningRef = useRef(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!enabled || !isOwner || doneRef.current || runningRef.current || !getIsOnline()) return;
    runningRef.current = true;

    let cancelled = false;
    void (async () => {
      let failures = 0;
      for (let i = 0; i < MAX_BATCHES && !cancelled; i++) {
        try {
          const result = await backfill.mutateAsync();
          if (cancelled) return;
          if (result.processed > 0) {
            failures = 0;
            void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
          }
          if (result.done) {
            doneRef.current = true;
            return;
          }
          if (result.processed === 0) {
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
      if (!cancelled) setFinished(true);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, enabled]);

  return finished || !isOwner;
}
