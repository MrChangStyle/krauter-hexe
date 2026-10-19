import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Coins, Loader2, Package, ShoppingCart, Snowflake, Sprout, Trash2 } from "lucide-react";
import {
  getGetFeedStockQueryKey,
  useBuyFeed,
  useCountFeedStock,
  useEnsureOwnFarm,
  useGetFeedStock,
  useRemoveFeedStock,
  type FarmSummary,
  type FeedStockLine,
  type FeedStockOverview,
} from "@workspace/api-client-react";
import { PremiumBadge } from "@/components/premium-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { STOCK_STATUS, bales, euro, kg, shortDate } from "@/lib/feed-labels";
import { cn } from "@/lib/utils";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : NaN);
const decimal = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

// ── Bought / counted ─────────────────────────────────────────────────────────

function StockDialog({ farmId, line, mode, onClose }: { farmId: number; line: FeedStockLine; mode: "buy" | "count"; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [packages, setPackages] = useState("1");
  const [packageKg, setPackageKg] = useState(decimal(line.packageKg));
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState(decimal(line.stockKg));
  const options = {
    mutation: {
      onSuccess(data: FeedStockOverview) {
        queryClient.setQueryData(getGetFeedStockQueryKey(farmId), data);
        toast({ title: mode === "buy" ? "Einkauf eingetragen" : "Bestand gespeichert" });
        onClose();
      },
      onError: (err: unknown) => toast({ title: "Nicht gespeichert", description: errorText(err, "Bitte prüfe die Angaben."), variant: "destructive" }),
    },
  };
  const buy = useBuyFeed(options);
  const count = useCountFeedStock(options);
  const pending = buy.isPending || count.isPending;
  const ref = { feedKey: line.feedKey, feedId: line.feedId };

  function submit(event: FormEvent) {
    event.preventDefault();
    const pricePerPackage = price.trim() ? num(price) : null;
    if (mode === "buy") {
      buy.mutate({ farmId, data: { ...ref, packages: num(packages), packageKg: num(packageKg), pricePerPackage } });
    } else {
      count.mutate({ farmId, data: { ...ref, stockKg: num(stock), packageKg: packageKg.trim() ? num(packageKg) : null, pricePerPackage } });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "buy" ? `${line.name} gekauft` : `Bestand ${line.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "buy" ? "Kommt zum jetzigen Vorrat dazu." : "Was jetzt da ist – nachwiegen oder Säcke zählen."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {mode === "buy" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stock-packages">Anzahl</Label>
                <Input id="stock-packages" inputMode="decimal" required value={packages} onChange={(e) => setPackages(e.target.value)} />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stock-kg">Bestand kg</Label>
                <Input id="stock-kg" inputMode="decimal" required value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock-package-kg">kg je Sack/Ballen</Label>
              <Input id="stock-package-kg" inputMode="decimal" required={mode === "buy"} value={packageKg} onChange={(e) => setPackageKg(e.target.value)} placeholder="z. B. 25" />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="stock-price">Preis je Sack/Ballen (€, freiwillig)</Label>
              <Input id="stock-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={line.pricePerKg && line.packageKg ? decimal(Math.round(line.pricePerKg * line.packageKg * 100) / 100) : ""} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Mit Preis rechnet die App die Futterkosten je Tier und Monat.</p>
          <Button type="submit" disabled={pending} className="gap-1.5">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function stockText(s: FeedStockLine): string {
  if (s.stockKg === null) return `Verbrauch ${kg(s.dailyKg)} am Tag – Bestand noch nicht erfasst.`;
  if (s.status === "unused") return `Noch ${kg(s.stockKg)} – steht gerade in keiner Ration.`;
  if (s.status === "empty") return `Aufgebraucht (Verbrauch ${kg(s.dailyKg)} am Tag).`;
  return `Noch ${kg(s.stockKg)} · reicht bis ${shortDate(s.emptyOn!)} (${s.daysLeft} Tage)`;
}

function Overview({ farm }: { farm: FarmSummary }) {
  const queryClient = useQueryClient();
  const canWrite = farm.role !== "guest";
  const overview = useGetFeedStock(farm.id);
  const [dialog, setDialog] = useState<{ line: FeedStockLine; mode: "buy" | "count" } | null>(null);
  const remove = useRemoveFeedStock({ mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetFeedStockQueryKey(farm.id) }) } });

  if (!overview.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const { stocks, costs, winter } = overview.data;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Package className="h-4 w-4 text-primary" />
          Vorrat
        </h2>
        {stocks.length === 0 ? (
          <p className="text-muted-foreground">
            Leg zuerst im <Link href="/farm/futter" className="underline">Futterplaner</Link> Rationen an – dann rechnet die App, wie lange das Futter reicht.
          </p>
        ) : (
          <ul className="space-y-3">
            {stocks.map((s) => (
              <li key={`${s.feedKey ?? ""}-${s.feedId ?? ""}`} className="space-y-1.5 border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STOCK_STATUS[s.status].tone)}>{STOCK_STATUS[s.status].label}</span>
                </div>
                <p className="text-muted-foreground">{stockText(s)}</p>
                {s.reorderOn && (s.status === "soon" || s.status === "empty") && (
                  <p className="font-medium text-amber-800 dark:text-amber-300">Nachkaufen bis {shortDate(s.reorderOn)}</p>
                )}
                {s.reorderOn && s.status === "ok" && <p className="text-xs text-muted-foreground">Nachkaufen etwa am {shortDate(s.reorderOn)}</p>}
                {canWrite && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ line: s, mode: "buy" })}>
                      <ShoppingCart className="h-4 w-4" />
                      Gekauft
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ line: s, mode: "count" })}>
                      Bestand
                    </Button>
                    {s.id !== null && s.status === "unused" && (
                      <Button size="sm" variant="ghost" aria-label={`Vorrat ${s.name} entfernen`} onClick={() => remove.mutate({ farmId: farm.id, stockId: s.id! })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Gerechnet mit den Rationen, die gerade gelten. Ab und zu nachwiegen hält die Zahlen genau.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Coins className="h-4 w-4 text-primary" />
          Kosten
        </h2>
        {costs.lines.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Ration – keine Kosten.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {costs.lines.map((l) => (
                <li key={`${l.target.kind}-${l.target.id}`}>
                  <div className="flex justify-between gap-2">
                    <span>
                      {l.target.name}
                      {l.target.count > 1 && <span className="text-muted-foreground"> ({l.target.count} Tiere)</span>}
                    </span>
                    <span className="tabular-nums font-medium">{euro(l.perMonth)} im Monat</span>
                  </div>
                  {l.target.count > 1 && <p className="text-xs text-muted-foreground">{euro(l.perAnimalMonth)} je Tier</p>}
                  {l.missingPrices.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">Ohne Preis: {l.missingPrices.join(", ")}</p>}
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold">
              <span>Zusammen</span>
              <span className="tabular-nums">
                {costs.complete ? "" : "mind. "}
                {euro(costs.perMonth)} im Monat
              </span>
            </div>
            {!costs.complete && <p className="text-xs text-muted-foreground">Trag beim nächsten Einkauf den Preis ein, dann sind die Kosten vollständig.</p>}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Snowflake className="h-4 w-4 text-primary" />
          Wintervorrat
        </h2>
        <p className="text-muted-foreground">
          {shortDate(winter.from)}–{shortDate(winter.to)} ({winter.days} Tage), mit den Winterrationen – sonst den ganzjährigen.
        </p>
        {winter.lines.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Ration.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-normal">Futter</th>
                <th className="py-1 text-right font-normal">Bedarf</th>
                <th className="py-1 text-right font-normal">Vorrat</th>
                <th className="py-1 text-right font-normal">Fehlt</th>
              </tr>
            </thead>
            <tbody>
              {winter.lines.map((l) => (
                <tr key={`${l.feedKey ?? ""}-${l.feedId ?? ""}`} className="border-t border-border align-top">
                  <td className="py-1.5">
                    {l.name}
                    {l.category === "roughage" && l.missingKg > 0 && (
                      <span className="block text-muted-foreground">
                        ≈ {bales(l.missingKg)} Kleinballen à 15 kg
                      </span>
                    )}
                    {l.gardenCrop && <span className="block text-primary">auch aus dem Garten</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{kg(l.neededKg)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-muted-foreground">{kg(l.stockKg)}</td>
                  <td className={cn("whitespace-nowrap py-1.5 text-right tabular-nums", l.missingKg > 0 && "font-semibold")}>{l.missingKg > 0 ? kg(l.missingKg) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {winter.gardenKg > 0 && (
          <p className="flex gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              {kg(winter.gardenKg)} Möhren, Rüben oder Kürbis kann der eigene Garten liefern – der{" "}
              <Link href="/beete/assistent" className="underline">
                Garten-Assistent
              </Link>{" "}
              plant sie ein.
            </span>
          </p>
        )}
      </section>

      {dialog && <StockDialog farmId={farm.id} line={dialog.line} mode={dialog.mode} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** /farm/futter/vorrat – Vorrat, Kosten und Wintervorrat of the Futterplaner. */
export default function FutterVorratPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm/futter" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Futterplaner
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Meine Farm</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Vorrat & Kosten <PremiumBadge />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Wie lange das Futter reicht, was es kostet und was der Winter braucht.</p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Overview farm={farm} />}
    </div>
  );
}
