import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Download, Leaf, Loader2, PackageOpen, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOVED_FLAG_KEY, buildMoveFile, countDeviceData, movePercent, type MoveCounts, type MoveProgress } from "@/lib/move";
import { Progress } from "@/components/ui/progress";
import { sendDeviceData } from "@/lib/move-channel";
import { disablePush } from "@/lib/push";
import { isOldAddress, useAppConfig } from "@/lib/use-app-config";

function readMovedFlag(): string | null {
  try {
    return localStorage.getItem(MOVED_FLAG_KEY);
  } catch {
    return null;
  }
}

function setMovedFlag(canonical: string): void {
  try {
    localStorage.setItem(MOVED_FLAG_KEY, canonical);
  } catch {
    /* ignore */
  }
}

/** The same page at the new address. */
function newAddressFor(canonical: string): string {
  return `${canonical}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function describe(counts: MoveCounts): string {
  const parts: string[] = [];
  if (counts.images) parts.push(`${counts.images} ${counts.images === 1 ? "Foto" : "Fotos"}`);
  if (counts.queue)
    parts.push(`${counts.queue} ${counts.queue === 1 ? "Foto" : "Fotos"} in der Warteschlange`);
  if (counts.draft) parts.push("ein angefangener Pilz-Scan");
  return parts.join(", ");
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Leaf className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Little Farming</h1>
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-4">{children}</div>
    </div>
  );
}

type Phase =
  | { kind: "counting" }
  | { kind: "ready"; counts: MoveCounts }
  | { kind: "sending"; sent: MoveCounts; progress: MoveProgress | null }
  | { kind: "done"; stored: MoveCounts }
  | { kind: "file-saved" }
  | { kind: "error"; message: string; counts: MoveCounts };

/**
 * Shown instead of the app at the old address once the app has moved. It
 * carries photos that only exist on this device over to the new address, then
 * sends the user there. Nothing is deleted here.
 */
function MoveScreen({ canonical }: { canonical: string }) {
  const host = new URL(canonical).host;
  // Read once on opening: the flag is set by a move in this very screen, and
  // that must show the success message, not jump away.
  const [alreadyMoved] = useState(() => readMovedFlag() === canonical);
  const [phase, setPhase] = useState<Phase>({ kind: "counting" });

  useEffect(() => {
    let cancelled = false;
    void countDeviceData().then((counts) => {
      if (cancelled) return;
      const total = counts.images + counts.queue + counts.draft;
      // Nothing to carry over, or already done: straight to the new address.
      if ((total === 0 || alreadyMoved) && navigator.onLine) {
        if (total === 0) setMovedFlag(canonical);
        window.location.replace(newAddressFor(canonical));
        return;
      }
      setPhase({ kind: "ready", counts });
    });
    return () => {
      cancelled = true;
    };
  }, [canonical, alreadyMoved]);

  async function moveByWindow(counts: MoveCounts) {
    const win = window.open(`${canonical}/umzug`, "_blank");
    if (!win) {
      setPhase({
        kind: "error",
        counts,
        message: "Das neue Fenster wurde blockiert. Nutze bitte „Als Datei sichern“.",
      });
      return;
    }
    setPhase({ kind: "sending", sent: { images: 0, queue: 0, draft: 0, local: 0 }, progress: null });
    try {
      const stored = await sendDeviceData({
        target: win,
        targetOrigin: canonical,
        onProgress: (sent, progress) => setPhase({ kind: "sending", sent, progress }),
      });
      setMovedFlag(canonical);
      // Push now belongs to the new address; avoid double notifications.
      await disablePush().catch(() => undefined);
      setPhase({ kind: "done", stored });
    } catch (err) {
      setPhase({
        kind: "error",
        counts,
        message: err instanceof Error ? err.message : "Der Umzug ist fehlgeschlagen.",
      });
    }
  }

  async function saveAsFile() {
    const blob = await buildMoveFile();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `little-farming-umzug-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setPhase({ kind: "file-saved" });
  }

  function goOn() {
    setMovedFlag(canonical);
    void disablePush().catch(() => undefined);
    window.location.href = newAddressFor(canonical);
  }

  if (phase.kind === "counting") {
    return (
      <Shell>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </Shell>
    );
  }

  if (phase.kind === "sending") {
    return (
      <Shell>
        <Truck className="h-8 w-8 text-primary" />
        <p className="text-sm">Daten werden übertragen … bitte beide Fenster offen lassen.</p>
        {phase.progress ? (
          <div className="w-full space-y-1.5" data-testid="move-progress">
            <Progress value={movePercent(phase.progress)} aria-label="Fortschritt des Umzugs" />
            <p className="text-sm font-medium tabular-nums">
              {movePercent(phase.progress)} % · {phase.progress.done} von {phase.progress.total}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Warte auf das neue Fenster …</p>
        )}
        {!phase.progress && (
          <p className="text-xs text-muted-foreground">Fragt das neue Fenster nach einem Passwort? Gib es dort ein – danach startet der Umzug von selbst.</p>
        )}
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </Shell>
    );
  }

  if (phase.kind === "done") {
    return (
      <Shell>
        <PackageOpen className="h-8 w-8 text-primary" />
        <h2 className="text-lg font-semibold">Umzug geschafft</h2>
        <p className="text-sm text-muted-foreground">
          {describe(phase.stored) || "Alle Daten waren schon dort."} – alles ist jetzt auf {host}.
          Melde dich dort einmal neu an und schalte Erinnerungen wieder ein.
        </p>
        <Button className="w-full gap-2" onClick={() => (window.location.href = canonical)}>
          Weiter zu {host}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Shell>
    );
  }

  if (phase.kind === "file-saved") {
    return (
      <Shell>
        <Download className="h-8 w-8 text-primary" />
        <h2 className="text-lg font-semibold">Datei gespeichert</h2>
        <p className="text-sm text-muted-foreground">
          Öffne jetzt <strong>{host}/umzug</strong> und lade dort die eben gespeicherte Datei.
        </p>
        <Button className="w-full gap-2" onClick={() => (window.location.href = `${canonical}/umzug`)}>
          {host}/umzug öffnen
          <ArrowRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4"
          onClick={goOn}
        >
          Datei ist geladen – nicht mehr hierher zurück
        </button>
      </Shell>
    );
  }

  const counts = phase.counts;
  return (
    <Shell>
      <Truck className="h-8 w-8 text-primary" />
      <h2 className="text-lg font-semibold">Little Farming ist umgezogen</h2>
      <p className="text-sm text-muted-foreground">
        Die App wohnt jetzt unter <strong>{host}</strong>. Auf diesem Gerät liegen noch{" "}
        {describe(counts)} – nimm sie mit, damit nichts verloren geht.
      </p>
      {phase.kind === "error" && (
        <p role="alert" className="w-full rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {phase.message}
        </p>
      )}
      <Button className="w-full gap-2" onClick={() => void moveByWindow(counts)}>
        <Truck className="h-4 w-4" />
        Daten mitnehmen und umziehen
      </Button>
      <Button variant="outline" className="w-full gap-2" onClick={() => void saveAsFile()}>
        <Download className="h-4 w-4" />
        Als Datei sichern
      </Button>
      <p className="text-xs text-muted-foreground">
        Auf diesem Gerät wird nichts gelöscht. Klappt das neue Fenster nicht (z. B. in der
        installierten App auf dem iPhone), nutze „Als Datei sichern“.
      </p>
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-4"
        onClick={() => {
          if (window.confirm("Ohne die Fotos dieses Geräts weiter? Sie bleiben hier, sind auf der neuen Adresse aber nicht zu sehen.")) {
            goOn();
          }
        }}
      >
        Ohne Daten weiter
      </button>
    </Shell>
  );
}

/**
 * Shows the move screen instead of the app when it runs under an old
 * address. While the address check is pending – or offline – the app shows
 * as usual, so scanning in the forest keeps working.
 */
export function MoveGate({ children }: { children: ReactNode }) {
  const config = useAppConfig();
  if (
    config?.canonicalOrigin &&
    isOldAddress(config, window.location.origin, window.location.hostname)
  ) {
    return <MoveScreen canonical={config.canonicalOrigin} />;
  }
  return <>{children}</>;
}
