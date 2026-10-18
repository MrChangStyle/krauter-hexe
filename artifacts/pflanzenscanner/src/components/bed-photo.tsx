import { useMemo, useRef, useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Compass, Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  getGetBedQueryKey,
  useRemoveBedPhoto,
  useSetBedPhoto,
  useSetBedPhotoCorners,
  type BedPlanting,
  type Crop,
  type GardenBed,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { HenniTip } from "@/components/henni";
import { useToast } from "@/hooks/use-toast";
import { downscaleFile } from "@/lib/image";
import { gridSize } from "@/lib/garden-planner";
import { apply, cellAt, headingText, invert, squareToQuad, type Point } from "@/lib/homography";

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Compass heading while the camera is open: iOS reports webkitCompassHeading,
 * others an absolute alpha (counter-clockwise from north).
 */
function useCompass() {
  const heading = useRef<number | null>(null);
  async function start() {
    try {
      const api = (globalThis as { DeviceOrientationEvent?: PermissionApi }).DeviceOrientationEvent;
      if (api?.requestPermission) await api.requestPermission();
    } catch {
      /* no compass then */
    }
    const handler = (e: Event) => {
      const ev = e as OrientationEvent;
      if (typeof ev.webkitCompassHeading === "number") heading.current = ev.webkitCompassHeading;
      else if (ev.absolute && typeof ev.alpha === "number") heading.current = (360 - ev.alpha) % 360;
    };
    window.addEventListener("deviceorientationabsolute", handler);
    window.addEventListener("deviceorientation", handler);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler);
      window.removeEventListener("deviceorientation", handler);
    };
  }
  return { heading, start };
}

const CORNER_HINTS = [
  "Tippe die Ecke an, an der Feld 1/1 liegt – zum Beispiel links hinten.",
  "Jetzt die Ecke entlang der Länge des Beetes.",
  "Jetzt die gegenüberliegende Ecke.",
  "Zum Schluss die letzte Ecke entlang der Breite.",
];

