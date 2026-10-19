import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, ShieldCheck, Undo2 } from "lucide-react";
import {
  getGetFarmDutiesQueryKey,
  useCheckFarmDuty,
  useEnsureOwnFarm,
  useGetFarmDuties,
  useSetFarmDutySettings,
  type FarmDuties,
  type FarmDuty,
  type FarmSummary,
} from "@workspace/api-client-react";
import { HousingOrderBanner } from "@/components/housing-order-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { dutyBadge, stockText } from "@/lib/duty-labels";
import { SPECIES_LABELS, todayIso } from "@/lib/farm-labels";
import { deDay } from "@/lib/medicine-labels";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

function useSaved(farm: FarmSummary) {
  const queryClient = useQueryClient();
  return (data: FarmDuties) => queryClient.setQueryData(getGetFarmDutiesQueryKey(farm.id), data);
}

/** Registration number and, with poultry, the housing order. */
function Settings({ farm, duties }: { farm: FarmSummary; duties: FarmDuties }) {
  const { toast } = useToast();
  const saved = useSaved(farm);
  const [number, setNumber] = useState(duties.holdingNumber ?? "");
  const [until, setUntil] = useState(duties.housingOrderUntil ?? "");
  const save = useSetFarmDutySettings({
    mutation: {
      onSuccess(data) {
        saved(data);
        toast({ title: "Gespeichert" });
      },
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const isAdmin = farm.role === "admin";
  const poultry = duties.species.includes("poultry");

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ farmId: farm.id, data: { holdingNumber: number.trim() || null, ...(poultry ? { housingOrderUntil: until || null } : {}) } });
  }

  if (!isAdmin) {
    return (
      <section className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
        <h2 className="font-semibold">Betrieb</h2>
        <p>Registriernummer: {duties.holdingNumber ?? <span className="text-muted-foreground">nicht eingetragen</span>}</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-semibold">Betrieb</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="holding-number">Registriernummer vom Veterinäramt</Label>
        <Input id="holding-number" maxLength={30} value={number} placeholder="z. B. 276 09 123 456 7890" onChange={(e) => setNumber(e.target.value)} />
        <span className="text-xs text-muted-foreground">Steht dann auch im Veterinäramt-Export.</span>
      </div>
      {poultry && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="housing-until">Stallpflicht für Geflügel angeordnet bis</Label>
          <div className="flex gap-2">
            <Input id="housing-until" type="date" min={todayIso()} value={until} onChange={(e) => setUntil(e.target.value)} />
            {until && (
              <Button type="button" variant="ghost" onClick={() => setUntil("")}>
                Aufheben
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">Alle auf dem Hof sehen die Stallpflicht dann oben auf der Tierseite und in der Übergabe.</span>
        </div>
      )}
      <Button type="submit" size="sm" disabled={save.isPending}>
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Speichern
      </Button>
    </form>
  );
}

function DutyCard({ farm, duty }: { farm: FarmSummary; duty: FarmDuty }) {
  const { toast } = useToast();
  const saved = useSaved(farm);
  const check = useCheckFarmDuty({
    mutation: {
      onSuccess: saved,
      onError: (err) => toast({ title: "Nicht gespeichert", description: errorText(err, ""), variant: "destructive" }),
    },
  });
  const badge = dutyBadge(duty);
  const canTick = farm.role === "admin" && (duty.kind === "once" || duty.kind === "yearly") && duty.status !== "upcoming";
  const done = duty.status === "done";

  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm" data-testid={`duty-${duty.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{duty.title}</h3>
        {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}>{badge.label}</span>}
      </div>
      <p>{duty.text}</p>
      {duty.stock && <p className="rounded-lg bg-muted/60 p-2 font-medium">{stockText(duty.stock)}</p>}
      {duty.kind === "yearly" && done && duty.doneOn && (
        <p className="text-xs text-muted-foreground">
          Abgehakt am {deDay(duty.doneOn)}. Nächster Stichtag: 01.01.{Number(duty.period) + 1}.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {duty.species.map((s) => SPECIES_LABELS[s]).join(", ")} · {duty.source}
        </span>
        {canTick && (
          <Button size="sm" variant={done ? "ghost" : "outline"} className="gap-1" disabled={check.isPending} onClick={() => check.mutate({ farmId: farm.id, dutyKey: duty.key, data: { done: !done } })}>
            {done ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {done ? "Zurücknehmen" : duty.kind === "yearly" ? "Gemeldet" : "Erledigt"}
          </Button>
        )}
      </div>
    </li>
  );
}

function Group({ farm, title, duties }: { farm: FarmSummary; title: string; duties: FarmDuty[] }) {
  if (duties.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <ul className="space-y-3">
        {duties.map((d) => (
          <DutyCard key={d.key} farm={farm} duty={d} />
        ))}
      </ul>
    </section>
  );
}

function Duties({ farm }: { farm: FarmSummary }) {
  const query = useGetFarmDuties(farm.id);
  if (!query.data) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
  const data = query.data;
  const of = (...statuses: FarmDuty["status"][]) => data.duties.filter((d) => statuses.includes(d.status));

  return (
    <div className="space-y-5">
      <HousingOrderBanner farm={farm} />
      {data.species.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Noch keine Tiere auf dem Hof. Sobald ihr Tiere oder Gruppen anlegt, steht hier, was ihr anmelden und melden müsst.
        </p>
      ) : data.duties.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm">
          Für {data.species.map((s) => SPECIES_LABELS[s]).join(", ")} gibt es keine Melde- oder Registrierpflicht.
        </p>
      ) : (
        <>
          <Settings key={`${data.holdingNumber}-${data.housingOrderUntil}`} farm={farm} duties={data} />
          <Group farm={farm} title="Zu erledigen" duties={of("overdue", "due", "open")} />
          <Group farm={farm} title="Erledigt und als Nächstes" duties={of("done", "upcoming")} />
          <Group farm={farm} title="Regeln im Alltag" duties={data.duties.filter((d) => d.kind === "rule")} />
          <Group farm={farm} title="Empfehlungen" duties={data.duties.filter((d) => d.kind === "tip")} />
        </>
      )}
    </div>
  );
}

/** /farm/pflichten – registration, Tierseuchenkasse, stock reports and the rules per species. */
export default function PflichtenPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Tiere
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Meine Farm</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Pflichten & Tierseuchen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Was die Haltung eurer Tiere in Deutschland auf dem Papier bedeutet. Fristen und Details unterscheiden sich zwischen den Bundesländern – im Zweifel wissen das Veterinäramt und die Tierseuchenkasse Bescheid. Keine Rechtsberatung.
        </p>
      </div>
      {!farm ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Duties farm={farm} />}
    </div>
  );
}
