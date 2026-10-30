import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, History, Loader2, Move, Search, Sparkles, Sun, Trash2, X } from "lucide-react";
import {
  getGetBedHistoryQueryKey,
  getGetGardenCalendarQueryKey,
  getGetGardenCatalogQueryKey,
  getListPlantingsQueryKey,
  useAddPlanting,
  useGetBedHistory,
  useGetGardenCatalog,
  useListPlantings,
  useMovePlanting,
  useListPlants,
  useRemovePlanting,
  useRequestCrop,
  suggestPlanting,
  useGetGardenGoals,
  getGetGardenGoalsQueryKey,
  type BedPlanting,
  type PlantingProposal,
  type PlantingSuggestionInput,
  type Crop,
  type GardenBed,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HenniTip } from "@/components/henni";
import { BedPhoto } from "@/components/bed-photo";
import { BedCalendar } from "@/components/bed-calendar";
import { HarvestLog } from "@/components/harvest-log";
import { PremiumBadge } from "@/components/premium-badge";
import { AutumnCard, RaisedBedCompanion } from "@/components/raised-bed-companion";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { rotationIssues, rotationText, seasonSummary, type RotationIssue } from "@/lib/garden-calendar";
import { useToast } from "@/hooks/use-toast";
import { AI_SUGGEST_WAIT_MS, withPlanTimeout } from "@/lib/ai-plan";
import { fitsAt, grabbedCell } from "@/lib/bed-move";
import { cn } from "@/lib/utils";
import {
  CELL_CM,
  bedLight,
  fits,
  footprint,
  gridSize,
  hennyLine,
  neighbourHints,
  plantsPerCell,
  speciesKey,
  tooShady,
  touching,
} from "@/lib/garden-planner";

const FEEDER_LABELS = { heavy: "Starkzehrer", medium: "Mittelzehrer", light: "Schwachzehrer" } as const;
const LIGHT_LABELS = { full: "volle Sonne", partial: "Sonne bis Halbschatten", shade: "auch Schatten" } as const;
const GROUP_LABELS = { vegetable: "Gemüse", herb: "Kräuter", flower: "Blumen", fruit: "Obst" } as const;

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

/** What placing a crop at a cell would mean: fits? which neighbours? */
function preview(crop: Crop, x: number, y: number, cols: number, rows: number, plantings: BedPlanting[], rotation: Rotation) {
  const side = footprint(crop);
  const rect = { x, y, w: side, h: side };
  const around = plantings.filter((p) => p.cropKey && p.cropKey !== crop.key && touching(rect, p));
  return {
    fits: fits(rect, cols, rows, plantings),
    side,
    bad: around.filter((p) => crop.bad.includes(p.cropKey!)).map((p) => p.label),
    good: around.filter((p) => crop.good.includes(p.cropKey!)).map((p) => p.label),
    rotation: rotationIssues(rect, crop, rotation.season, rotation.history, rotation.crops)[0],
  };
}

/** What crop rotation needs: earlier seasons of the bed. */
interface Rotation {
  season: number;
  history: BedPlanting[];
  crops: Map<string, Crop>;
}

