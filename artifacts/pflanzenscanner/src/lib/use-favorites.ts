import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  listFavorites,
  addFavorite,
  removeFavorite,
  getListFavoritesQueryOptions,
} from "@workspace/api-client-react";

const FAVORITES_KEY = ["/api/favorites"] as const;

/**
 * Central hook for the current user's plant favourites.
 *
 * Returns:
 *  - `isFavorite(plantId)` — O(1) Set lookup.
 *  - `toggle(plantId)` — adds if absent, removes if present (optimistic).
 *  - `isLoading` / `isPending` — for disabling UI during network calls.
 */
export function useFavorites() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...getListFavoritesQueryOptions(),
    queryKey: FAVORITES_KEY,
    staleTime: 30_000,
  });

  const favoriteSet = new Set<number>(data?.plantIds ?? []);

  const add = useMutation({
    mutationFn: (plantId: number) => addFavorite(plantId),
    onMutate: async (plantId: number) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_KEY });
      const prev = queryClient.getQueryData<{ plantIds: number[] }>(FAVORITES_KEY);
      queryClient.setQueryData<{ plantIds: number[] }>(FAVORITES_KEY, (old) => ({
        plantIds: [...(old?.plantIds ?? []), plantId],
      }));
      return { prev };
    },
    onError: (_err, _plantId, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(FAVORITES_KEY, ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: (plantId: number) => removeFavorite(plantId),
    onMutate: async (plantId: number) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_KEY });
      const prev = queryClient.getQueryData<{ plantIds: number[] }>(FAVORITES_KEY);
      queryClient.setQueryData<{ plantIds: number[] }>(FAVORITES_KEY, (old) => ({
        plantIds: (old?.plantIds ?? []).filter((id) => id !== plantId),
      }));
      return { prev };
    },
    onError: (_err, _plantId, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(FAVORITES_KEY, ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FAVORITES_KEY });
    },
  });

  function toggle(plantId: number) {
    if (favoriteSet.has(plantId)) {
      remove.mutate(plantId);
    } else {
      add.mutate(plantId);
    }
  }

  return {
    isFavorite: (plantId: number) => favoriteSet.has(plantId),
    toggle,
    isLoading,
    isPending: add.isPending || remove.isPending,
  };
}
