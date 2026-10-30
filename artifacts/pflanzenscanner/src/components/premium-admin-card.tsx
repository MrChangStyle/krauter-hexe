import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, X } from "lucide-react";
import { getListPremiumQueryKey, useListPremium, useSetPremium } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { todayIso } from "@/lib/farm-labels";

const dayText = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** App owner: grant Premium per account by hand (until there are payments). */
export function PremiumAdminCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useListPremium();
  const [email, setEmail] = useState("");
  const [until, setUntil] = useState("");
  const set = useSetPremium({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getListPremiumQueryKey(), data);
        setEmail("");
        setUntil("");
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: (err as { data?: { error?: string } }).data?.error, variant: "destructive" }),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    set.mutate({ data: { email: email.trim(), active: true, until: until || null } });
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Crown className="h-4 w-4 text-primary" />
        Premium vergeben
      </h2>
      <p className="text-xs text-muted-foreground">Premium schaltet die KI im Grow frei (KI-Check). Bis es bezahlt werden kann, vergibst du es hier – ohne Ende oder bis zu einem Tag.</p>
      <form onSubmit={submit} className="space-y-2">
        <Input type="email" required aria-label="E-Mail des Kontos" placeholder="E-Mail des Kontos" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Bis (leer = ohne Ende)
            <Input type="date" min={todayIso()} value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <Button type="submit" disabled={set.isPending}>
            {set.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Vergeben
          </Button>
        </div>
      </form>
      {(list.data ?? []).length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {list.data!.map((u) => (
            <li key={u.email ?? u.username} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="block truncate">{u.email}</span>
                <span className={`block text-xs ${u.active ? "text-muted-foreground" : "text-destructive"}`}>
                  {!u.active ? "abgelaufen" : u.until ? `bis ${dayText(u.until)}` : "ohne Ende"}
                </span>
              </span>
              <button type="button" aria-label={`Premium für ${u.email} zurücknehmen`} className="text-muted-foreground hover:text-destructive" onClick={() => u.email && set.mutate({ data: { email: u.email, active: false } })}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
