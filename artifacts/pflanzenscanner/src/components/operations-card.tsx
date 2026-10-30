import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Bug, Check, ChevronDown, Loader2 } from "lucide-react";
import {
  getGetAppStatusQueryKey,
  getListErrorGroupsQueryKey,
  useGetAppStatus,
  useGetSiteVisits,
  useGetUsage,
  useListErrorGroups,
  useResolveErrorGroup,
  useSetAppStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function StatusForm() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const status = useGetAppStatus();
  const [text, setText] = useState<string | null>(null);
  const [level, setLevel] = useState<"info" | "warning">("warning");
  const save = useSetAppStatus({
    mutation: {
      onSuccess(next) {
        queryClient.setQueryData(getGetAppStatusQueryKey(), next);
        setText(null);
        toast({ title: next.message ? "Hinweis ist für alle sichtbar" : "Hinweis entfernt" });
      },
      onError: () => toast({ title: "Nicht gespeichert", variant: "destructive" }),
    },
  });
  const current = status.data?.message ?? "";
  const value = text ?? current;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Hinweis an alle (z. B. bei einer Störung)</p>
      <Textarea value={value} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Die Bestimmung ist gerade gestört – wir arbeiten daran." aria-label="Hinweis an alle" />
      <div className="flex flex-wrap items-center gap-2">
        {(["warning", "info"] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={level === l}
            onClick={() => setLevel(l)}
            className={cn("rounded-full border px-3 py-1 text-xs", level === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}
          >
            {l === "warning" ? "Störung" : "Info"}
          </button>
        ))}
        <Button size="sm" className="ml-auto" disabled={save.isPending || !value.trim()} onClick={() => save.mutate({ data: { message: value, level } })}>
          Anzeigen
        </Button>
        {current && (
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ data: { message: null, level: "info" } })}>
            Entfernen
          </Button>
        )}
      </div>
    </div>
  );
}

function Usage() {
  const usage = useGetUsage();
  const days = usage.data ?? [];
  if (usage.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Nutzung der letzten 14 Tage</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Tag</th>
              <th className="py-1 text-right font-normal">Aktiv</th>
              <th className="py-1 text-right font-normal">Neu</th>
              <th className="py-1 text-right font-normal">KI</th>
              <th className="py-1 text-right font-normal" title="KI hat zu lange gebraucht">Langsam</th>
              <th className="py-1 text-right font-normal">Fehler</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-t border-border">
                <td className="py-1">{d.day.slice(8, 10)}.{d.day.slice(5, 7)}.</td>
                <td className="py-1 text-right">{d.activeUsers}</td>
                <td className="py-1 text-right">{d.newUsers}</td>
                <td className="py-1 text-right">{d.aiActions}</td>
                <td className="py-1 text-right">{d.aiTimeouts}</td>
                <td className={cn("py-1 text-right", d.errors > 0 && "font-semibold text-destructive")}>{d.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Nur Tageszahlen – keine Daten über einzelne Personen.</p>
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = { direkt: "direkt / Lesezeichen", intern: "von eigenen Seiten", andere: "andere" };

/** Besucher der Homepage (docs/analyse.md): last 30 days, by page and origin. */
function Visits() {
  const visits = useGetSiteVisits();
  const v = visits.data;
  if (visits.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!v) return null;
  const total = v.perDay.reduce((sum, d) => sum + d.visits, 0);
  return (
    <div className="space-y-2" data-testid="site-visits">
      <p className="text-sm font-medium">
        Besucher der Homepage, letzte {v.days} Tage: {total.toLocaleString("de-DE")} Seitenaufrufe
      </p>
      {!v.enabled && <p className="text-xs text-amber-700 dark:text-amber-400">Die Zählung ist abgeschaltet (ANALYTICS=off).</p>}
      {total > 0 && (
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <ul className="space-y-0.5">
            <li className="text-muted-foreground">Seiten</li>
            {v.perPath.map((p) => (
              <li key={p.path} className="flex justify-between gap-2 tabular-nums">
                <span className="truncate">{p.path}</span>
                <span>{p.visits}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-0.5">
            <li className="text-muted-foreground">Herkunft</li>
            {v.perSource.map((s) => (
              <li key={s.source} className="flex justify-between gap-2 tabular-nums">
                <span className="truncate">{SOURCE_LABELS[s.source] ?? s.source}</span>
                <span>{s.visits}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Ohne Cookies und ohne IP-Adresse – nur Tag, Seite und Herkunft (Kampagne aus ?utm_source= oder ?ref=, sonst die verweisende Seite).</p>
    </div>
  );
}

function Errors() {
  const queryClient = useQueryClient();
  const errors = useListErrorGroups();
  const [open, setOpen] = useState<string | null>(null);
  const resolve = useResolveErrorGroup({
    mutation: { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListErrorGroupsQueryKey() }) },
  });
  const list = errors.data ?? [];
  const openCount = list.filter((e) => !e.resolvedAt).length;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Bug className="h-4 w-4" />
        Fehler
        {openCount > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">{openCount} offen</span>}
      </p>
      {errors.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Fehler aufgezeichnet.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((e) => (
            <li key={e.fingerprint} className={cn("rounded-lg border border-border p-2 text-xs", e.resolvedAt && "opacity-60")}>
              <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === e.fingerprint ? null : e.fingerprint)}>
                <span className={cn("mt-0.5 rounded px-1 font-semibold", e.source === "client" ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" : "bg-muted")}>
                  {e.source === "client" ? "App" : "Server"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{e.message}</span>
                  <span className="text-muted-foreground">
                    {e.count}× · zuletzt {when(e.lastSeen)}
                    {e.location ? ` · ${e.location}` : ""}
                    {e.resolvedAt ? " · behoben" : ""}
                  </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open === e.fingerprint && "rotate-180")} />
              </button>
              {open === e.fingerprint && (
                <div className="mt-2 space-y-2">
                  <p className="text-muted-foreground">
                    Zuerst {when(e.firstSeen)}
                    {e.release ? ` · Version ${e.release}` : ""}
                  </p>
                  {e.stack && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-[10px] leading-snug">{e.stack}</pre>}
                  {!e.resolvedAt && (
                    <Button size="sm" variant="outline" className="gap-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ fingerprint: e.fingerprint })}>
                      <Check className="h-4 w-4" />
                      Als behoben markieren
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Bei einem neuen Fehler bekommst du eine Push-Nachricht. Kommt ein behobener zurück, öffnet er sich wieder.</p>
    </div>
  );
}

/** App owner: Betrieb – status notice, usage and errors. */
export function OperationsCard() {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Activity className="h-4 w-4 text-primary" />
        Betrieb
      </h2>
      <StatusForm />
      <Errors />
      <Usage />
      <Visits />
    </section>
  );
}