export function BedPhoto({
  farmId,
  bed,
  canWrite,
  plantings,
  crops,
  onCell,
  onPlanting,
}: {
  farmId: number;
  bed: GardenBed;
  canWrite: boolean;
  plantings: BedPlanting[];
  crops: Map<string, Crop>;
  onCell: (cell: { x: number; y: number }) => void;
  onPlanting: (p: BedPlanting) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const compass = useCompass();
  const stopCompass = useRef<(() => void) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [draft, setDraft] = useState<Point[] | null>(null);
  const { cols, rows } = gridSize(bed);
  const saved = (updated: GardenBed) => queryClient.setQueryData(getGetBedQueryKey(farmId, bed.id), updated);
  const fail = (err: unknown) => toast({ title: "Nicht gespeichert", description: errorText(err, "Bitte versuche es noch einmal."), variant: "destructive" });
  const upload = useSetBedPhoto({
    mutation: {
      onSuccess(updated) {
        saved(updated);
        setDraft([]);
      },
      onError: fail,
    },
  });
  const setCorners = useSetBedPhotoCorners({
    mutation: {
      onSuccess(updated) {
        saved(updated);
        setDraft(null);
      },
      onError: (err) => {
        fail(err);
        setDraft([]);
      },
    },
  });
  const remove = useRemoveBedPhoto({ mutation: { onSuccess: saved, onError: fail } });

  const corners = draft === null ? (bed.photoCorners ?? null) : null;
  const h = useMemo(() => (corners ? squareToQuad(corners) : null), [corners]);
  const inv = useMemo(() => (h ? invert(h) : null), [h]);
  const marking = canWrite && bed.photoUrl !== null && (draft !== null || !bed.photoCorners);
  const points = draft ?? [];

  async function choose() {
    stopCompass.current?.();
    stopCompass.current = await compass.start();
    input.current?.click();
  }

  function tap(event: MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const p = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
    if (marking) {
      const next = [...points, p];
      if (next.length < 4) setDraft(next);
      else {
        setDraft(next);
        setCorners.mutate({ farmId, bedId: bed.id, data: { corners: next } });
      }
      return;
    }
    if (!inv) return;
    const cell = cellAt(inv, p, cols, rows);
    if (!cell) return;
    const hit = plantings.find((pl) => cell.x >= pl.x && cell.x < pl.x + pl.w && cell.y >= pl.y && cell.y < pl.y + pl.h);
    if (hit) onPlanting(hit);
    else if (canWrite) onCell(cell);
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        stopCompass.current?.();
        if (!file) return;
        setPreparing(true);
        try {
          const imageData = await downscaleFile(file);
          upload.mutate({ farmId, bedId: bed.id, data: { imageData, heading: compass.heading.current } });
        } finally {
          setPreparing(false);
        }
      }}
    />
  );
  const busy = preparing || upload.isPending;

  if (!bed.photoUrl) {
    return (
      <div className="space-y-3 rounded-2xl border-2 border-dashed border-border p-4 text-sm">
        {fileInput}
        <p className="font-semibold">So gelingt das Beetfoto</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Das ganze Beet ist im Bild, alle vier Ecken sind sichtbar.</li>
          <li>Schräg von oben fotografieren, aus 1–3 m Abstand.</li>
          <li>Bei Tageslicht, ohne harte Schatten.</li>
        </ul>
        {canWrite ? (
          <Button className="gap-1.5" disabled={busy} onClick={() => void choose()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Beet fotografieren
          </Button>
        ) : (
          <p className="text-muted-foreground">Für dieses Beet gibt es noch kein Foto.</p>
        )}
        <p className="text-xs text-muted-foreground">Ohne Foto planst du einfach im Raster von oben.</p>
      </div>
    );
  }

  // Grid lines and plantings, perspective-correct on the photo (0–1 space).
  const line = (a: Point, b: Point, key: string) => {
    if (!h) return null;
    const p = apply(h, a);
    const q = apply(h, b);
    return <line key={key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="white" strokeOpacity={0.75} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />;
  };
  const quad = (pl: BedPlanting) => {
    if (!h) return "";
    const pts = [
      { x: pl.x / cols, y: pl.y / rows },
      { x: (pl.x + pl.w) / cols, y: pl.y / rows },
      { x: (pl.x + pl.w) / cols, y: (pl.y + pl.h) / rows },
      { x: pl.x / cols, y: (pl.y + pl.h) / rows },
    ].map((p) => apply(h, p));
    return pts.map((p) => `${p.x},${p.y}`).join(" ");
  };

  return (
    <div className="space-y-2">
      {fileInput}
      {marking && <HenniTip>{CORNER_HINTS[Math.min(points.length, 3)]}</HenniTip>}
      <div className="relative cursor-crosshair select-none overflow-hidden rounded-2xl" onClick={tap}>
        <img src={bed.photoUrl} alt={`Foto von ${bed.name}`} className="block w-full" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {h && (
            <>
              {Array.from({ length: cols + 1 }, (_, i) => line({ x: i / cols, y: 0 }, { x: i / cols, y: 1 }, `c${i}`))}
              {Array.from({ length: rows + 1 }, (_, i) => line({ x: 0, y: i / rows }, { x: 1, y: i / rows }, `r${i}`))}
              {plantings.map((pl) => (
                <polygon
                  key={pl.id}
                  points={quad(pl)}
                  fill={(pl.cropKey && crops.get(pl.cropKey)?.color) || "#7DBB6A"}
                  fillOpacity={0.6}
                  stroke="white"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </>
          )}
          {marking &&
            points.length > 1 &&
            points.slice(1).map((p, i) => (
              <line key={i} x1={points[i]!.x} y1={points[i]!.y} x2={p.x} y2={p.y} stroke="#B9E36A" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
        </svg>
        {h &&
          plantings.map((pl) => {
            const c = apply(h, { x: (pl.x + pl.w / 2) / cols, y: (pl.y + pl.h / 2) / rows });
            return (
              <span
                key={pl.id}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/60 px-1 text-[10px] font-semibold text-white"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              >
                {pl.label}
              </span>
            );
          })}
        {marking &&
          points.map((p, i) => (
            <span
              key={i}
              className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#14281D] text-xs font-bold text-white"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              {i + 1}
            </span>
          ))}
        {bed.photoHeading !== null && (
          <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#14281D] px-2 py-1 text-xs font-semibold text-white">
            <Compass className="h-3.5 w-3.5" />
            Blick nach {headingText(bed.photoHeading)}
          </span>
        )}
        {setCorners.isPending && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </span>
        )}
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDraft([])} disabled={setCorners.isPending}>
            <RotateCcw className="h-4 w-4" />
            Ecken neu setzen
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void choose()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Neues Foto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-destructive hover:text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Beetfoto entfernen? Der Pflanzplan bleibt erhalten.")) remove.mutate({ farmId, bedId: bed.id });
            }}
          >
            <Trash2 className="h-4 w-4" />
            Foto entfernen
          </Button>
        </div>
      )}
    </div>
  );
}
