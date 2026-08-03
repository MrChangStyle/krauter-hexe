import { useEffect, useRef } from "react";
import { useListPlants } from "@workspace/api-client-react";
import { plantImageUrl } from "@/lib/image";

/**
 * Keeps the offline cache complete. While the device is online it fetches every
 * plant photo once so the service worker's image cache holds *all* scanned
 * plants - not just the ones the user happened to open. The plant list itself is
 * fetched here too, which warms the data cache. Combined with the service
 * worker's offline caching, this makes the full archive and categories readable
 * with no connection.
 *
 * The plant list is loaded via React Query and shared with the archive/category
 * pages (same query key), so this adds no duplicate data request.
 */
export function useOfflineWarmup(): void {
  const { data: plants } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });
  const warmed = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!plants || plants.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    let cancelled = false;

    void (async () => {
      for (const plant of plants) {
        if (cancelled) break;
        if (warmed.current.has(plant.id)) continue;
        try {
          // The service worker (CacheFirst) stores the response, so once this
          // succeeds the photo is available offline. If it's already cached,
          // this resolves from the cache without hitting the network.
          const res = await fetch(plantImageUrl(plant.id));
          if (res.ok) warmed.current.add(plant.id);
        } catch {
          // Offline or a transient failure: try again on a later run.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plants]);
}
