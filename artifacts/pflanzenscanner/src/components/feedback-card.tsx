import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageCircle, Mic, RotateCcw, Trash2 } from "lucide-react";
import { getListFeedbackQueryKey, useDeleteFeedback, useListFeedback, useMarkFeedback, type FeedbackList } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** Verwaltung → Feedback (docs/feedback.md): what testers sent from the speech bubble. */
export function FeedbackCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useListFeedback();
  const done = {
    onSuccess: (data: FeedbackList) => queryClient.setQueryData(getListFeedbackQueryKey(), data),
    onError: () => toast({ title: "Das hat nicht geklappt", description: "Bitte versuche es noch einmal.", variant: "destructive" }),
  };
  const mark = useMarkFeedback({ mutation: done });
  const remove = useDeleteFeedback({ mutation: done });
  const items = list.data?.items ?? [];

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="feedback-card">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageCircle className="h-4 w-4 text-primary" />
        Feedback
        {!!list.data?.unread && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{list.data.unread} neu</span>}
      </h2>
      {list.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch kein Feedback. Testnutzer schicken es über die Sprechblase unten rechts in der App.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className={cn("rounded-lg border p-3 text-sm", !f.readAt && "border-primary/50 bg-primary/5")}>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{f.author}</span>
                {f.email && <a href={`mailto:${f.email}`} className="underline underline-offset-2">{f.email}</a>}
                <span>{when(f.createdAt)}</span>
                {f.page && <span className="rounded bg-muted px-1.5 font-mono">{f.page}</span>}
                {f.voice && (
                  <span className="inline-flex items-center gap-0.5" title="Per Spracheingabe – kann Hörfehler enthalten">
                    <Mic className="h-3 w-3" /> gesprochen
                  </span>
                )}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{f.text}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={mark.isPending} onClick={() => mark.mutate({ feedbackId: f.id, data: { read: !f.readAt } })}>
                  {f.readAt ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {f.readAt ? "Ungelesen" : "Gelesen"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-destructive"
                  disabled={remove.isPending}
                  onClick={() => window.confirm("Dieses Feedback löschen?") && remove.mutate({ feedbackId: f.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Löschen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
