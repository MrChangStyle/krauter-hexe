import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CreditCard, Loader2, Repeat, Sparkles } from "lucide-react";
import {
  getGetBillingQueryKey,
  getGetPremiumQueryKey,
  useBillingCheckout,
  useBillingPortal,
  useCancelBilling,
  useChangeBillingPlan,
  useCompleteMockCheckout,
  useGetBilling,
  type Billing,
  type BillingInterval,
  type BillingTier,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { INTERVAL_LABELS, aiPerDay, changeDirection, paketLabel, priceLine, untilText } from "@/lib/billing-labels";
import { LEGAL_PATHS, legalHref } from "@/lib/legal";
import { isNativeApp } from "@/lib/native-app";
import { TEST_PHASE, planById } from "@/lib/site";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

function go(url: string) {
  window.location.assign(url);
}

/** What the account has now: Paket, limit, end, cancelled. */
function Status({ billing }: { billing: Billing }) {
  const p = billing.premium;
  const limit = aiPerDay(p);
  const until = untilText(p.until);
  return (
    <section className="space-y-1 rounded-2xl border bg-card p-4 text-sm" data-testid="abo-status">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dein Paket</p>
      <p className="text-lg font-semibold">{paketLabel(p)}</p>
      <p>{limit === null ? "KI ohne Tageslimit" : `${limit} KI-Anfragen am Tag je Bereich`}</p>
      {p.plan && <p className="text-muted-foreground">Abo {INTERVAL_LABELS[p.plan]}{p.source === "mock" ? " (Testkasse)" : ""}</p>}
      {until && (
        <p className={p.cancelAtPeriodEnd ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
          {p.cancelAtPeriodEnd ? `Gekündigt – läuft bis ${until}, danach Basis` : p.plan ? `Bezahlt bis ${until}, verlängert sich automatisch` : `Bis ${until}`}
        </p>
      )}
    </section>
  );
}

/** Ordering (§ 312j BGB): the Paket, the period, two confirmations and "Zahlungspflichtig bestellen". */
function Order({ billing }: { billing: Billing }) {
  const { toast } = useToast();
  const [tier, setTier] = useState<BillingTier>("lite");
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const [terms, setTerms] = useState(false);
  const [start, setStart] = useState(false);
  const checkout = useBillingCheckout({
    mutation: {
      onSuccess: (r) => go(r.url),
      onError: (err) => toast({ title: "Bestellen ging nicht", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const ready = terms && start;
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 text-sm" data-testid="abo-order">
      <h2 className="font-semibold">Paket wählen</h2>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Paket">
        {(["lite", "premium"] as const).map((t) => {
          const plan = planById(t);
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tier === t}
              onClick={() => setTier(t)}
              className={`rounded-xl border p-3 text-left transition-colors ${tier === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
            >
              <p className="font-semibold">{plan.name}</p>
              <p className="text-xs text-muted-foreground">{plan.tagline}</p>
              <p className="mt-1 text-xs">{plan.aiPerDay} KI-Anfragen am Tag</p>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="Zeitraum">
        {(["monthly", "yearly"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={`flex-1 rounded-full border px-3 py-1.5 text-sm ${interval === i ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {INTERVAL_LABELS[i]}
          </button>
        ))}
      </div>
      <p className="text-base font-semibold" data-testid="abo-price">
        {planById(tier).name}: {priceLine(tier, interval)}
      </p>
      <p className="text-xs text-muted-foreground">
        Das Abo verlängert sich automatisch um {interval === "monthly" ? "einen Monat" : "ein Jahr"}. Kündigen kannst du jederzeit zum Ende des bezahlten Zeitraums – hier auf dieser Seite.
        Als Kleinunternehmer weisen wir keine Umsatzsteuer aus.
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>
          Ich habe die{" "}
          <a href={legalHref(LEGAL_PATHS.agb)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            AGB
          </a>{" "}
          und die{" "}
          <a href={legalHref(LEGAL_PATHS.widerruf)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            Widerrufsbelehrung
          </a>{" "}
          gelesen.
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={start} onChange={(e) => setStart(e.target.checked)} />
        <span>Das Paket soll sofort starten. Widerrufe ich, zahle ich den Anteil bis dahin.</span>
      </label>
      <Button className="w-full gap-2" disabled={!ready || checkout.isPending} onClick={() => checkout.mutate({ data: { tier, interval } })}>
        {checkout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Zahlungspflichtig bestellen
      </Button>
      {billing.provider === "stripe" && <p className="text-center text-xs text-muted-foreground">Bezahlt wird sicher bei Stripe. Deine Zahlungsdaten sehen wir nicht.</p>}
    </section>
  );
}

/**
 * Paket wechseln: Lite ↔ Premium and monthly ↔ yearly on the running
 * subscription, up or down, at once. The difference for the rest of the
 * period is settled with the next payment. Back to Basis is "Abo kündigen".
 */
function ChangePlan({ billing }: { billing: Billing }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const p = billing.premium;
  const currentTier: BillingTier = p.tier === "lite" ? "lite" : "premium";
  const currentInterval: BillingInterval = p.plan ?? "yearly";
  const [tier, setTier] = useState<BillingTier>(currentTier);
  const [interval, setInterval] = useState<BillingInterval>(currentInterval);
  const change = useChangeBillingPlan({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetPremiumQueryKey() });
        toast({ title: "Paket gewechselt", description: `Ab jetzt: ${planById(tier).name}, ${INTERVAL_LABELS[interval]}.` });
      },
      onError: (err) => toast({ title: "Wechseln ging nicht", description: errorText(err, "Bitte versuche es noch einmal."), variant: "destructive" }),
    },
  });
  const unchanged = tier === currentTier && interval === currentInterval && !p.cancelAtPeriodEnd;
  const direction = changeDirection(currentTier, tier);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm" data-testid="abo-change">
      <h2 className="flex items-center gap-2 font-semibold">
        <Repeat className="h-4 w-4 text-primary" />
        Paket wechseln
      </h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Neues Paket">
        {(["lite", "premium"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tier === t}
            onClick={() => setTier(t)}
            className={`rounded-xl border p-3 text-left ${tier === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
          >
            <p className="font-semibold">
              {planById(t).name}
              {t === currentTier && <span className="ml-1 text-xs font-normal text-muted-foreground">(jetzt)</span>}
            </p>
            <p className="text-xs">{planById(t).aiPerDay} KI-Anfragen am Tag</p>
          </button>
        ))}
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="Neuer Zeitraum">
        {(["monthly", "yearly"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={`flex-1 rounded-full border px-3 py-1.5 ${interval === i ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {INTERVAL_LABELS[i]}
          </button>
        ))}
      </div>
      {!unchanged && (
        <div className="space-y-2" data-testid="abo-change-summary">
          <p className="font-semibold">
            {planById(tier).name}: {priceLine(tier, interval)}
          </p>
          <p className="text-xs text-muted-foreground">
            {direction === "up"
              ? "Upgrade: Das größere Paket gilt sofort. Für den Rest des bezahlten Zeitraums zahlst du nur den Unterschied."
              : direction === "down"
                ? "Downgrade: Das kleinere Paket gilt sofort. Was du für den Rest des Zeitraums zu viel gezahlt hast, wird mit der nächsten Zahlung verrechnet."
                : "Neuer Zeitraum: Der Unterschied wird mit der nächsten Zahlung verrechnet."}
            {p.cancelAtPeriodEnd && " Deine Kündigung wird damit aufgehoben – das Abo läuft weiter."} Kündigen kannst du weiter jederzeit zum Ende des Zeitraums.
          </p>
          <Button className="w-full gap-2" disabled={change.isPending} onClick={() => change.mutate({ data: { tier, interval } })}>
            {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : direction === "down" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            {direction === "down" ? `Zu ${planById(tier).name} wechseln` : `Kostenpflichtig zu ${planById(tier).name} wechseln`}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Zurück zu Basis (kostenlos): unten „Abo kündigen“ – dein Paket läuft bis zum Ende des bezahlten Zeitraums.</p>
    </section>
  );
}

/** Kündigen (§ 312k BGB): a button, a confirmation page, "Jetzt kündigen". Plus the provider's portal. */
function Manage({ billing }: { billing: Billing }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetPremiumQueryKey() });
  };
  const cancel = useCancelBilling({
    mutation: {
      onSuccess: () => {
        setConfirming(false);
        refresh();
        toast({ title: "Gekündigt", description: `Dein Paket läuft bis ${untilText(billing.premium.until) ?? "zum Ende des Zeitraums"}.` });
      },
      onError: (err) => toast({ title: "Kündigen ging nicht", description: errorText(err, "Bitte versuche es noch einmal oder schreib an info@littlefarming.de."), variant: "destructive" }),
    },
  });
  const portal = useBillingPortal({
    mutation: { onSuccess: (r) => go(r.url), onError: (err) => toast({ title: "Das ging nicht", description: errorText(err, ""), variant: "destructive" }) },
  });
  const p = billing.premium;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm" data-testid="abo-manage">
      <h2 className="font-semibold">Abo verwalten</h2>
      {billing.provider === "stripe" && (
        <Button variant="outline" className="w-full gap-2" disabled={portal.isPending} onClick={() => portal.mutate()}>
          <CreditCard className="h-4 w-4" />
          Zahlung verwalten (Zahlungsart, Rechnungen)
        </Button>
      )}
      {!p.cancelAtPeriodEnd &&
        (confirming ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3" data-testid="abo-cancel-confirm">
            <p className="font-semibold">Abo kündigen</p>
            <p>
              {paketLabel(p)}, Abo {p.plan ? INTERVAL_LABELS[p.plan] : ""}. Es endet zum {untilText(p.until)}. Bis dahin bleibt alles wie jetzt, danach läuft dein Konto als Basis weiter – deine Daten bleiben.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Jetzt kündigen
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Zurück
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setConfirming(true)}>
            Abo kündigen
          </Button>
        ))}
    </section>
  );
}

export default function AboPage() {
  const { toast } = useToast();
  const billing = useGetBilling();
  const search = useSearch();
  useEffect(() => {
    if (new URLSearchParams(search).get("bezahlt") === "1") toast({ title: "Danke!", description: "Dein Paket ist gleich aktiv – manchmal dauert es ein paar Sekunden." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const b = billing.data;
  const p = b?.premium;
  // Testphase and testers have everything for free – nothing to order.
  const free = p?.source === "test" || p?.source === "tester" || p?.source === "owner";
  // Order unless a subscription runs (a cancelled test-checkout one may be ordered again).
  // The store apps sell nothing for now (their own billing rules, docs/app-stores.md).
  const nativeApp = isNativeApp();
  const canOrder = !nativeApp && !!b && b.enabled && !!p && !free && (!p.subscribed || (p.cancelAtPeriodEnd && p.source === "mock"));

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/mehr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Mehr
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-primary" />
          Paket & Abo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Alles ohne KI ist kostenlos. Lite und Premium bringen mehr KI-Anfragen am Tag.</p>
      </div>
      {!b ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <>
          <Status billing={b} />
          {p!.subscribed && b.enabled && (p!.source === "stripe" || p!.source === "mock") && <ChangePlan billing={b} />}
          {p!.subscribed && b.enabled && <Manage billing={b} />}
          {canOrder && <Order billing={b} />}
          {nativeApp && b.enabled && !free && !p!.subscribed && (
            <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground" data-testid="abo-native">
              In dieser App lassen sich keine Pakete buchen.
            </p>
          )}
          {b.enabled && free && p!.source !== "owner" && (
            <section className="rounded-2xl border border-border bg-muted/40 p-4 text-sm" data-testid="abo-free">
              <p className="font-semibold">Für dich kostenlos</p>
              <p className="mt-1 text-muted-foreground">
                {p!.source === "tester" ? "Als Tester behältst du die App dauerhaft kostenlos – ein Abo brauchst du nicht." : "In der Testphase ist alles offen – ein Abo brauchst du gerade nicht."}
              </p>
            </section>
          )}
          {!b.enabled && (
            <section className="rounded-2xl border border-border bg-muted/40 p-4 text-sm" data-testid="abo-soon">
              <p className="font-semibold">Bezahlen geht noch nicht</p>
              <p className="mt-1 text-muted-foreground">
                {TEST_PHASE
                  ? "In der Testphase ist alles offen und kostenlos. Und wer jetzt testet, behält die App auch nach dem Start kostenlos."
                  : "Die Pakete kommen bald. Bis dahin nutzt du alles wie bisher."}
              </p>
            </section>
          )}
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(["basis", "lite", "premium"] as const).map((id) => (
              <li key={id} className="flex gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  <strong>{planById(id).name}</strong>: {planById(id).tagline}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** /abo/testkasse – the test checkout (BILLING_PROVIDER=mock): pretend to pay, never real money. */
export function TestkassePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(useSearch());
  const tier = params.get("paket") === "premium" ? "premium" : "lite";
  const interval = params.get("zeitraum") === "monthly" ? "monthly" : "yearly";
  const complete = useCompleteMockCheckout({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetPremiumQueryKey() });
        go(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/abo?bezahlt=1`);
      },
      onError: (err) => toast({ title: "Das ging nicht", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  return (
    <div className="space-y-4 px-4 pb-6 pt-6" data-testid="testkasse">
      <h1 className="text-2xl font-bold">Testkasse</h1>
      <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Nur zum Testen: Hier fließt kein Geld. In der echten App steht an dieser Stelle die Kasse des Zahlungsanbieters.</p>
      <p className="text-lg font-semibold">
        {planById(tier).name}: {priceLine(tier, interval)}
      </p>
      <Button className="w-full" disabled={complete.isPending} onClick={() => complete.mutate({ data: { tier, interval } })}>
        Bezahlen simulieren
      </Button>
      <Link href="/abo" className="block text-center text-sm text-muted-foreground underline underline-offset-4">
        Abbrechen
      </Link>
    </div>
  );
}
