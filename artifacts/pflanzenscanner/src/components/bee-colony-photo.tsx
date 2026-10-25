import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Trash2 } from "lucide-react";
import {
  getGetBeeColonyQueryKey,
  getGetBeeOverviewQueryKey,
  useRemoveBeeColonyPhoto,
  useSetBeeColonyPhoto,
  type BeeColony,
  type BeeColonyDetail,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downscaleFile } from "@/lib/image";

/** The photo of where a colony stands (docs/bienen.md) – on its hive card. */
export function BeeColonyPhoto({ farm, colony }: { farm: FarmSummary; colony: BeeColony }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const canWrite = farm.role !== "guest";
  const saved = {
    onSuccess(detail: BeeColonyDetail) {
      queryClient.setQueryData(getGetBeeColonyQueryKey(farm.id, colony.id), detail);
      void queryClient.invalidateQueries({ queryKey: getGetBeeOverviewQueryKey(farm.id) });
    },
    onError: (err: unknown) =>
      toast({ title: "Das Foto hat nicht geklappt", description: (err as { data?: { error?: string } } | null)?.data?.error ?? "", variant: "destructive" }),
  };
  const upload = useSetBeeColonyPhoto({ mutation: saved });
  const remove = useRemoveBeeColonyPhoto({ mutation: saved });
  const busy = preparing || upload.isPending || remove.isPending;

  if (!colony.photoUrl && !canWrite) return null;
  return (
    <section className="space-y-2" aria-label="Foto vom Standort">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="colony-photo-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setPreparing(true);
          try {
            upload.mutate({ farmId: farm.id, colonyId: colony.id, data: { imageData: await downscaleFile(file) } });
          } finally {
            setPreparing(false);
          }
        }}
      />
      {colony.photoUrl ? (
        <>
          <img src={colony.photoUrl} alt={`Standort von ${colony.name}`} className="max-h-64 w-full rounded-xl border border-border object-cover" />
          {canWrite && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Neues Foto
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                disabled={busy}
                onClick={() => window.confirm("Das Foto vom Standort entfernen?") && remove.mutate({ farmId: farm.id, colonyId: colony.id })}
              >
                <Trash2 className="h-4 w-4" />
                Entfernen
              </Button>
            </div>
          )}
        </>
      ) : (
        <Button variant="outline" className="w-full gap-1.5 border-dashed" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Foto vom Standort
        </Button>
      )}
    </section>
  );
}
