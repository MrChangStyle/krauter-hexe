import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { getGetDashboardQueryKey, useSetDashboard } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { WIDGETS, moveWidget, toggleWidget, widgetsOf, type WidgetArea, type WidgetId } from "@/lib/dashboard";

const AREAS: { area: WidgetArea; label: string }[] = [
  { area: "pflanzen", label: "Pflanzen" },
  { area: "tiere", label: "Tiere" },
];

/** "Dashboard anpassen": switch widgets on and off and put them in order, per area. */
export function DashboardEditor({
  layout,
  available,
  onClose,
}: {
  layout: WidgetId[];
  /** Widgets this build offers (Grow can be left out). */
  available: (id: WidgetId) => boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<WidgetId[]>(layout);
  const save = useSetDashboard({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetDashboardQueryKey(), data);
        onClose();
      },
      onError: () => toast({ title: "Nicht gespeichert", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard anpassen</DialogTitle>
          <DialogDescription>Wähle, was du auf der Hof-Seite sehen willst, und in welcher Reihenfolge.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {AREAS.map(({ area, label }) => {
            const on = widgetsOf(draft, area);
            const off = WIDGETS.filter((w) => w.area === area && available(w.id) && !draft.includes(w.id));
            return (
              <section key={area} className="space-y-2" data-testid={`editor-${area}`}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
                <ul className="divide-y rounded-xl border">
                  {[...on, ...off].map((w) => {
                    const k = on.indexOf(w);
                    const shown = k >= 0;
                    return (
                      <li key={w.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-medium ${shown ? "" : "text-muted-foreground"}`}>{w.title}</span>
                          <span className="block text-xs text-muted-foreground">{w.description}</span>
                        </span>
                        {shown && (
                          <>
                            <button
                              type="button"
                              aria-label={`${w.title} nach oben`}
                              disabled={k === 0}
                              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                              onClick={() => setDraft(moveWidget(draft, w.id, -1))}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={`${w.title} nach unten`}
                              disabled={k === on.length - 1}
                              className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                              onClick={() => setDraft(moveWidget(draft, w.id, 1))}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <Switch checked={shown} aria-label={`${w.title} anzeigen`} onCheckedChange={() => setDraft(toggleWidget(draft, w.id))} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <button type="button" className="text-xs text-muted-foreground underline" disabled={save.isPending} onClick={() => save.mutate({ data: { widgets: null } })}>
            Standard wiederherstellen
          </button>
          <Button disabled={save.isPending} onClick={() => save.mutate({ data: { widgets: draft } })}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
