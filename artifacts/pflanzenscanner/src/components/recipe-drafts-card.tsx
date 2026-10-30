import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Check, Loader2, X } from "lucide-react";
import {
  getListFeedRecipeDraftsQueryKey,
  getListFeedRecipesQueryKey,
  useApproveFeedRecipe,
  useListFeedRecipeDrafts,
  useRejectFeedRecipe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { RECIPE_KIND_LABELS } from "@/lib/feed-labels";

/** App owner: recipes sent in for the Futterplaner, shown to everyone only after approval here. */
export function RecipeDraftsCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const drafts = useListFeedRecipeDrafts();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListFeedRecipeDraftsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListFeedRecipesQueryKey() }),
    ]);
  const approve = useApproveFeedRecipe({
    mutation: {
      onSuccess: (r) => {
        toast({ title: `„${r.title}“ freigegeben`, description: "Alle sehen es jetzt im Futterplaner." });
        void refresh();
      },
      onError: () => toast({ title: "Nicht freigegeben", variant: "destructive" }),
    },
  });
  const reject = useRejectFeedRecipe({ mutation: { onSuccess: () => void refresh(), onError: () => toast({ title: "Nicht abgelehnt", variant: "destructive" }) } });
  const list = drafts.data ?? [];
  const busy = approve.isPending || reject.isPending;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BookOpen className="h-4 w-4 text-primary" />
        Futter-Rezepte zur Freigabe
        {list.length > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{list.length}</span>}
      </h2>
      {drafts.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Rezepte. Sie entstehen, wenn jemand im Futterplaner ein Rezept vorschlägt.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">
                {r.title}{" "}
                <span className="font-normal text-muted-foreground">
                  · {RECIPE_KIND_LABELS[r.kind]} · {r.species.map((s) => SPECIES_LABELS[s]).join(", ")}
                </span>
              </p>
              {r.flags.length > 0 && (
                <ul role="alert" className="space-y-1 rounded-lg border-2 border-red-600 bg-red-50 p-2 text-xs text-red-950 dark:bg-red-950/40 dark:text-red-100">
                  {r.flags.map((f) => (
                    <li key={f} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs">
                <span className="text-muted-foreground">Zutaten:</span> {r.ingredients.map((i) => `${i.name}${i.amount ? ` (${i.amount})` : ""}`).join(", ")}
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-xs">
                {r.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {r.hygiene.length > 0 && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Hygiene:</span> {r.hygiene.join(" · ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Bitte auf Giftpflanzen, Küchenreste und Hygiene prüfen – nach der Freigabe sehen es alle.</p>
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => approve.mutate({ recipeId: r.id })}>
                  <Check className="h-4 w-4" />
                  Freigeben
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={() => reject.mutate({ recipeId: r.id })}>
                  <X className="h-4 w-4" />
                  Ablehnen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