function CropPicker({
  bed,
  cell,
  plantings,
  catalog,
  rotation,
  busy,
  onPick,
  onClose,
}: {
  bed: GardenBed;
  cell: { x: number; y: number };
  plantings: BedPlanting[];
  catalog: Crop[];
  rotation: Rotation;
  busy: boolean;
  onPick: (choice: { cropKey?: string; plantId?: number }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"catalog" | "archive">("catalog");
  const [query, setQuery] = useState("");
  const { cols, rows } = gridSize(bed);
  const light = bedLight(bed.sunHours);
  const archive = useListPlants(undefined, { query: { queryKey: ["/api/plants"], enabled: tab === "archive" } });
  const q = query.trim().toLowerCase();
  const crops = catalog.filter((c) => !q || c.name.toLowerCase().includes(q));
  const bySpecies = useMemo(() => new Map(catalog.map((c) => [speciesKey(c.botanicalName), c])), [catalog]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const request = useRequestCrop({
    mutation: {
      onSuccess({ draft, existing }) {
        void queryClient.invalidateQueries({ queryKey: getGetGardenCatalogQueryKey() });
        toast(
          draft.status === "approved"
            ? { title: `${draft.crop.name} ist schon im Katalog`, description: existing ? "Such im Katalog danach." : undefined }
            : {
                title: existing ? `${draft.crop.name} ist schon angefragt` : `Anbaudaten für ${draft.crop.name} angefragt`,
                description: "Sobald sie freigegeben sind, gelten sie für alle Beete.",
              },
        );
      },
      onError: (err) => toast({ title: "Nicht angefragt", description: errorText(err, "Die KI ist gerade nicht erreichbar."), variant: "destructive" }),
    },
  });
  const archivePlants = (archive.data ?? [])
    .filter((p) => p.category !== "poisonous" && p.category !== "mushroom")
    .filter((p) => !q || p.germanName.toLowerCase().includes(q))
    .slice(0, 40);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Was soll hier wachsen?</DialogTitle>
          <DialogDescription>
            Feld {cell.x + 1}/{cell.y + 1} · ein Feld ist {CELL_CM} × {CELL_CM} cm
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {(["catalog", "archive"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              {t === "catalog" ? "Gemüse, Kräuter & Co." : "Aus dem Pflanzenarchiv"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Suchen …" className="pl-8" aria-label="Pflanze suchen" />
        </div>

        {tab === "catalog" ? (
          <ul className="space-y-1.5">
            {crops.map((c) => {
              const p = preview(c, cell.x, cell.y, cols, rows, plantings, rotation);
              const shady = tooShady(c, light);
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    disabled={!p.fits || busy}
                    onClick={() => onPick({ cropKey: c.key })}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
                  >
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground"> · {GROUP_LABELS[c.group]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.side > 1 ? `${p.side} × ${p.side} Felder` : `${plantsPerCell(c)} je Feld`} · Abstand {c.spacingCm} cm
                      </span>
                      {!p.fits && <span className="block text-xs">Passt hier nicht hin.</span>}
                      {p.fits && p.bad.length > 0 && (
                        <span className="block text-xs font-medium text-destructive">Schlechter Nachbar: {p.bad.join(", ")}</span>
                      )}
                      {p.fits && p.good.length > 0 && (
                        <span className="block text-xs font-medium text-primary">Guter Nachbar: {p.good.join(", ")}</span>
                      )}
                      {p.fits && p.rotation && (
                        <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <History className="h-3 w-3 shrink-0" />
                          {p.rotation.kind === "family" ? `${p.rotation.season}: ${p.rotation.label} – gleiche Familie` : `${p.rotation.season}: ${p.rotation.label} – auch Starkzehrer`}
                        </span>
                      )}
                      {shady && (
                        <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <Sun className="h-3 w-3" />
                          braucht {LIGHT_LABELS[c.light]}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {crops.length === 0 && <li className="text-sm text-muted-foreground">Nichts gefunden – schau im Pflanzenarchiv.</li>}
            {query.trim().length >= 3 && !crops.some((c) => c.name.toLowerCase() === q) && (
              <li>
                <button
                  type="button"
                  disabled={request.isPending}
                  onClick={() => request.mutate({ data: { name: query.trim() } })}
                  className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border p-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                >
                  {request.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                  <span className="flex-1">„{query.trim()}“ fehlt? Anbaudaten per KI anfragen</span>
                  <PremiumBadge />
                </button>
              </li>
            )}
          </ul>
        ) : archive.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ul className="space-y-1.5">
            {archivePlants.map((plant) => {
              const crop = bySpecies.get(speciesKey(plant.botanicalName));
              const p = crop
                ? preview(crop, cell.x, cell.y, cols, rows, plantings, rotation)
                : { fits: fits({ x: cell.x, y: cell.y, w: 1, h: 1 }, cols, rows, plantings), side: 1, bad: [], good: [], rotation: undefined };
              return (
                <li key={plant.id}>
                  <button
                    type="button"
                    disabled={!p.fits || busy}
                    onClick={() => onPick({ plantId: plant.id })}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                  >
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full" style={{ background: crop?.color ?? "#7DBB6A" }} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{plant.germanName}</span>
                      <span className="block text-xs italic text-muted-foreground">{plant.botanicalName}</span>
                      {!crop && <span className="block text-xs text-muted-foreground">Ohne Anbaudaten – ein Feld, keine Nachbarprüfung.</span>}
                      {p.bad.length > 0 && <span className="block text-xs font-medium text-destructive">Schlechter Nachbar: {p.bad.join(", ")}</span>}
                      {p.rotation && <span className="block text-xs text-amber-700 dark:text-amber-400">{rotationText(p.rotation)}</span>}
                    </span>
                  </button>
                  {!crop && (
                    <button
                      type="button"
                      disabled={request.isPending}
                      onClick={() => request.mutate({ data: { plantId: plant.id } })}
                      className="ml-9 mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      Anbaudaten per KI anfragen
                    </button>
                  )}
                </li>
              );
            })}
            {archivePlants.length === 0 && <li className="text-sm text-muted-foreground">Keine passende Pflanze im Archiv.</li>}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlantingDialog({
  farmId,
  planting,
  crop,
  plantings,
  crops,
  rotation,
  canWrite,
  busy,
  onRemove,
  onMove,
  onClose,
}: {
  farmId: number;
  planting: BedPlanting;
  crop: Crop | undefined;
  plantings: BedPlanting[];
  crops: Map<string, Crop>;
  rotation: RotationIssue[];
  canWrite: boolean;
  busy: boolean;
  onRemove: () => void;
  /** Verschieben: pick a new spot on the grid. */
  onMove?: () => void;
  onClose: () => void;
}) {
  const hints = neighbourHints(plantings, crops);
  const other = (pairs: { a: BedPlanting; b: BedPlanting }[]) =>
    pairs.filter((p) => p.a.id === planting.id || p.b.id === planting.id).map((p) => (p.a.id === planting.id ? p.b.label : p.a.label));
  const good = other(hints.good);
  const bad = other(hints.bad);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full" style={{ background: crop?.color ?? "#7DBB6A" }} />
            {planting.label}
          </DialogTitle>
          <DialogDescription>
            {planting.w} × {planting.h} {planting.w * planting.h === 1 ? "Feld" : "Felder"}
            {crop && planting.w === 1 ? ` · ${plantsPerCell(crop)} Pflanzen` : ""}
          </DialogDescription>
        </DialogHeader>
        {crop ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Familie</dt>
            <dd>{crop.family}</dd>
            <dt className="text-muted-foreground">Nährstoffe</dt>
            <dd>{FEEDER_LABELS[crop.feeder]}</dd>
            <dt className="text-muted-foreground">Abstand</dt>
            <dd>
              {crop.spacingCm} cm, Reihe {crop.rowSpacingCm} cm
            </dd>
            <dt className="text-muted-foreground">Licht</dt>
            <dd>{LIGHT_LABELS[crop.light]}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Für diese Pflanze gibt es noch keine Anbaudaten.</p>
        )}
        {bad.length > 0 && <p className="text-sm font-medium text-destructive">Verträgt sich nicht mit: {bad.join(", ")}</p>}
        {good.length > 0 && <p className="text-sm font-medium text-primary">Gute Nachbarn: {good.join(", ")}</p>}
        {rotation.map((issue) => (
          <p key={`${issue.kind}-${issue.season}-${issue.label}`} className="flex gap-1.5 text-sm text-amber-700 dark:text-amber-400">
            <History className="mt-0.5 h-4 w-4 shrink-0" />
            {rotationText(issue)}
          </p>
        ))}
        <HarvestLog farmId={farmId} planting={planting} canWrite={canWrite} />
        {canWrite && onMove && (
          <Button variant="outline" className="gap-1.5" disabled={busy} onClick={onMove}>
            <Move className="h-4 w-4" />
            Verschieben
          </Button>
        )}
        {canWrite && (
          <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={onRemove}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Aus dem Beet nehmen
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The 30-cm grid of a bed for one season, with Henni's neighbour hints. */
export function BedPlanner({ farmId, bed, canWrite }: { farmId: number; bed: GardenBed; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [season, setSeason] = useState(new Date().getFullYear());
  const [cell, setCell] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<BedPlanting | null>(null);
  // Verschieben: tap mode (from the planting's dialog) and dragging with the finger.
  const [moving, setMoving] = useState<BedPlanting | null>(null);
  const [drag, setDrag] = useState<{ planting: BedPlanting; x: number; y: number } | null>(null);
  const dragStart = useRef<{ planting: BedPlanting; px: number; py: number; dx: number; dy: number; active: boolean } | null>(null);
  const [view, setView] = useState<"grid" | "photo">(bed.photoCorners ? "photo" : "grid");
  const [asking, setAsking] = useState(false);
  const [wishes, setWishes] = useState("");
  // Fodder share for the KI-Vorschlag (%): from the link of the Garten-Assistent, else the garden goals.
  const [animalShare, setAnimalShare] = useState<number | null>(null);
  const [proposal, setProposal] = useState<PlantingProposal | null>(null);
  const [applying, setApplying] = useState(false);
  // A suggestion belongs to the season it was made for.
  useEffect(() => setProposal(null), [season]);
  // The Garten-Assistent links here with wishes for the KI-Vorschlag.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wish = params.get("ki");
    const share = Number(params.get("futter"));
    if (params.has("futter") && Number.isInteger(share) && share >= 0 && share <= 100) setAnimalShare(share);
    if (wish && canWrite) {
      setWishes(wish.slice(0, 300));
      setAsking(true);
    }
  }, [canWrite]);
  const goals = useGetGardenGoals(farmId, { query: { queryKey: getGetGardenGoalsQueryKey(farmId), staleTime: 5 * 60 * 1000 } });
  const share = animalShare ?? goals.data?.animalShare ?? 0;
  const catalog = useGetGardenCatalog({ query: { queryKey: getGetGardenCatalogQueryKey(), staleTime: 5 * 60 * 1000 } });
  const plantingsQuery = useListPlantings(farmId, bed.id, season);
  const historyQuery = useGetBedHistory(farmId, bed.id);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListPlantingsQueryKey(farmId, bed.id, season) }),
      queryClient.invalidateQueries({ queryKey: getGetBedHistoryQueryKey(farmId, bed.id) }),
      queryClient.invalidateQueries({ queryKey: getGetGardenCalendarQueryKey(farmId, season) }),
    ]);
  const add = useAddPlanting({
    mutation: {
      onSuccess() {
        setCell(null);
        void refresh();
      },
      onError: (err) => toast({ title: "Nicht gesetzt", description: errorText(err, "Bitte versuche es noch einmal."), variant: "destructive" }),
    },
  });
  // Never spins for ever: the server has a time budget, the app stops waiting after it.
  const suggest = useMutation({
    mutationFn: (v: { farmId: number; bedId: number; season: number; data: PlantingSuggestionInput }) =>
      withPlanTimeout(suggestPlanting(v.farmId, v.bedId, v.season, v.data), AI_SUGGEST_WAIT_MS),
    onSuccess(result: PlantingProposal) {
      setAsking(false);
      setView("grid");
      setProposal(result);
    },
    onError: (err) => toast({ title: "Kein Vorschlag", description: errorText(err, "Die KI ist gerade nicht erreichbar."), variant: "destructive" }),
  });
  const addOne = useAddPlanting();
  async function applyProposal(items: PlantingProposal["items"]) {
    setApplying(true);
    let failed = 0;
    for (const item of items) {
      try {
        await addOne.mutateAsync({ farmId, bedId: bed.id, season, data: { cropKey: item.cropKey, x: item.x, y: item.y } });
      } catch {
        failed += 1;
      }
    }
    setApplying(false);
    setProposal(null);
    await refresh();
    toast({
      title: `${items.length - failed} ${items.length - failed === 1 ? "Pflanzung" : "Pflanzungen"} übernommen`,
      description: failed > 0 ? `${failed} passten inzwischen nicht mehr.` : undefined,
    });
  }
  const move = useMovePlanting({
    mutation: {
      onSuccess() {
        setMoving(null);
        void refresh();
      },
      onError: (err) => toast({ title: "Nicht verschoben", description: errorText(err, "Bitte versuche es noch einmal."), variant: "destructive" }),
    },
  });
  const moveTo = (p: BedPlanting, x: number, y: number) => {
    if (p.x === x && p.y === y) return setMoving(null);
    // Shown at once; the list reloads after the server agreed.
    queryClient.setQueryData<BedPlanting[]>(getListPlantingsQueryKey(farmId, bed.id, season), (old) => old?.map((o) => (o.id === p.id ? { ...o, x, y } : o)));
    move.mutate({ farmId, plantingId: p.id, data: { x, y } });
  };
  const remove = useRemovePlanting({
    mutation: {
      onSuccess() {
        setSelected(null);
        void refresh();
      },
      onError: () => toast({ title: "Nicht entfernt", variant: "destructive" }),
    },
  });

  const { cols, rows } = gridSize(bed);
  const crops = useMemo(() => new Map((catalog.data ?? []).map((c) => [c.key, c])), [catalog.data]);
  const all = plantingsQuery.data ?? [];
  const inside = all.filter((p) => p.x + p.w <= cols && p.y + p.h <= rows);
  const outside = all.length - inside.length;
  const hints = neighbourHints(inside, crops);
  const light = bedLight(bed.sunHours);
  const shady = inside.filter((p) => p.cropKey && crops.get(p.cropKey) && tooShady(crops.get(p.cropKey)!, light)).map((p) => p.label);
  const badIds = new Set(hints.bad.flatMap((p) => [p.a.id, p.b.id]));
  const history = historyQuery.data ?? [];
  const rotation: Rotation = { season, history, crops };
  const rotationOf = new Map(
    inside.map((p) => {
      const crop = p.cropKey ? crops.get(p.cropKey) : undefined;
      return [p.id, crop ? rotationIssues(p, crop, season, history, crops) : []] as const;
    }),
  );
  const firstRotation = inside.flatMap((p) => rotationOf.get(p.id) ?? [])[0];
  const earlier = seasonSummary(history, crops, season).filter((s) => s.labels.length > 0);
  const occupied = (x: number, y: number) => inside.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);
  const cellPx = cols > 10 ? 34 : undefined;

  // Dragging: the cell under the finger, minus the cell of the planting it holds.
  const cellAt = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-cell]");
    return el ? { x: Number(el.dataset.x), y: Number(el.dataset.y) } : null;
  };
  const onPlantingDown = (p: BedPlanting, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canWrite || proposal || moving) return;
    const g = grabbedCell(p, e.currentTarget.getBoundingClientRect(), { x: e.clientX, y: e.clientY });
    dragStart.current = { planting: p, px: e.clientX, py: e.clientY, ...g, active: false };
  };
  const onPlantingMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragStart.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < 8) return;
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const c = cellAt(e.clientX, e.clientY);
    if (c) setDrag({ planting: d.planting, x: c.x - d.dx, y: c.y - d.dy });
  };
  const onPlantingUp = (p: BedPlanting) => {
    const d = dragStart.current;
    dragStart.current = null;
    if (!d?.active) {
      if (moving) return;
      return setSelected(p);
    }
    const target = drag;
    setDrag(null);
    if (target && fitsAt(p, target.x, target.y, inside, cols, rows)) moveTo(p, target.x, target.y);
    else if (target) toast({ title: "Passt dort nicht hin", description: "Das Feld ist belegt oder liegt am Rand.", variant: "destructive" });
  };
  const dropOk = drag ? fitsAt(drag.planting, drag.x, drag.y, inside, cols, rows) : false;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Pflanzplan</h2>
        <div className="flex items-center gap-1 text-sm">
          <button type="button" aria-label="Vorjahr" className="rounded-full p-1.5 hover:bg-muted" onClick={() => setSeason(season - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-semibold tabular-nums">{season}</span>
          <button type="button" aria-label="Folgejahr" className="rounded-full p-1.5 hover:bg-muted" onClick={() => setSeason(season + 1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <HenniTip>{hennyLine(hints, shady, inside.length === 0, firstRotation ? rotationText(firstRotation) : null)}</HenniTip>

      <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="tablist" aria-label="Ansicht" className="inline-flex rounded-full bg-muted p-1 text-sm">
        {(["grid", "photo"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn("rounded-full px-4 py-1 font-medium", view === v ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            {v === "grid" ? "Raster" : "Foto"}
          </button>
        ))}
      </div>
      {canWrite && !proposal && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAsking(true)}>
          <Sparkles className="h-4 w-4" />
          KI-Vorschlag
          <PremiumBadge />
        </Button>
      )}
      </div>

      {moving && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm" data-testid="moving-banner">
          <span>
            <span className="font-medium">„{moving.label}“ verschieben:</span> Tippe auf das Feld, wo sie hin soll{moving.w > 1 ? " (linke obere Ecke)" : ""}.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setMoving(null)}>
            Abbrechen
          </Button>
        </div>
      )}
      {plantingsQuery.isLoading || catalog.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : view === "photo" ? (
        <BedPhoto farmId={farmId} bed={bed} canWrite={canWrite} plantings={inside} crops={crops} onCell={setCell} onPlanting={setSelected} />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-[#5C4330] p-2">
          <div
            className="relative grid gap-0.5"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cellPx ? `${cellPx}px` : "minmax(0, 1fr)"})`,
              width: cellPx ? cols * (cellPx + 2) : undefined,
            }}
          >
            {Array.from({ length: rows }, (_, y) =>
              Array.from({ length: cols }, (_, x) => (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  data-cell=""
                  data-x={x}
                  data-y={y}
                  aria-label={
                    moving
                      ? `${moving.label} nach Feld ${x + 1}/${y + 1}${fitsAt(moving, x, y, inside, cols, rows) ? "" : " – passt nicht"}`
                      : `Feld ${x + 1}/${y + 1}${occupied(x, y) ? "" : " – frei"}`
                  }
                  disabled={!canWrite || (moving ? !fitsAt(moving, x, y, inside, cols, rows) : occupied(x, y))}
                  onClick={() => (moving ? moveTo(moving, x, y) : setCell({ x, y }))}
                  className={cn(
                    "aspect-square rounded-sm border border-dashed border-white/25 bg-[#6B5039] transition-colors enabled:hover:bg-[#7A5D44]",
                    moving && fitsAt(moving, x, y, inside, cols, rows) && "border-solid border-white/70 bg-[#7A5D44]",
                  )}
                  style={{ gridColumn: x + 1, gridRow: y + 1 }}
                />
              )),
            )}
            {inside.map((p) => {
              const crop = p.cropKey ? crops.get(p.cropKey) : undefined;
              return (
                <button
                  key={p.id}
                  type="button"
                  onPointerDown={(e) => onPlantingDown(p, e)}
                  onPointerMove={onPlantingMove}
                  onPointerUp={() => onPlantingUp(p)}
                  onPointerCancel={() => {
                    dragStart.current = null;
                    setDrag(null);
                  }}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected(p))}
                  className={cn(
                    "z-10 flex touch-none select-none items-center justify-center rounded-md p-0.5 shadow-sm",
                    canWrite && "cursor-grab",
                    (drag?.planting.id === p.id || moving?.id === p.id) && "pointer-events-none opacity-40",
                    badIds.has(p.id)
                      ? "ring-2 ring-destructive ring-offset-1 ring-offset-[#5C4330]"
                      : (rotationOf.get(p.id)?.length ?? 0) > 0 && "ring-2 ring-amber-400 ring-offset-1 ring-offset-[#5C4330]",
                  )}
                  style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}`, background: crop?.color ?? "#7DBB6A" }}
                  aria-label={`${p.label}, ${p.w} × ${p.h} Felder`}
                >
                  <span className="max-w-full truncate rounded bg-black/55 px-1 text-[10px] font-semibold leading-4 text-white">{p.label}</span>
                </button>
              );
            })}
            {drag && (
              <span
                className={cn("pointer-events-none z-30 rounded-md border-2 border-dashed", dropOk ? "border-white bg-white/30" : "border-red-400 bg-red-500/30")}
                style={{ gridColumn: `${Math.max(0, drag.x) + 1} / span ${drag.planting.w}`, gridRow: `${Math.max(0, drag.y) + 1} / span ${drag.planting.h}` }}
                aria-hidden="true"
              />
            )}
            {proposal?.items.map((item) => (
              <span
                key={`p-${item.x}-${item.y}`}
                className="pointer-events-none z-20 flex items-center justify-center rounded-md border-2 border-dashed border-white p-0.5 opacity-80"
                style={{ gridColumn: `${item.x + 1} / span ${item.w}`, gridRow: `${item.y + 1} / span ${item.h}`, background: crops.get(item.cropKey)?.color ?? "#7DBB6A" }}
                aria-label={`Vorschlag: ${item.label}`}
              >
                <span className="max-w-full truncate rounded bg-black/55 px-1 text-[10px] font-semibold leading-4 text-white">{item.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {proposal && (
        <div className="space-y-2 rounded-2xl border-2 border-dashed border-primary/50 bg-card p-3 text-sm" role="region" aria-label="KI-Vorschlag">
          <p className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            KI-Vorschlag: {proposal.items.length} {proposal.items.length === 1 ? "Pflanzung" : "Pflanzungen"}
          </p>
          {proposal.notes && <p>{proposal.notes}</p>}
          {proposal.fodderShare !== null && proposal.fodderShare !== undefined && (
            <p className="font-medium" data-testid="proposal-fodder-share">
              Tierfutter: {proposal.fodderShare} % der Felder · Küche: {100 - proposal.fodderShare} %
              {share > 0 && <span className="font-normal text-muted-foreground"> (gewünscht {share} %)</span>}
            </p>
          )}
          {proposal.items.length > 0 && (
            <p className="text-muted-foreground">{proposal.items.map((i) => (i.purpose === "fodder" ? `${i.label} (Futter)` : i.label)).join(", ")}</p>
          )}
          {proposal.dropped.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">Nach den festen Regeln aussortiert:</p>
              <ul className="list-disc pl-5">
                {proposal.dropped.map((d, i) => (
                  <li key={i}>
                    {d.label}: {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" disabled={applying || proposal.items.length === 0} onClick={() => void applyProposal(proposal.items)}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Übernehmen
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={applying} onClick={() => setProposal(null)}>
              <X className="h-4 w-4" />
              Verwerfen
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {cols} × {rows} Felder à {CELL_CM} cm{canWrite ? " · freies Feld antippen zum Bepflanzen, Pflanze antippen für Details" : ""}
      </p>
      {outside > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {outside} {outside === 1 ? "Pflanzung liegt" : "Pflanzungen liegen"} außerhalb des verkleinerten Beetes und {outside === 1 ? "wird" : "werden"} nicht angezeigt.
        </p>
      )}

      {earlier.length > 0 && (
        <div className="rounded-xl border bg-card p-3 text-sm">
          <p className="mb-1.5 flex items-center gap-1.5 font-medium">
            <History className="h-4 w-4 text-primary" />
            Belegung der letzten Jahre
          </p>
          <ul className="space-y-1">
            {earlier.map((s) => (
              <li key={s.season} className="grid grid-cols-[3rem_1fr] gap-2">
                <span className="font-semibold tabular-nums">{s.season}</span>
                <span className="min-w-0">
                  {s.labels.join(", ")}
                  {s.families.length > 0 && <span className="block text-xs text-muted-foreground">{s.families.join(", ")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BedCalendar farmId={farmId} bedId={bed.id} season={season} canWrite={canWrite} plantings={inside} crops={crops} />

      {bed.type === "raised" && <RaisedBedCompanion bed={bed} season={season} plantings={inside} crops={crops} />}
      {catalog.data && <AutumnCard bed={bed} season={season} catalog={catalog.data} />}

      {asking && (
        <Dialog open onOpenChange={(o) => !o && !suggest.isPending && setAsking(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                KI-Vorschlag für {season}
                <PremiumBadge />
              </DialogTitle>
              <DialogDescription>
                Die KI füllt die freien Felder nach Mischkultur und Fruchtfolge. Die festen Regeln prüfen jeden Vorschlag – du entscheidest danach.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={wishes}
              maxLength={300}
              onChange={(e) => setWishes(e.target.value)}
              placeholder="Wünsche, z. B. viel Salat, Kräuter für die Küche, keine Zucchini"
              aria-label="Wünsche"
            />
            <div className="space-y-1.5" data-testid="fodder-share">
              <Label htmlFor="bed-fodder-share">
                Für die Tiere: <span className="font-semibold">{share} %</span> · für die Küche: <span className="font-semibold">{100 - share} %</span>
              </Label>
              <input
                id="bed-fodder-share"
                type="range"
                min={0}
                max={100}
                step={10}
                value={share}
                onChange={(e) => setAnimalShare(Number(e.target.value))}
                className="w-full accent-[#2F6B3F]"
              />
              <p className="text-xs text-muted-foreground">
                Wie viel des Beetes Futter für deine Tiere werden soll, z. B. Mangold und Salat für die Hühner – die KI nimmt dafür nur Pflanzen, die für deine Tiere geeignet sind. Vorgabe aus dem Garten-Assistenten.
              </p>
            </div>
            <Button
              className="gap-1.5"
              disabled={suggest.isPending}
              onClick={() => suggest.mutate({ farmId, bedId: bed.id, season, data: { wishes: wishes.trim() || null, animalShare: share } })}
            >
              {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Vorschlag holen
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {cell && catalog.data && (
        <CropPicker
          bed={bed}
          cell={cell}
          plantings={inside}
          catalog={catalog.data}
          rotation={rotation}
          busy={add.isPending}
          onPick={(choice) => add.mutate({ farmId, bedId: bed.id, season, data: { ...choice, x: cell.x, y: cell.y } })}
          onClose={() => setCell(null)}
        />
      )}
      {selected && (
        <PlantingDialog
          farmId={farmId}
          planting={selected}
          crop={selected.cropKey ? crops.get(selected.cropKey) : undefined}
          plantings={inside}
          crops={crops}
          rotation={rotationOf.get(selected.id) ?? []}
          canWrite={canWrite}
          busy={remove.isPending}
          onRemove={() => remove.mutate({ farmId, plantingId: selected.id })}
          onMove={() => {
            setMoving(selected);
            setSelected(null);
            setView("grid");
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
