import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBackfillPlantMedicinalReview } from "@workspace/api-client-react";
import { useAuthContext } from "@/lib/auth-context";

const MAX_BATCHES = 40;
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 1500;

function getIsOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// Owner-only background review of stored "medicinal" plants against current
// phytotherapy standards. Plants no longer recommended as medicinal herbs
// (e.g. Gewöhnlicher Wurmfarn) are reclassified to "poisonous" or "edible".
// Idempotent: each plant is reviewed exactly once (server-side marker).
// Runs unconditionally (no gate) since it is independent of other backfills.
export function useMedicinalReviewBackfill(): void {
  const { user } = useAuthContext();
  const isOwner = !!user?.isOwner;
  const queryClient = useQueryClient();
  const backfill = useBackfillPlantMedicinalReview();
  const doneRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isOwner || doneRef.current || runningRef.current || !getIsOnline())
      return;
    runningRef.current = true;

    let cancelled = false;
    void (async () => {
      let failures = 0;
      for (let i = 0; i < MAX_BATCHES && !cancelled; i++) {
        try {
          const result = await backfill.mutateAsync();
          if (cancelled) return;
          if (result.reclassified > 0) {
            void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
          }
          if (result.done) {
            doneRef.current = true;
            return;
          }
          if (result.processed === 0) {
            if (++failures >= MAX_FAILURES) return;
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          } else {
            failures = 0;
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
  }, [isOwner]);
}
