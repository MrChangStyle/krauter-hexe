import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Progress } from "@/components/ui/progress";
import { AutoUpdate } from "@/components/auto-update";
import { ArrowRight, Leaf, Loader2, PackageOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NO_COUNTS, addCounts, applyMoveBatch, movePercent, readMoveFile, type MoveCounts, type MoveProgress } from "@/lib/move";
import { receiveDeviceData } from "@/lib/move-channel";
import { fetchAppConfig } from "@/lib/use-app-config";

function describe(counts: MoveCounts): string {
  const parts: string[] = [];
  if (counts.images) parts.push(`${counts.images} ${counts.images === 1 ? "Foto" : "Fotos"}`);
  if (counts.queue) parts.push(`${counts.queue} aus der Warteschlange`);
  if (counts.draft) parts.push("ein angefangener Pilz-Scan");
  return parts.join(", ");
}

type State =
  | { kind: "waiting" }
  | { kind: "receiving"; stored: MoveCounts; progress: MoveProgress | null }
  | { kind: "done"; stored: MoveCounts }
  | { kind: "error"; message: string };

/**
 * /umzug at the new address: receives device data from the old address,
 * either from the window that opened this one or from a move file. Public
 * (no login needed) – it only writes to this device's own storage.
 */
export default function UmzugPage() {
  const [state, setState] = useState<State>({ kind: "waiting" });
  const fileInput = useRef<HTMLInputElement>(null);
  const hasOpener = typeof window !== "undefined" && !!window.opener;
  // No word from the old address for a while: say what to check.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state.kind !== "waiting") return;
    const t = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(t);
  }, [state.kind]);

  useEffect(() => {
    if (!window.opener) return;
    let stop: (() => void) | undefined;
    let total = NO_COUNTS;
    void fetchAppConfig()
      .then((config) => {
        if (config.legacyOrigins.length === 0) {
          setState({ kind: "error", message: "Die alte Adresse ist hier nicht eingetragen (LEGACY_ORIGINS). Nutze bitte „Als Datei sichern“ – oder gib dem Betreiber Bescheid." });
          return;
        }
        stop = receiveDeviceData({
        opener: window.opener as Window,
        allowedOrigins: config.legacyOrigins,
        onBatch: (stored, progress) => {
          total = addCounts(total, stored);
          setState({ kind: "receiving", stored: total, progress });
        },
        onDone: () => setState({ kind: "done", stored: total }),
        });
      })
      .catch(() => setState({ kind: "error", message: "Die Einstellungen konnten nicht geladen werden. Bist du online? Lade die Seite neu." }));
    return () => stop?.();
  }, []);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setState({ kind: "receiving", stored: NO_COUNTS, progress: null });
    try {
      const batch = await readMoveFile(await file.text());
      const stored = await applyMoveBatch(batch);
      setState({ kind: "done", stored });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Die Datei konnte nicht geladen werden.",
      });
    }
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
      <AutoUpdate enabled={state.kind !== "receiving"} />
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Leaf className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Little Farming</h1>
        <p className="text-sm text-muted-foreground">Umzug deiner Fotos</p>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        {state.kind === "receiving" && (
          <>
            {state.progress ? (
              <div className="w-full space-y-1.5" data-testid="move-progress">
                <Progress value={movePercent(state.progress)} aria-label="Fortschritt des Umzugs" />
                <p className="text-sm font-medium tabular-nums">
                  {movePercent(state.progress)} % · {state.progress.done} von {state.progress.total}
                </p>
              </div>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            )}
            <p className="text-sm text-muted-foreground">
              Verbunden – empfange … {describe(state.stored)} Bitte beide Fenster offen lassen.
            </p>
          </>
        )}

        {state.kind === "done" && (
          <>
            <PackageOpen className="h-8 w-8 text-primary" />
            <h2 className="text-lg font-semibold">Angekommen</h2>
            <p className="text-sm text-muted-foreground">
              {describe(state.stored)
                ? `${describe(state.stored)} – angekommen.`
                : "Alles war schon da."}{" "}
              Melde dich jetzt an, deine Fotos sind auf diesem Gerät.
            </p>
            <Button className="w-full gap-2" onClick={() => (window.location.href = `${base}/app`)}>
              Zu Little Farming
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {state.kind === "error" && (
          <p role="alert" className="w-full rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        )}

        {(state.kind === "waiting" || state.kind === "error") && (
          <>
            {hasOpener && state.kind === "waiting" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Warte auf die alte Adresse …
              </p>
            )}
            {hasOpener && state.kind === "waiting" && slow && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-900 dark:text-amber-200" data-testid="move-slow">
                Noch keine Verbindung. Ist das Fenster der alten Adresse noch offen? Lade es neu und tippe dort noch einmal auf „Daten mitnehmen und umziehen“. Klappt es weiter nicht, nimm „Als Datei sichern“.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Du hast auf der alten Adresse „Als Datei sichern“ gewählt? Dann lade die Datei hier:
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void importFile(e)}
            />
            <Button variant="outline" className="w-full gap-2" onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4" />
              Umzugsdatei laden
            </Button>
            <a href={`${base}/`} className="text-xs text-muted-foreground underline underline-offset-4">
              Ohne Umzug zur App
            </a>
          </>
        )}
      </div>
    </div>
  );
}
