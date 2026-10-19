import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sprout, Trash2 } from "lucide-react";
import {
  getGetGardenCatalogQueryKey,
  getListCropDraftsQueryKey,
  useApproveCropDraft,
  useGetGardenCatalog,
  useListCropDrafts,
  useRejectCropDraft,
  type Crop,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MONTHS } from "@/lib/garden-calendar";

const FEEDER = { heavy: "Starkzehrer", medium: "Mittelzehrer", light: "Schwachzehrer" } as const;
const LIGHT = { full: "volle Sonne", partial: "Halbschatten", shade: "Schatten" } as const;

const weeks = (r: Crop["sowIndoor"]) => (r ? `${r.from >= 0 ? "+" : ""}${r.from} bis ${r.to >= 0 ? "+" : ""}${r.to} Wochen` : "–");

/** App owner: AI drafts of Anbaudaten, approved here before they count for everyone. */
export function CropDraftsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const drafts = useListCropDrafts();
  const catalog = useGetGardenCatalog();
  const names = (keys: string[]) => keys.map((k) => catalog.data?.find((c) => c.key === k)?.name ?? k).join(", ") || "–";
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListCropDraftsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetGardenCatalogQueryKey() }),
    ]);
  const approve = useApproveCropDraft({
    mutation: {
      onSuccess: (d) => {
        toast({ title: `${d.crop.name} freigegeben`, description: "Gilt ab jetzt für alle Beete." });
        void refresh();
      },
      onError: () => toast({ title: "Nicht freigegeben", variant: "destructive" }),
    },
  });
  const reject = useRejectCropDraft({ mutation: { onSuccess: () => void refresh(), onError: () => toast({ title: "Nicht verworfen", variant: "destructive" }) } });
  const list = drafts.data ?? [];
  const busy = approve.isPending || reject.isPending;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sprout className="h-4 w-4 text-primary" />
        Anbaudaten-Entwürfe
        {list.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{list.length}</span>}
      </h2>
      {drafts.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Entwürfe. Sie entstehen, wenn jemand im Beet-Architekt eine fehlende Pflanze per KI anfragt.</p>
      ) : (
        <ul className="space-y-3">
          {list.map(({ crop }) => (
            <li key={crop.key} className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">
                {crop.name} <span className="font-normal italic text-muted-foreground">{crop.botanicalName}</span>
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Familie</dt>
                <dd>
                  {crop.family} · {FEEDER[crop.feeder]}
                </dd>
                <dt className="text-muted-foreground">Abstand</dt>
                <dd>
                  {crop.spacingCm} cm, Reihe {crop.rowSpacingCm} cm · {LIGHT[crop.light]} · {crop.frostHardy ? "frosthart" : "frostempfindlich"}
                </dd>
                <dt className="text-muted-foreground">Vorziehen</dt>
                <dd>{weeks(crop.sowIndoor)}</dd>
                <dt className="text-muted-foreground">Direktsaat</dt>
                <dd>{weeks(crop.directSow)}</dd>
                <dt className="text-muted-foreground">Auspflanzen</dt>
                <dd>{weeks(crop.plantOut)}</dd>
                <dt className="text-muted-foreground">Ernte</dt>
                <dd>
                  {MONTHS[crop.harvest.from - 1]} bis {MONTHS[crop.harvest.to - 1]}
                </dd>
                <dt className="text-muted-foreground">Gut neben</dt>
                <dd>{names(crop.good)}</dd>
                <dt className="text-muted-foreground">Schlecht neben</dt>
                <dd>{names(crop.bad)}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">Wochen relativ zum letzten Frost. Bitte prüfen – nach der Freigabe rechnet der Planer mit diesen Werten.</p>
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => approve.mutate({ key: crop.key })}>
                  <Check className="h-4 w-4" />
                  Freigeben
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={() => reject.mutate({ key: crop.key })}>
                  <Trash2 className="h-4 w-4" />
                  Verwerfen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
