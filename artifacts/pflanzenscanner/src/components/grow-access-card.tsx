import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sprout, X } from "lucide-react";
import { getListGrowAccessQueryKey, useListGrowAccess, useSetGrowAccess } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

/** App owner: unlock the Grow add-on per account (until there are payments). */
export function GrowAccessCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useListGrowAccess();
  const [email, setEmail] = useState("");
  const set = useSetGrowAccess({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getListGrowAccessQueryKey(), data);
        setEmail("");
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: (err as { data?: { error?: string } }).data?.error, variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    set.mutate({ data: { email: email.trim(), unlocked: true } });
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Sprout className="h-4 w-4 text-primary" />
        Grow freischalten
      </h2>
      <p className="text-xs text-muted-foreground">Das Zusatzmodul ist nur für freigeschaltete Konten sichtbar; die Nutzer bestätigen danach selbst, dass sie volljährig sind.</p>
      <form onSubmit={submit} className="flex gap-2">
        <Input type="email" required aria-label="E-Mail des Kontos" placeholder="E-Mail des Kontos" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={set.isPending}>
          {set.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Freischalten
        </Button>
      </form>
      {(list.data ?? []).length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {list.data!.map((u) => (
            <li key={u.email ?? u.username} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">{u.email}</span>
              <button type="button" aria-label={`Freischaltung für ${u.email} zurücknehmen`} className="text-muted-foreground hover:text-destructive" onClick={() => u.email && set.mutate({ data: { email: u.email, unlocked: false } })}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
