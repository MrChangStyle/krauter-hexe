import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Camera, Check, Copy, KeyRound, Loader2, Plus, Radar, Trash2, Zap } from "lucide-react";
import {
  getListCameraEventsQueryKey,
  getListCamerasQueryKey,
  useCreateCamera,
  useDeleteCamera,
  useEnsureOwnFarm,
  useListCameraEvents,
  useListCameras,
  useRotateCameraSecret,
  useUpdateCamera,
  type Camera as CameraT,
  type CameraWithSecret,
  type FarmSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { pickActiveFarm, readActiveFarmId } from "@/lib/active-farm";
import { AiNote } from "@/components/farm-ai";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

export function webhookUrl(origin: string = window.location.origin): string {
  return `${origin}/api/webhooks/camera`;
}

/** "vor 3 Min.", "vor 2 Std.", "12.10., 06:14" */
export function whenText(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  const minutes = Math.round((now.getTime() - t.getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (minutes < 24 * 60) return `vor ${Math.round(minutes / 60)} Std.`;
  return t.toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Kopiert" : "Kopieren"}
    </Button>
  );
}

/** Shown right after creating a camera or making a new secret – the only time. */
function SecretDialog({ result, onClose }: { result: CameraWithSecret; onClose: () => void }) {
  const url = webhookUrl();
  const curl = `curl -X POST -H "Authorization: Bearer ${result.secret}" -H "Content-Type: image/jpeg" --data-binary @bild.jpg ${url}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Zugang für „{result.camera.name}“</DialogTitle>
          <DialogDescription>
            Das Secret wird <strong>nur jetzt</strong> angezeigt. Trag es in der Kamera ein – geht es verloren, erzeugst du einfach ein neues.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3 text-sm">
          <div className="space-y-1">
            <Label>Adresse (Webhook, POST)</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 text-xs">{url}</code>
              <CopyButton value={url} label="Adresse kopieren" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Secret (Header „Authorization: Bearer …“)</Label>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 text-xs">{result.secret}</code>
              <CopyButton value={result.secret} label="Secret kopieren" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Bild senden</Label>
            <p className="text-muted-foreground">
              JPEG, PNG oder WebP bis 5 MB als Rohdaten (Content-Type image/jpeg) oder als JSON <code className="break-all">{'{"image": "data:image/jpeg;base64,…"}'}</code>. Höchstens ein Bild alle 10 Sekunden.
            </p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 text-xs">{curl}</code>
              <CopyButton value={curl} label="Beispiel kopieren" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Fertig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CameraDialog({
  farmId,
  camera,
  onClose,
  onSecret,
}: {
  farmId: number;
  /** null: new camera */
  camera: CameraT | null;
  onClose: () => void;
  onSecret: (r: CameraWithSecret) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(camera?.name ?? "");
  const [relayUrl, setRelayUrl] = useState(camera?.relayUrl ?? "");
  const [cooldownMinutes, setCooldownMinutes] = useState(String(Math.round((camera?.cooldownSeconds ?? 300) / 60)));
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListCamerasQueryKey(farmId) });
  const fail = (err: unknown) => setError(errorText(err, "Das hat nicht geklappt."));
  const create = useCreateCamera({
    mutation: {
      onSuccess(r) {
        void refresh();
        onSecret(r);
      },
      onError: fail,
    },
  });
  const update = useUpdateCamera({
    mutation: {
      onSuccess() {
        void refresh();
        onClose();
      },
      onError: fail,
    },
  });
  const remove = useDeleteCamera({
    mutation: {
      onSuccess() {
        void refresh();
        onClose();
      },
      onError: fail,
    },
  });
  const rotate = useRotateCameraSecret({ mutation: { onSuccess: onSecret, onError: fail } });
  const busy = create.isPending || update.isPending || remove.isPending || rotate.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const data = { name, relayUrl: relayUrl.trim() || null, cooldownSeconds: Math.round(Number(cooldownMinutes) * 60) };
    if (camera) update.mutate({ farmId, cameraId: camera.id, data });
    else create.mutate({ farmId, data });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{camera ? "Kamera bearbeiten" : "Neue Kamera"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cam-name">Name</Label>
            <Input id="cam-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Hühnerstall Nord" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cam-relay">Relais-Adresse (optional)</Label>
            <Input id="cam-relay" type="url" maxLength={500} value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">
              Wird bei Alarm aufgerufen (GET), z. B. die Cloud-Adresse eines Shelly-Relais für Licht oder Sirene. Muss aus dem Internet erreichbar sein.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cam-cooldown">Pause zwischen zwei Alarmen (Minuten)</Label>
            <Input id="cam-cooldown" type="number" min={1} max={1440} required value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-wrap gap-2">
            {camera && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Kamera „${camera.name}“ mit allen Ereignissen löschen?`)) remove.mutate({ farmId, cameraId: camera.id });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Neues Secret erzeugen? Das alte funktioniert dann sofort nicht mehr.")) {
                      rotate.mutate({ farmId, cameraId: camera.id });
                    }
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  Neues Secret
                </Button>
              </>
            )}
            <Button type="submit" disabled={busy} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {camera ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CamerasCard({ farm }: { farm: FarmSummary }) {
  const cameras = useListCameras(farm.id);
  const isAdmin = farm.role === "admin";
  const [dialog, setDialog] = useState<{ camera: CameraT | null; key: number } | null>(null);
  const [secret, setSecret] = useState<CameraWithSecret | null>(null);
  const list = cameras.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Camera className="h-4 w-4 text-primary" />
          Kameras
        </h2>
        {isAdmin && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog({ camera: null, key: Date.now() })}>
            <Plus className="h-4 w-4" />
            Kamera
          </Button>
        )}
      </div>
      {cameras.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Noch keine Kamera. Leg eine an: Du bekommst eine Adresse und ein Secret, an die deine Wildkamera ihre Bilder schickt."
            : "Auf dieser Farm ist noch keine Kamera eingerichtet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => {
            const body = (
              <>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.lastEventAt ? `Letztes Bild ${whenText(c.lastEventAt)}` : "Noch kein Bild empfangen"}
                  {c.lastTriggeredAt && ` · letzter Alarm ${whenText(c.lastTriggeredAt)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.hasRelay ? "Mit Relais" : "Ohne Relais"} · Pause {Math.round(c.cooldownSeconds / 60)} Min.
                </p>
              </>
            );
            return (
              <li key={c.id}>
                {isAdmin ? (
                  <button
                    type="button"
                    className="w-full space-y-0.5 rounded-xl border border-border bg-card p-3 text-left text-sm hover:bg-muted/50"
                    onClick={() => setDialog({ camera: c, key: Date.now() })}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="space-y-0.5 rounded-xl border border-border bg-card p-3 text-sm">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog && (
        <CameraDialog
          key={dialog.key}
          farmId={farm.id}
          camera={dialog.camera}
          onClose={() => setDialog(null)}
          onSecret={(r) => {
            setDialog(null);
            setSecret(r);
          }}
        />
      )}
      {secret && <SecretDialog result={secret} onClose={() => setSecret(null)} />}
    </section>
  );
}

function EventsCard({ farm }: { farm: FarmSummary }) {
  const events = useListCameraEvents(farm.id, {
    query: { queryKey: getListCameraEventsQueryKey(farm.id), refetchInterval: 60_000 },
  });
  const list = events.data ?? [];
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <Radar className="h-4 w-4 text-primary" />
        Ereignisse
      </h2>
      {events.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Bilder ausgewertet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((e) => (
            <li
              key={e.id}
              className={cn(
                "flex gap-3 rounded-xl border bg-card p-2.5 text-sm",
                e.predatorDetected ? "border-destructive/40" : "border-border",
              )}
            >
              {e.imageUrl ? (
                <a href={e.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={e.imageUrl} alt={e.species ?? "Kamerabild"} loading="lazy" className="h-16 w-20 rounded-lg object-cover" />
                </a>
              ) : (
                <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {e.predatorDetected ? (
                  <p className="flex items-center gap-1.5 font-semibold text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {e.species ?? "Beutegreifer"}
                    {e.confidence != null && <span className="font-normal">· {Math.round(e.confidence * 100)} %</span>}
                  </p>
                ) : (
                  <p className="font-medium text-muted-foreground">Kein Beutegreifer</p>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {e.cameraName} · {whenText(e.createdAt)}
                </p>
                {e.relayTriggered && (
                  <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <Zap className="h-3.5 w-3.5" />
                    Relais ausgelöst
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && <AiNote />}
    </section>
  );
}

/** /farm/kameras – Wildtier-Radar of the active farm. */
export default function FarmCamerasPage() {
  const [farms, setFarms] = useState<FarmSummary[] | null>(null);
  const ensure = useEnsureOwnFarm({ mutation: { onSuccess: (list) => setFarms(list) } });
  useEffect(() => {
    ensure.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const farm = farms ? pickActiveFarm(farms, readActiveFarmId()) : null;

  return (
    <div className="space-y-5 px-4 pb-6 pt-6">
      <Link href="/farm" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Meine Farm
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Wildtier-Radar</h1>
        {farm && <p className="text-sm text-muted-foreground">{farm.name}</p>}
      </div>
      <div className="flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          <span className="font-semibold">Kein Echtzeit-Alarm.</span> Der Server kann schlafen und braucht dann bis zu einer Minute zum
          Aufwachen – Push und Relais kommen entsprechend später. Zum sofortigen Abschrecken Licht oder Sirene direkt an der Kamera
          (Bewegungsmelder) auslösen.
        </p>
      </div>
      {!farm ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <>
          <CamerasCard farm={farm} />
          <EventsCard farm={farm} />
        </>
      )}
    </div>
  );
}
