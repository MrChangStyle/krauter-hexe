import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cloud, CloudLightning, CloudRain, CloudSnow, Loader2, LocateFixed, MapPin, Sun, Wind } from "lucide-react";
import {
  getGetGrowOverviewQueryKey,
  getGetGrowWeatherQueryKey,
  useGetGrowWeather,
  useUpdateGrow,
  type DayForecast,
  type Grow,
  type GrowInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { berlinToday, dayLabel, tempText } from "@/lib/weather-labels";
import { cn } from "@/lib/utils";

const ICONS: Record<DayForecast["icon"], typeof Sun> = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** Postal code or the phone's position for an outdoor grow – rounded to about 10 km. */
function GrowLocationForm({ grow, growInput, onDone }: { grow: Grow; growInput: GrowInput; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [postalCode, setPostalCode] = useState(grow.postalCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const save = useUpdateGrow({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetGrowOverviewQueryKey(), data);
        void queryClient.invalidateQueries({ queryKey: getGetGrowWeatherQueryKey(grow.id) });
        onDone?.();
      },
      onError: (err) => setError(errorText(err, "Der Standort konnte nicht gespeichert werden.")),
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{5}$/.test(postalCode.trim())) {
      setError("Die Postleitzahl hat fünf Ziffern.");
      return;
    }
    setError(null);
    save.mutate({ growId: grow.id, data: { ...growInput, postalCode: postalCode.trim(), latitude: null, longitude: null } });
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Dieses Gerät kann seinen Standort nicht bestimmen – bitte die Postleitzahl eintragen.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setError(null);
        save.mutate({ growId: grow.id, data: { ...growInput, postalCode: null, latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
      },
      () => {
        setLocating(false);
        setError("Standort nicht verfügbar – bitte die Postleitzahl eintragen.");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <Input aria-label="Postleitzahl des Grows" inputMode="numeric" maxLength={5} placeholder="Postleitzahl" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-32" />
        <Button type="submit" size="sm" disabled={save.isPending} className="h-10">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Speichern
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-10 gap-1.5" disabled={locating || save.isPending} onClick={locate}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          Hier
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Gespeichert wird nur die Gegend (auf etwa 10 km gerundet), keine Adresse.</p>
    </form>
  );
}

/** Outdoor and greenhouse: three days of weather and the warnings for the plants. */
export function GrowWeatherCard({ grow, growInput }: { grow: Grow; growInput: GrowInput }) {
  const [editing, setEditing] = useState(false);
  const weather = useGetGrowWeather(grow.id, { query: { queryKey: getGetGrowWeatherQueryKey(grow.id), enabled: grow.hasLocation } });
  const today = berlinToday();

  if (!grow.hasLocation) {
    return (
      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
        <p className="text-muted-foreground">Mit dem Standort warnt die App vor Frost, Hitze, Sturm und Regen in der Blüte.</p>
        <GrowLocationForm grow={grow} growInput={growInput} />
      </div>
    );
  }
  const data = weather.data;
  return (
    <div className="space-y-2" data-testid={`grow-weather-${grow.id}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Wetter</span>
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {grow.postalCode ? `PLZ ${grow.postalCode}` : "Gerätestandort"}
          <button type="button" className="ml-1 underline" onClick={() => setEditing(!editing)}>
            ändern
          </button>
        </span>
      </div>
      {editing && <GrowLocationForm grow={grow} growInput={growInput} onDone={() => setEditing(false)} />}
      {!data ? (
        weather.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : data.days.length === 0 ? (
        <p className="text-muted-foreground">Der Wetterdienst ist gerade nicht erreichbar.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          {data.days.map((d) => {
            const Icon = ICONS[d.icon];
            return (
              <div key={d.date} className="rounded-lg bg-muted/50 p-1.5">
                <p className="text-xs font-medium">{dayLabel(d.date, today)}</p>
                <Icon className={cn("mx-auto my-0.5 h-5 w-5", d.icon === "sun" ? "text-amber-500" : "text-sky-600")} />
                <p className="tabular-nums">
                  <span className="font-semibold">{tempText(d.maxTemp)}</span> <span className="text-muted-foreground">{tempText(d.minTemp)}</span>
                </p>
                {d.maxGustKmh >= 50 && (
                  <p className="flex items-center justify-center gap-0.5 text-[11px] text-muted-foreground">
                    <Wind className="h-3 w-3" />
                    {d.maxGustKmh} km/h
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {data && data.warnings.length > 0 && (
        <ul role="alert" className="space-y-1.5 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {data.warnings.map((w) => (
            <li key={w.kind} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {w.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
