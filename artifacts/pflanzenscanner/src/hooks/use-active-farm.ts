import { useEffect, useState } from "react";
import { useEnsureOwnFarm, type FarmSummary } from "@workspace/api-client-react";
import { pickActiveFarm, readActiveFarmId, writeActiveFarmId } from "@/lib/active-farm";

/** The farm the farm pages show (created on first use, like /farm does); null while loading. */
export function useActiveFarm(): { farm: FarmSummary | null; farms: FarmSummary[] | null; failed: boolean; select: (id: number) => void } {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const [activeId, setActiveId] = useState(readActiveFarmId);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const select = (id: number) => {
    writeActiveFarmId(id);
    setActiveId(id);
  };
  return { farm: farms ? pickActiveFarm(farms, activeId) : null, farms, failed: ensure.isError, select };
}
