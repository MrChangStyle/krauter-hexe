import { useEffect, useState } from "react";
import { Loader2, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { movePercent, type MoveCounts, type MoveProgress } from "@/lib/move";
import { pickUpParcels, waitingEntries } from "@/lib/move-account";

type State = { kind: "idle" } | { kind: "busy"; progress: MoveProgress } | { kind: "done"; stored: MoveCounts } | { kind: "error"; message: string };

/**
 * New address, signed in: fetches photos the old address put into the
 * account ("Über mein Konto umziehen") and stores them on this device.
 */
export function MovePickup() {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const waiting = await waitingEntries().catch(() => ({ parcels: 0, entries: 0 }));
      if (cancelled || waiting.parcels === 0) return;
      setState({ kind: "busy", progress: { done: 0, total: waiting.entries } });
      try {
        const stored = await pickUpParcels({
          total: waiting.entries,
          onProgress: (progress) => !cancelled && setState({ kind: "busy", progress }),
        });
        if (!cancelled) setState({ kind: "done", stored });
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : "Die Fotos konnten nicht abgeholt werden." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "idle") return null;
  return (
    <Dialog open onOpenChange={(o) => !o && state.kind !== "busy" && setState({ kind: "idle" })}>
      <DialogContent data-testid="move-pickup">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-primary" />
            Fotos von der alten Adresse
          </DialogTitle>
          <DialogDescription>
            {state.kind === "busy"
              ? "Deine Fotos kommen auf dieses Gerät … bitte die App offen lassen."
              : state.kind === "done"
                ? `${state.stored.images} ${state.stored.images === 1 ? "Foto" : "Fotos"}${state.stored.queue ? ` und ${state.stored.queue} aus der Warteschlange` : ""} übernommen.`
                : state.message}
          </DialogDescription>
        </DialogHeader>
        {state.kind === "busy" && (
          <div className="space-y-1.5" data-testid="move-progress">
            <Progress value={movePercent(state.progress)} aria-label="Fortschritt des Umzugs" />
            <p className="flex items-center gap-2 text-sm font-medium tabular-nums">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {movePercent(state.progress)} % · {state.progress.done} von {state.progress.total}
            </p>
          </div>
        )}
        {state.kind !== "busy" && (
          // Reload so lists that read this device's photos show them.
          <Button onClick={() => window.location.reload()}>Fertig</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
