import { useEffect, useState } from "react";

/**
 * Returns the current timestamp (epoch ms) and re-renders every `intervalMs`
 * milliseconds so consumers stay accurate without a manual refresh.
 * Default interval: 60 s (enough for per-minute staleness checks).
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
