import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBackfillPlantSymptomApplications } from "@workspace/api-client-react";
import { useAuthContext } from "@/lib/auth-context";

const MAX_BATCHES = 40;
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 1500;

function getIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// Owner-only background fill of per-symptom application instructions for plants
// scanned before the feature existed. Idempotent, processes a small batch per
// call. Gated on `enabled` so it only starts once the symptom backfill is done
// (applications are derived from the already-stored symptom tags).
export function useSymptomApplicationsBackfill(enabled: boolean): void {
  const { user } = useAuthContext();
  const isOwner = !!user?.isOwner;
  const queryClient = useQueryClient();
  const backfill = useBackfillPlantSymptomApplications();
  const doneRef = useRef(false);
  const runningRef = useRef(false);

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
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, enabled]);
}
