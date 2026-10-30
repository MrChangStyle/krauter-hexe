import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Fence, Layers, LocateFixed, Loader2, MapPin, Pencil, Snowflake, Trash2 } from "lucide-react";
import {
  getGetBedQueryKey,
  getListBedsQueryKey,
  useCreateBed,
  useDeleteBed,
  useGetBed,
  useGetFarm,
  useUpdateBed,
  type BedOrientation,
  type BedType,
  type GardenBed,
  type GardenBedInput,
  type SoilTexture,
  type WindProtection,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BedPlanner } from "@/components/bed-planner";
import { BedFertilizingCard } from "@/components/bed-fertilizing-card";
import { useToast } from "@/hooks/use-toast";
import {
  BED_TYPE_LABELS,
  BED_TYPE_ORDER,
  FINGER_TEST,
  ORIENTATION_LABELS,
  SOIL_LABELS,
  WIND_LABELS,
  bedArea,
  bedSize,
  dayMonth,
  parseDayMonth,
  soilAdvice,
} from "@/lib/garden-labels";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

// ── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  type: BedType;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  builtYear: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  sunHours: string;
  orientation: BedOrientation | "";
  windProtection: WindProtection | "";
  soilTexture: SoilTexture | "";
  soilPh: string;
  ownFrost: boolean;
  lastFrost: string;
  firstFrost: string;
  notes: string;
}

