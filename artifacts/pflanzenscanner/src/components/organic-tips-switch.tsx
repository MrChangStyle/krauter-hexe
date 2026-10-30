import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Leaf } from "lucide-react";
import { getGetSettingsQueryKey, useGetSettings, useSetSettings } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";

/**
 * Bio (docs/bio.md) for Pflanzendoc and Pflege-Guide: "Nur biologische
 * Empfehlungen" – off by default, then both organic and mineral advice as
 * before. A farm that works naturally or organically switches it on for its
 * members; that is changed under Farm & Team.
 */
export function OrganicTipsSwitch() {
  const queryClient = useQueryClient();
  const settings = useGetSettings();
  const save = useSetSettings({
    mutation: { onSuccess: (data) => queryClient.setQueryData(getGetSettingsQueryKey(), data) },
  });
  const s = settings.data;
  if (!s) return null;
  const byFarm = s.organicFarm !== null;
  return (
    <label className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm" data-testid="organic-tips">
      <span className="flex gap-2">
        <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <span className="block font-medium">Nur biologische Empfehlungen</span>
          <span className="block text-xs text-muted-foreground">
            {byFarm ? (
              <>
                Euer Hof „{s.organicFarm}“ wirtschaftet naturnah oder bio.{" "}
                <Link href="/team" className="underline">
                  Ändern unter Farm & Team
                </Link>
              </>
            ) : (
              "Aus: biologische und mineralische Tipps. An: nur Mittel und Dünger aus dem Ökolandbau."
            )}
          </span>
        </span>
      </span>
      <Switch
        checked={byFarm || s.organicTips}
        disabled={byFarm || save.isPending}
        aria-label="Nur biologische Empfehlungen"
        onCheckedChange={(on) => save.mutate({ data: { organicTips: on } })}
      />
    </label>
  );
}
