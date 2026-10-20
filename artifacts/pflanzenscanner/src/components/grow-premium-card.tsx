import { Crown, Sparkles } from "lucide-react";
import { useGetPremium } from "@workspace/api-client-react";

const dayText = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** What is free in Grow and what Premium adds (the AI). */
export function GrowPremiumCard() {
  const premium = useGetPremium();
  const p = premium.data;
  if (!p) return null;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm" data-testid="grow-premium">
      <h2 className="flex items-center gap-2 font-semibold">
        <Crown className="h-4 w-4 text-primary" />
        {p.active ? "Premium aktiv" : "Kostenlos – Premium für die KI"}
      </h2>
      {p.active ? (
        <p className="text-muted-foreground">
          Du kannst den KI-Check nutzen{p.source === "owner" ? " (Betreiber)" : p.until ? ` – bis ${dayText(p.until)}` : ""}.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Grow-Plan, Tagebuch, KCanG-Check, Erinnerungen, Wetter und Kostenrechner sind kostenlos. Weil die KI Geld kostet, gehört der KI-Check zu Premium.
          </p>
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-2 text-xs">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Premium gibt es bald als Monats- oder Jahresabo. Bis dahin schaltet der Betreiber es auf Anfrage frei.
          </p>
        </>
      )}
    </section>
  );
}