function toForm(b: GardenBed | null): FormState {
  return {
    name: b?.name ?? "",
    type: b?.type ?? "raised",
    lengthCm: b ? String(b.lengthCm) : "",
    widthCm: b ? String(b.widthCm) : "",
    heightCm: b?.heightCm != null ? String(b.heightCm) : "",
    builtYear: b?.builtYear != null ? String(b.builtYear) : "",
    postalCode: b?.postalCode ?? "",
    latitude: b?.postalCode ? null : (b?.latitude ?? null),
    longitude: b?.postalCode ? null : (b?.longitude ?? null),
    sunHours: b?.sunHours != null ? String(b.sunHours) : "",
    orientation: b?.orientation ?? "",
    windProtection: b?.windProtection ?? "",
    soilTexture: b?.soilTexture ?? "",
    soilPh: b?.soilPh != null ? String(b.soilPh).replace(".", ",") : "",
    ownFrost: b?.frostSource === "manual",
    lastFrost: b ? dayMonth(b.lastFrost) : "",
    firstFrost: b ? dayMonth(b.firstFrost) : "",
    notes: b?.notes ?? "",
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/** The form as the API wants it; a string when something is off. */
export function toInput(f: FormState, wasManual: boolean): GardenBedInput | string {
  const lengthCm = num(f.lengthCm);
  const widthCm = num(f.widthCm);
  if (!lengthCm || !widthCm) return "Bitte gib Länge und Breite in cm an.";
  let frostDates: GardenBedInput["frostDates"];
  if (f.ownFrost) {
    const lastFrost = parseDayMonth(f.lastFrost);
    const firstFrost = parseDayMonth(f.firstFrost);
    if (!lastFrost || !firstFrost) return "Bitte gib die Frosttermine als Tag.Monat an, z. B. 15.05.";
    frostDates = { lastFrost, firstFrost };
  } else if (wasManual) {
    frostDates = null;
  }
  return {
    name: f.name.trim(),
    type: f.type,
    lengthCm: Math.round(lengthCm),
    widthCm: Math.round(widthCm),
    heightCm: f.type === "raised" && num(f.heightCm) !== null ? Math.round(num(f.heightCm)!) : null,
    builtYear: f.type === "raised" && num(f.builtYear) !== null ? Math.round(num(f.builtYear)!) : null,
    postalCode: f.postalCode.trim() || null,
    latitude: f.latitude,
    longitude: f.longitude,
    sunHours: num(f.sunHours) === null ? null : Math.round(num(f.sunHours)!),
    orientation: f.orientation || null,
    windProtection: f.windProtection || null,
    soilTexture: f.soilTexture || null,
    soilPh: num(f.soilPh),
    ...(frostDates !== undefined ? { frostDates } : {}),
    notes: f.notes.trim() || null,
  };
}

function BedForm({
  initial,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial: GardenBed | null;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (input: GardenBedInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [localError, setLocalError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function locate() {
    if (!navigator.geolocation) {
      setLocalError("Dieses Gerät kann seinen Standort nicht bestimmen – bitte die Postleitzahl eintragen.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude, postalCode: "" }));
        setLocating(false);
      },
      () => {
        setLocalError("Standort nicht verfügbar – bitte die Postleitzahl eintragen.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const input = toInput(form, initial?.frostSource === "manual");
    if (typeof input === "string") {
      setLocalError(input);
      return;
    }
    setLocalError(null);
    onSubmit(input);
  }

  const gps = form.latitude !== null && form.longitude !== null;

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bed-name">Name *</Label>
          <Input id="bed-name" required maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Hochbeet am Haus" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bed-type">Art *</Label>
          <select id="bed-type" className={selectClass} value={form.type} onChange={(e) => set("type", e.target.value as BedType)}>
            {BED_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{BED_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className={form.type === "raised" ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bed-length">Länge (cm) *</Label>
            <Input id="bed-length" inputMode="numeric" required value={form.lengthCm} onChange={(e) => set("lengthCm", e.target.value)} placeholder="200" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bed-width">Breite (cm) *</Label>
            <Input id="bed-width" inputMode="numeric" required value={form.widthCm} onChange={(e) => set("widthCm", e.target.value)} placeholder="120" />
          </div>
          {form.type === "raised" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bed-height">Höhe (cm)</Label>
              <Input id="bed-height" inputMode="numeric" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} placeholder="80" />
            </div>
          )}
          {form.type === "raised" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bed-built">Befüllt im Jahr</Label>
              <Input id="bed-built" inputMode="numeric" value={form.builtYear} onChange={(e) => set("builtYear", e.target.value)} placeholder={String(new Date().getFullYear())} />
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Standort & Lage</legend>
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="bed-plz">Postleitzahl</Label>
            <Input
              id="bed-plz"
              inputMode="numeric"
              maxLength={5}
              value={form.postalCode}
              onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value, latitude: null, longitude: null }))}
              placeholder={gps ? "GPS-Standort übernommen" : "z. B. 80331"}
            />
          </div>
          <Button type="button" variant="outline" className="gap-1.5" onClick={locate} disabled={locating}>
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            GPS
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {gps
            ? "GPS-Standort übernommen (auf etwa 10 km gerundet)."
            : "Daraus berechnet die App die typischen Frosttermine. Gespeichert wird nur ein auf etwa 10 km gerundeter Ort."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bed-sun">Sonnenstunden/Tag</Label>
            <Input id="bed-sun" inputMode="numeric" value={form.sunHours} onChange={(e) => set("sunHours", e.target.value)} placeholder="6" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bed-orientation">Ausrichtung</Label>
            <select id="bed-orientation" className={selectClass} value={form.orientation} onChange={(e) => set("orientation", e.target.value as BedOrientation | "")}>
              <option value="">–</option>
              {(Object.keys(ORIENTATION_LABELS) as BedOrientation[]).map((o) => (
                <option key={o} value={o}>{ORIENTATION_LABELS[o]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bed-wind">Windschutz</Label>
          <select id="bed-wind" className={selectClass} value={form.windProtection} onChange={(e) => set("windProtection", e.target.value as WindProtection | "")}>
            <option value="">–</option>
            {(Object.keys(WIND_LABELS) as WindProtection[]).map((w) => (
              <option key={w} value={w}>{WIND_LABELS[w]}</option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Bodenprofil</legend>
        <details className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">So geht die Fingerprobe</summary>
          <p className="mt-1 text-muted-foreground">{FINGER_TEST}</p>
        </details>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bed-soil">Fingerprobe</Label>
            <select id="bed-soil" className={selectClass} value={form.soilTexture} onChange={(e) => set("soilTexture", e.target.value as SoilTexture | "")}>
              <option value="">–</option>
              {(Object.keys(SOIL_LABELS) as SoilTexture[]).map((s) => (
                <option key={s} value={s}>{SOIL_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bed-ph">pH-Wert</Label>
            <Input id="bed-ph" inputMode="decimal" value={form.soilPh} onChange={(e) => set("soilPh", e.target.value)} placeholder="6,5" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Frosttermine</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={form.ownFrost} onChange={(e) => set("ownFrost", e.target.checked)} />
          Eigene Frosttermine eintragen (statt aus den Wetterdaten)
        </label>
        {form.ownFrost && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bed-last-frost">Letzter Frost (Tag.Monat)</Label>
              <Input id="bed-last-frost" value={form.lastFrost} onChange={(e) => set("lastFrost", e.target.value)} placeholder="15.05." />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bed-first-frost">Erster Herbstfrost</Label>
              <Input id="bed-first-frost" value={form.firstFrost} onChange={(e) => set("firstFrost", e.target.value)} placeholder="15.10." />
            </div>
          </div>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bed-notes">Notizen</Label>
        <Textarea id="bed-notes" rows={3} maxLength={2000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      {(localError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {localError ?? error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
        <Button type="submit" className="flex-1 gap-2" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link href="/beete" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Beete
    </Link>
  );
}

function NewBedPage({ farmId }: { farmId: number }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const create = useCreateBed({
    mutation: {
      onSuccess(bed) {
        void queryClient.invalidateQueries({ queryKey: getListBedsQueryKey(farmId) });
        toast({ title: `${bed.name} angelegt` });
        setLocation(`/beete/${farmId}/${bed.id}`);
      },
      onError: (err) => setError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  return (
    <div className="space-y-4 px-4 pb-6 pt-6">
      <BackLink />
      <h1 className="text-2xl font-bold">Beet anlegen</h1>
      <BedForm
        initial={null}
        submitLabel="Anlegen"
        busy={create.isPending}
        error={error}
        onSubmit={(data) => create.mutate({ farmId, data })}
        onCancel={() => setLocation("/beete")}
      />
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-1.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function frostNote(b: GardenBed): string {
  if (b.frostSource === "manual") return "Selbst eingetragen.";
  if (b.frostSource === "climate") return "Typische Werte am Standort aus den Wetterdaten der letzten Jahre (Deutscher Wetterdienst).";
  return b.latitude !== null
    ? "Richtwert – die Werte für deinen Standort werden gerade aus den Wetterdaten berechnet."
    : "Richtwert (Eisheilige). Mit Postleitzahl oder GPS berechnet die App die Werte für deinen Standort.";
}

function BedDetailPage({ farmId, bedId }: { farmId: number; bedId: number }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const farm = useGetFarm(farmId);
  // While the frost dates are still being looked up, check again now and then.
  const bed = useGetBed(farmId, bedId, {
    query: {
      queryKey: getGetBedQueryKey(farmId, bedId),
      refetchInterval: (q) => (q.state.data?.frostSource === "default" && q.state.data.latitude !== null ? 5000 : false),
    },
  });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = farm.data ? farm.data.role !== "guest" : false;
  const refresh = (updated?: GardenBed) => {
    if (updated) queryClient.setQueryData(getGetBedQueryKey(farmId, bedId), updated);
    void queryClient.invalidateQueries({ queryKey: getListBedsQueryKey(farmId) });
  };
  const update = useUpdateBed({
    mutation: {
      onSuccess(updated) {
        refresh(updated);
        setEditing(false);
      },
      onError: (err) => setError(errorText(err, "Das hat nicht geklappt.")),
    },
  });
  const remove = useDeleteBed({
    mutation: {
      onSuccess() {
        refresh();
        toast({ title: "Beet gelöscht" });
        setLocation("/beete");
      },
      onError: () => toast({ title: "Nicht gelöscht", variant: "destructive" }),
    },
  });

  if (bed.isLoading) {
    return (
      <div className="flex justify-center pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!bed.data) {
    return (
      <div className="space-y-4 px-4 pt-6">
        <BackLink />
        <p className="text-sm text-muted-foreground">Dieses Beet gibt es nicht (mehr).</p>
      </div>
    );
  }
  const b = bed.data;

  if (editing) {
    return (
      <div className="space-y-4 px-4 pb-6 pt-6">
        <BackLink />
        <h1 className="text-2xl font-bold">{b.name} bearbeiten</h1>
        <BedForm
          initial={b}
          submitLabel="Speichern"
          busy={update.isPending}
          error={error}
          onSubmit={(data) => update.mutate({ farmId, bedId, data })}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const tips = soilAdvice(b.soilTexture, b.soilPh);

  return (
    <div className="space-y-4 px-4 pb-6 pt-6">
      <BackLink />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Beet-Architekt</p>
          <h1 className="truncate text-2xl font-bold">{b.name}</h1>
        </div>
        {canWrite && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[BED_TYPE_LABELS[b.type], bedSize(b), bedArea(b), b.orientation ? ORIENTATION_LABELS[b.orientation] : null, b.sunHours != null ? `ca. ${b.sunHours} h Sonne` : null]
          .filter(Boolean)
          .map((chip) => (
            <span key={chip} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {chip}
            </span>
          ))}
      </div>

      <BedPlanner farmId={farmId} bed={b} canWrite={canWrite} />

      <Card icon={<MapPin className="h-4 w-4 text-primary" />} title="Standort & Lage">
        <Facts
          rows={[
            ["Ort", b.postalCode ? `PLZ ${b.postalCode}` : b.latitude !== null ? "GPS-Standort" : "nicht angegeben"],
            ["Sonne", b.sunHours != null ? `ca. ${b.sunHours} Stunden am Tag` : "–"],
            ["Ausrichtung", b.orientation ? ORIENTATION_LABELS[b.orientation] : "–"],
            ["Windschutz", b.windProtection ? WIND_LABELS[b.windProtection] : "–"],
          ]}
        />
        {b.postalCode && <p className="text-xs text-muted-foreground">Ortssuche: © OpenStreetMap-Mitwirkende</p>}
      </Card>

      <Card icon={<Snowflake className="h-4 w-4 text-sky-600" />} title="Frosttermine">
        <Facts
          rows={[
            ["Letzter Frost im Frühjahr", dayMonth(b.lastFrost)],
            ["Erster Frost im Herbst", dayMonth(b.firstFrost)],
          ]}
        />
        <p className="text-xs text-muted-foreground">{frostNote(b)}</p>
      </Card>

      <Card icon={<Layers className="h-4 w-4 text-amber-700" />} title="Bodenprofil">
        <Facts
          rows={[
            ["Fingerprobe", b.soilTexture ? SOIL_LABELS[b.soilTexture] : "noch nicht gemacht"],
            ["pH-Wert", b.soilPh != null ? b.soilPh.toLocaleString("de-DE") : "–"],
          ]}
        />
        {tips.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Mit Fingerprobe und pH-Wert gibt es hier Tipps zu Kompost, Mist und Kalk.</p>
        )}
      </Card>

      <BedFertilizingCard farmId={farmId} bedId={bedId} canWrite={canWrite} />

      {b.notes && (
        <Card icon={<Fence className="h-4 w-4 text-primary" />} title="Notizen">
          <p className="whitespace-pre-wrap text-muted-foreground">{b.notes}</p>
        </Card>
      )}

      {canWrite && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-destructive hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Beet „${b.name}“ löschen?`)) remove.mutate({ farmId, bedId });
          }}
        >
          <Trash2 className="h-4 w-4" />
          Beet löschen
        </Button>
      )}
    </div>
  );
}

/** /beete/:farmId/neu and /beete/:farmId/:bedId */
export default function BeetPage() {
  const params = useParams<{ farmId: string; bedId: string }>();
  const farmId = Number(params.farmId);
  if (!Number.isInteger(farmId) || farmId <= 0) return null;
  if (params.bedId === "neu") return <NewBedPage farmId={farmId} />;
  const bedId = Number(params.bedId);
  if (!Number.isInteger(bedId) || bedId <= 0) return null;
  return <BedDetailPage farmId={farmId} bedId={bedId} />;
}
