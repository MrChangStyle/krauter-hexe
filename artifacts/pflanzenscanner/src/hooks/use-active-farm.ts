import { useEffect, useState } from "react";
import { useEnsureOwnFarm, type FarmSummary } from "@workspace/api-client-react";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";

/** The farm the farm pages show (created on first use, like /farm does); null while loading. */
export function useActiveFarm(): { farm: FarmSummary | null; failed: boolean } {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { farm: farms ? pickActiveFarm(farms, readActiveFarmId()) : null, failed: ensure.isError };
}
