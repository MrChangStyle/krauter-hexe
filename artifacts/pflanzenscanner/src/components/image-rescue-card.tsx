import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Loader2, CheckCircle2 } from "lucide-react";
import { useListInsects, useListPlants } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { hasImage } from "@/lib/image-store";
import { backupOneImage } from "@/lib/use-image-backup";

/**
 * "Bilder sichern": finds archive entries whose photo exists ONLY in this
 * device's local storage and uploads them, with visible progress.
 *
 * Why a visible card instead of the silent background backup: before the app
 * moves to its new domain, every such photo must be uploaded from the device
 * that took it. A silent, once-per-session upload gives no feedback, so people
 * close the app early and the photos are lost with the old domain.
 */

type Entry = { type: "plant" | "insect"; id: number; localImageId: string };

function hasCdnImage(imageUrl: string | null | undefined): boolean {
  return typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl);
}

export function ImageRescueCard() {
  const queryClient = useQueryClient();
  const { data: plants } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });
  const { data: insects } = useListInsects({
    query: { queryKey: ["/api/insects"] },
  });

  // Entries without a shared photo but with a local photo key.
  const candidates = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const p of plants ?? []) {
      if (!hasCdnImage(p.imageUrl) && p.localImageId) {
        list.push({ type: "plant", id: p.id, localImageId: p.localImageId });
      }
    }
    for (const i of insects ?? []) {
      if (!hasCdnImage(i.imageUrl) && i.localImageId) {
        list.push({ type: "insect", id: i.id, localImageId: i.localImageId });
      }
    }
    return list;
  }, [plants, insects]);

  // Of those, the ones whose photo is actually on THIS device.
  const [onDevice, setOnDevice] = useState<Entry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found: Entry[] = [];
      for (const c of candidates) {
        if (await hasImage(c.localImageId)) found.push(c);
      }
      if (!cancelled) setOnDevice(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [finished, setFinished] = useState(false);
  const cancelRef = useRef(false);

  useEffect(
    () => () => {
      cancelRef.current = true;
    },
    [],
  );

  const run = useCallback(async () => {
    if (!onDevice?.length) return;
    cancelRef.current = false;
    setRunning(true);
    setFinished(false);
    setDone(0);
    setFailed(0);
    let ok = 0;
    let bad = 0;
    for (const entry of onDevice) {
      if (cancelRef.current) break;
      const stored = await backupOneImage(entry.type, entry.id, entry.localImageId);
      if (stored) ok += 1;
      else bad += 1;
      setDone(ok + bad);
      setFailed(bad);
    }
    setRunning(false);
    setFinished(true);
    if (ok > 0) {
      void queryClient.invalidateQueries({ queryKey: ["/api/plants"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/insects"] });
    }
  }, [onDevice, queryClient]);

  // Nothing to rescue on this device and no run in progress: stay out of the way.
  if (onDevice === null) return null;
  if (onDevice.length === 0 && !finished) return null;

  const total = onDevice.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 100;

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        {finished && failed === 0 ? (
          <CheckCircle2 className="w-4 h-4 text-primary" />
        ) : (
          <CloudUpload className="w-4 h-4 text-primary" />
        )}
        <span className="text-sm font-semibold">Bilder sichern</span>
      </div>

      {finished ? (
        <p className="text-xs text-muted-foreground">
          {failed === 0
            ? `Fertig: ${done} ${done === 1 ? "Foto ist" : "Fotos sind"} jetzt für alle sichtbar und gesichert.`
            : `${done - failed} von ${total} Fotos gesichert. ${failed} ${failed === 1 ? "hat" : "haben"} nicht geklappt – bitte bei gutem Empfang noch einmal versuchen.`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          {total === 1 ? "1 Foto liegt" : `${total} Fotos liegen`} nur auf diesem
          Gerät. Sichere {total === 1 ? "es" : "sie"} jetzt, damit{" "}
          {total === 1 ? "es" : "sie"} für alle sichtbar {total === 1 ? "ist" : "sind"} und
          bei einem Handywechsel nicht verloren {total === 1 ? "geht" : "gehen"}.
          Bitte die App dabei geöffnet lassen.
        </p>
      )}

      {running && (
        <div className="space-y-1.5 mb-3">
          <Progress value={percent} />
          <p className="text-xs text-muted-foreground">
            {done} von {total} gesichert
          </p>
        </div>
      )}

      {!running && (!finished || failed > 0) && total > 0 && (
        <Button size="sm" onClick={() => void run()}>
          <CloudUpload className="w-4 h-4 mr-1.5" />
          {finished ? "Erneut versuchen" : "Jetzt sichern"}
        </Button>
      )}
      {running && (
        <Button size="sm" disabled>
          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          Wird gesichert …
        </Button>
      )}
    </div>
  );
}
