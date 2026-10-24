import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { CloudRain, Snowflake, ThermometerSnowflake } from "lucide-react";
import {
  getGetSettingsQueryKey,
  getListTasksQueryKey,
  useGetCareWeather,
  useGetSettings,
  useSetSettings,
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";

const comma = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

/** "heute", "morgen", "am 12.11." */
function when(date: string, today: string): string {
  if (date === today) return "heute Nacht";
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return "morgen Nacht";
  return `am ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

/**
 * Wetterabhängige Pflege (docs/pflege-wetter.md) above the care plan: rain
 * that waters today, frost ahead for plants outside, and the winter switch.
 */
export function CareWeatherCard({ hasOutdoor }: { hasOutdoor: boolean }) {
  const queryClient = useQueryClient();
  const weather = useGetCareWeather({ query: { enabled: hasOutdoor, queryKey: ["/api/care/weather"] } });
  const settings = useGetSettings();
  const save = useSetSettings({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetSettingsQueryKey(), data);
        void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      },
    },
  });
  const w = weather.data;
  const seasonal = settings.data?.seasonalCare ?? true;

  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm" data-testid="care-weather">
      {hasOutdoor && w && !w.hasLocation && (
        <p className="text-muted-foreground">
          Für Regen und Frost bei Pflanzen draußen braucht die App euren Standort.{" "}
          <Link href="/" className="underline">
            Standort im Wetter auf der Hof-Seite festlegen
          </Link>
        </p>
      )}
      {w?.rainWaters && w.today && (
        <p className="flex gap-2">
          <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>Heute regnet es {comma(w.today.precipitationMm)} l/m². Gießen draußen übernimmt der Regen.</span>
        </p>
      )}
      {w?.frost && w.today && (
        <p className="flex gap-2">
          <ThermometerSnowflake className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
          <span>
            Frost {when(w.frost.date, w.today.date)} bis {comma(w.frost.minTemp)} °C: frostempfindliche Pflanzen draußen reinholen oder abdecken.
          </span>
        </p>
      )}
      <label className="flex items-center justify-between gap-3">
        <span className="flex gap-2">
          <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="block font-medium">Pflege nach Jahreszeit</span>
            <span className="block text-xs text-muted-foreground">November bis Februar seltener gießen, nicht düngen.</span>
          </span>
        </span>
        <Switch
          checked={seasonal}
          disabled={save.isPending || !settings.data}
          aria-label="Pflege nach Jahreszeit"
          onCheckedChange={(on) => save.mutate({ data: { seasonalCare: on } })}
        />
      </label>
    </section>
  );
}
