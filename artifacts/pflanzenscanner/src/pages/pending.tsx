import { useEffect } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  Wifi,
  WifiOff,
  Loader2,
  Clock,
  AlertCircle,
  Trash2,
  RefreshCw,
  ImageOff,
  TriangleAlert,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useScanQueue } from "@/lib/scan-queue-context";
import { useAuthContext } from "@/lib/auth-context";
import {
  MAX_AUTO_REVIVALS,
  STALE_QUEUE_WARNING_MS,
  type PendingScan,
} from "@/lib/scan-queue";
import { MAX_AUTO_ATTEMPTS } from "@/lib/scan-queue-context";
import { useNow } from "@/hooks/use-now";

function StatusBadge({ status }: { status: PendingScan["status"] }) {
  if (status === "scanning") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Wird gescannt
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="w-3 h-3" />
        Fehlgeschlagen
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="w-3 h-3" />
      Wartet
    </Badge>
  );
}

function StaleBadge({ createdAt, now }: { createdAt: number; now: number }) {
  if (now - createdAt < STALE_QUEUE_WARNING_MS) return null;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      <TriangleAlert className="w-3 h-3" />
      Wartet seit{" "}
      {formatDistanceToNow(createdAt, { locale: de })}
    </Badge>
  );
}

/**
 * Explains what the queue will do next with a failed photo. Without this the
 * growing waits between automatic attempts look like the app has given up, and
 * a photo that has genuinely stopped retrying looks like it is still working.
 */
