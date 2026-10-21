import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cloud, CloudRain, CloudSnow, CloudLightning, Loader2, LocateFixed, MapPin, Sun, Wind } from "lucide-react";
import {
  getGetFarmWeatherQueryKey,
  useGetFarmWeather,
  useSetFarmLocation,
  type DayForecast,
  type FarmSummary,
  type FarmWeather,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { berlinToday, dayLabel, tempText } from "@/lib/weather-labels";
import { cn } from "@/lib/utils";

const ICONS: Record<DayForecast["icon"], typeof Sun> = { sun: Sun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning };

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

export function LocationForm({ farm, onDone }: { farm: FarmSummary; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [postalCode, setPostalCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const save = useSetFarmLocation({
    mutation: {
      onSuccess(data: FarmWeather) {
        queryClient.setQueryData(getGetFarmWeatherQueryKey(farm.id), data);
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
    save.mutate({ farmId: farm.id, data: { postalCode: postalCode.trim() } });
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
        save.mutate({ farmId: farm.id, data: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } });
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
        <Input aria-label="Postleitzahl des Hofs" inputMode="numeric" maxLength={5} placeholder="Postleitzahl" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-32" />
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

/** Three days of weather for the farm and the warnings for its animals and garden. */
export function FarmWeatherCard({ farm }: { farm: FarmSummary }) {
  const weather = useGetFarmWeather(farm.id);
  const [editing, setEditing] = useState(false);
  const isAdmin = farm.role === "admin";
  if (weather.isLoading) return null;
  const data = weather.data;
  const today = berlinToday();

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sun className="h-4 w-4 text-primary" />
          Wetter
        </h2>
        {data?.location && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {data.location.postalCode ? `PLZ ${data.location.postalCode}` : "Gerätestandort"}
            {data.location.source === "bed" && " (vom Beet)"}
            {isAdmin && (
              <button type="button" className="ml-1 underline" onClick={() => setEditing(!editing)}>
                ändern
              </button>
            )}
          </span>
        )}
      </div>
      {!data?.location ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Mit dem Standort des Hofs warnt die App vor Frost, Hitze, Sturm und Starkregen – mit Tipps für eure Tiere.</p>
          {isAdmin ? <LocationForm farm={farm} /> : <p className="text-xs text-muted-foreground">Ein Admin des Hofs kann den Standort festlegen.</p>}
        </div>
      ) : (
        <>
          {editing && <LocationForm farm={farm} onDone={() => setEditing(false)} />}
          {data.days.length === 0 ? (
            <p className="text-sm text-muted-foreground">Der Wetterdienst ist gerade nicht erreichbar.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              {data.days.slice(0, 3).map((d) => {
                const Icon = ICONS[d.icon];
                return (
                  <div key={d.date} className="rounded-lg bg-muted/50 p-2">
                    <p className="text-xs font-medium">{dayLabel(d.date, today)}</p>
                    <Icon className={cn("mx-auto my-1 h-6 w-6", d.icon === "sun" ? "text-amber-500" : "text-sky-600")} />
                    <p className="tabular-nums">
                      <span className="font-semibold">{tempText(d.maxTemp)}</span> <span className="text-muted-foreground">{tempText(d.minTemp)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.precipitationMm >= 0.5 ? `${d.precipitationMm.toLocaleString("de-DE", { maximumFractionDigits: 1 })} l/m²` : "trocken"}
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
          {data.warnings.length > 0 && (
            <ul role="alert" className="space-y-1.5 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {data.warnings.map((w) => (
                <li key={w.kind} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {w.text}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">Vorhersage: Deutscher Wetterdienst (über Bright Sky). Warnungen kommen morgens auch als Push.</p>
        </>
      )}
    </section>
  );
}
