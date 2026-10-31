import { useState } from "react";
import { Download, Loader2, Wallet } from "lucide-react";
import { useGetFinance, type FinancePaket } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { INTERVAL_LABELS, untilText } from "@/lib/billing-labels";
import { PAKET_LABELS, PAKET_ORDER, euro, financeCsv, monthLabel } from "@/lib/finance-labels";
import { cn } from "@/lib/utils";

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", tone)}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `little-farming-finanzen-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Verwaltung → Finanzen (docs/finanzen.md): who has which Paket, what came
 * in, what the AI cost (estimated) and what is left – per month.
 */
export function FinanceCard() {
  const finance = useGetFinance();
  const [filter, setFilter] = useState<FinancePaket | null>(null);
  const f = finance.data;
  if (finance.isLoading) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  if (!f) return <p className="text-sm text-muted-foreground">Die Finanzen konnten nicht geladen werden.</p>;
  const now = f.months[0]!;
  const year = f.months.reduce(
    (s, m) => ({ revenue: s.revenue + m.revenueCents, ai: s.ai + m.aiCostCents, result: s.result + m.resultCents }),
    { revenue: 0, ai: 0, result: 0 },
  );
  const accounts = filter ? f.accounts.filter((a) => a.paket === filter) : f.accounts;
  const paying = f.counts.lite + f.counts.premium;

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4" data-testid="finance">
      <h2 className="flex items-center gap-2 font-semibold">
        <Wallet className="h-4 w-4 text-primary" />
        Finanzen
      </h2>

      <div className="grid grid-cols-2 gap-2">
        <Kpi label={`Umsatz ${monthLabel(now.month)}`} value={euro(now.revenueCents)} hint={`${now.payments} ${now.payments === 1 ? "Zahlung" : "Zahlungen"}`} />
        <Kpi label="Laufende Abos im Monat" value={euro(f.mrrCents)} hint={`${paying} ${paying === 1 ? "zahlendes Konto" : "zahlende Konten"}`} />
        <Kpi label={`KI-Kosten ${monthLabel(now.month)}`} value={euro(now.aiCostCents)} hint={`${now.aiRequests} Anfragen · geschätzt`} />
        <Kpi label={`Ergebnis ${monthLabel(now.month)}`} value={euro(now.resultCents)} tone={now.resultCents < 0 ? "text-destructive" : "text-primary"} />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="finance-year">
        Letzte 12 Monate: Umsatz {euro(year.revenue)}, KI-Kosten {euro(year.ai)}, Ergebnis {euro(year.result)}.
      </p>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Je Monat</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="finance-months">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Monat</th>
                <th className="py-1 pr-2 text-right font-medium">Umsatz</th>
                <th className="py-1 pr-2 text-right font-medium">KI</th>
                <th className="py-1 pr-2 text-right font-medium">KI-Kosten</th>
                <th className="py-1 text-right font-medium">Ergebnis</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {f.months.map((m) => (
                <tr key={m.month}>
                  <td className="py-1 pr-2">{monthLabel(m.month)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{euro(m.revenueCents)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m.aiRequests}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{euro(m.aiCostCents)}</td>
                  <td className={cn("py-1 text-right tabular-nums", m.resultCents < 0 && "text-destructive")}>{euro(m.resultCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          KI-Kosten sind geschätzt: {String(f.aiCostPerRequestCent).replace(".", ",")} Cent je KI-Anfrage (Richtwert, in Render als AI_COST_PER_REQUEST_CENT änderbar). Die echte Rechnung steht in der Google Cloud Console.
          Umsatz ist brutto wie bezahlt, ohne Gebühren des Zahlungsanbieters.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download(financeCsv(f))}>
          <Download className="h-4 w-4" />
          Als CSV herunterladen
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Wer hat welches Paket</h3>
        <div className="flex flex-wrap gap-1.5" data-testid="finance-filter">
          <button type="button" onClick={() => setFilter(null)} className={cn("rounded-full border px-2.5 py-1 text-xs", !filter && "border-primary bg-primary text-primary-foreground")}>
            Alle {f.accounts.length}
          </button>
          {PAKET_ORDER.filter((k) => f.counts[k] > 0).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full border px-2.5 py-1 text-xs", filter === k && "border-primary bg-primary text-primary-foreground")}>
              {PAKET_LABELS[k]} {f.counts[k]}
            </button>
          ))}
        </div>
        <ul className="divide-y text-sm" data-testid="finance-accounts">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.name ?? a.email}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.email}
                  {a.userCode !== null && ` · ID ${a.userCode}`}
                </span>
                {a.plan && (
                  <span className={cn("block text-xs", a.cancelAtPeriodEnd ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                    Abo {INTERVAL_LABELS[a.plan as "monthly" | "yearly"] ?? a.plan}
                    {a.source === "mock" && " (Testkasse)"}
                    {a.until && (a.cancelAtPeriodEnd ? ` · gekündigt, läuft bis ${untilText(a.until)}` : ` · bezahlt bis ${untilText(a.until)}`)}
                  </span>
                )}
                {!a.plan && a.paket === "manual" && <span className="block text-xs text-muted-foreground">{a.until ? `bis ${untilText(a.until)}` : "ohne Ende"}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className={cn("block rounded-full px-2 py-0.5 text-xs font-medium", a.paket === "premium" || a.paket === "lite" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {PAKET_LABELS[a.paket]}
                </span>
                {a.monthlyCents > 0 && <span className="mt-0.5 block text-[11px] text-muted-foreground">{euro(a.monthlyCents)}/Monat</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {f.payments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Letzte Zahlungen</h3>
          <ul className="divide-y text-xs" data-testid="finance-payments">
            {f.payments.map((p, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {untilText(p.paidAt)} · {p.email ?? "gelöschtes Konto"}
                  {p.tier && ` · ${PAKET_LABELS[p.tier as FinancePaket] ?? p.tier}`}
                  {p.source === "mock" && " (Testkasse)"}
                </span>
                <span className="shrink-0 tabular-nums">{euro(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