function RetryHint({ item, now }: { item: PendingScan; now: number }) {
  const text = describeRetryState(item, now);
  if (!text) return null;
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

/** Pure so the wording is unit-testable without rendering the page. */
export function describeRetryState(item: PendingScan, now: number): string | null {
  if (item.status !== "error") return null;

  // The server signalled that retrying cannot help (a 4xx).
  if (item.autoRetry !== true) {
    return "Wird nicht automatisch wiederholt – tippe auf ⟳, um es erneut zu versuchen.";
  }

  const attemptsUsedUp = item.attempts >= MAX_AUTO_ATTEMPTS;
  const revivalsUsedUp = (item.revivals ?? 0) >= MAX_AUTO_REVIVALS;
  if (attemptsUsedUp && revivalsUsedUp) {
    return "Automatische Versuche aufgebraucht – tippe auf ⟳, um es erneut zu versuchen.";
  }

  const waitMs = (item.nextAttemptAt ?? 0) - now;
  if (waitMs > 0) {
    const minutes = Math.ceil(waitMs / 60_000);
    return minutes <= 1
      ? "Nächster Versuch in weniger als einer Minute."
      : `Nächster Versuch in etwa ${minutes} Minuten.`;
  }
  return "Wird automatisch erneut versucht.";
}

export default function PendingPage() {
  const now = useNow();
  const {
    pending,
    scanningIds,
    isOnline,
    isAuthBlocked,
    rateLimitResetsAt,
    isProcessing,
    processQueue,
    remove,
    retry,
    refresh,
    results,
  } = useScanQueue();
  // An expired session is cleared locally, which drops the app back to the
  // login screen – there is no external provider to redirect to any more.
  const { logout } = useAuthContext();
  const hasWaiting = pending.some((p) => p.status === "pending");
  // The queue deliberately pauses while the daily quota is exhausted. Without
  // surfacing it here, queued photos would just sit at "Wartet" with the banner
  // above claiming they are scanned automatically.
  const isRateLimited =
    rateLimitResetsAt !== null &&
    new Date(rateLimitResetsAt).getTime() > now;
  const quotaResetTime = rateLimitResetsAt
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(rateLimitResetsAt)) + " Uhr"
    : "Mitternacht";

  // Re-read from storage whenever the queue page opens, so it reflects the
  // current state even after out-of-band changes (another tab, crash recovery).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col p-6 space-y-6 animate-in fade-in duration-500">
      <header className="space-y-1 mt-4">
        <h1 className="text-3xl font-serif text-foreground">Offline</h1>
        <p className="text-muted-foreground text-sm">
          Fotos, die noch gescannt werden müssen.
        </p>
      </header>

      <div
        className={cn(
          "rounded-xl p-4 flex items-start gap-3 text-sm",
          isOnline
            ? "bg-primary/10 text-foreground"
            : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
        )}
      >
        {isOnline ? (
          <Wifi className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
        ) : (
          <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
        )}
        <p>
          {!isOnline
            ? "Der Empfang ist aktuell zu gering. Deine Fotos werden gespeichert und automatisch gescannt, sobald du wieder online bist."
            : isRateLimited || isAuthBlocked
              ? "Du bist online, aber die Warteschlange ist gerade angehalten – siehe Hinweis unten."
              : "Du bist online. Ausstehende Fotos werden automatisch gescannt."}
        </p>
      </div>

      {isRateLimited && (
        <div className="rounded-xl p-4 flex items-start gap-3 text-sm bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">Tageslimit erreicht – 15 Fotos pro Tag</p>
            <p className="text-xs opacity-80">
              Dein Scan-Kontingent ist für heute aufgebraucht und wird um{" "}
              {quotaResetTime} zurückgesetzt. Deine Fotos bleiben gespeichert und
              werden danach automatisch gescannt.
            </p>
          </div>
        </div>
      )}

      {isAuthBlocked && (
        <div className="rounded-xl p-4 flex items-start gap-3 text-sm bg-destructive/10 text-destructive">
          <LogIn className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="font-medium">Anmeldung erforderlich</p>
            <p className="text-xs opacity-80">
              Deine Sitzung ist abgelaufen. Bitte melde dich neu an – deine Fotos bleiben gespeichert.
            </p>
            <Button size="sm" onClick={logout} className="mt-1">
              <LogIn className="w-4 h-4 mr-2" />
              Neu anmelden
            </Button>
          </div>
        </div>
      )}

      {results.length > 0 && !isProcessing && (
        <Button asChild className="w-full">
          <Link href="/">
            Ergebnisse ansehen ({results.length})
          </Link>
        </Button>
      )}

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 gap-4 text-muted-foreground">
          <ImageOff className="w-10 h-10" />
          <p>Keine ausstehenden Scans.</p>
          <Button asChild variant="outline">
            <Link href="/">Pflanze fotografieren</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {isOnline && hasWaiting && !isRateLimited && !isAuthBlocked && (
            <Button onClick={processQueue} disabled={isProcessing} className="w-full">
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Wird gescannt…
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Jetzt scannen
                </>
              )}
            </Button>
          )}

          {pending.map((item) => {
            const scanning = scanningIds.has(item.id);
            const status = scanning ? "scanning" : item.status;
            return (
              <Card key={item.id} className="p-3 flex items-center gap-3">
                <img
                  src={item.image}
                  alt="Ausstehendes Foto"
                  className="w-16 h-16 rounded-lg object-cover bg-muted shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={status} />
                    {item.imageSide && (
                      <Badge variant="secondary">🍄 2 Fotos</Badge>
                    )}
                    <StaleBadge createdAt={item.createdAt} now={now} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(item.createdAt, {
                      addSuffix: true,
                      locale: de,
                    })}
                  </p>
                  {status === "error" && item.error && (
                    <p className="text-xs text-destructive line-clamp-2">{item.error}</p>
                  )}
                  {status === "error" && <RetryHint item={item} now={now} />}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!scanning && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => retry(item.id)}
                      title={
                        status === "error"
                          ? "Erneut versuchen"
                          : "Scan jetzt neu starten"
                      }
                      aria-label={
                        status === "error"
                          ? "Erneut versuchen"
                          : "Scan jetzt neu starten"
                      }
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(item.id)}
                    disabled={scanning}
                    title="Entfernen"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
