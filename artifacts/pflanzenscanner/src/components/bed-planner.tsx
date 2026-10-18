import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History, Loader2, Search, Sun, Trash2 } from "lucide-react";
import {
  getGetBedHistoryQueryKey,
  getGetGardenCalendarQueryKey,
  getGetGardenCatalogQueryKey,
  getListPlantingsQueryKey,
  useAddPlanting,
  useGetBedHistory,
  useGetGardenCatalog,
  useListPlantings,
  useListPlants,
  useRemovePlanting,
  type BedPlanting,
  type Crop,
  type GardenBed,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HenniTip } from "@/components/henni";
import { BedPhoto } from "@/components/bed-photo";
import { BedCalendar } from "@/components/bed-calendar";
import { rotationIssues, rotationText, seasonSummary, type RotationIssue } from "@/lib/garden-calendar";
import { useToast } from "@/hooks/use-toast";
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
  planting,
  crop,
  plantings,
  crops,
  rotation,
  canWrite,
  busy,
  onRemove,
  onClose,
}: {
  planting: BedPlanting;
  crop: Crop | undefined;
  plantings: BedPlanting[];
  crops: Map<string, Crop>;
  rotation: RotationIssue[];
  canWrite: boolean;
  busy: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  const hints = neighbourHints(plantings, crops);
  const other = (pairs: { a: BedPlanting; b: BedPlanting }[]) =>
    pairs.filter((p) => p.a.id === planting.id || p.b.id === planting.id).map((p) => (p.a.id === planting.id ? p.b.label : p.a.label));
  const good = other(hints.good);
  const bad = other(hints.bad);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
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
  const [view, setView] = useState<"grid" | "photo">(bed.photoCorners ? "photo" : "grid");
  const catalog = useGetGardenCatalog({ query: { queryKey: getGetGardenCatalogQueryKey(), staleTime: Infinity } });
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
                  aria-label={`Feld ${x + 1}/${y + 1}${occupied(x, y) ? "" : " – frei"}`}
                  disabled={!canWrite || occupied(x, y)}
                  onClick={() => setCell({ x, y })}
                  className="aspect-square rounded-sm border border-dashed border-white/25 bg-[#6B5039] transition-colors enabled:hover:bg-[#7A5D44]"
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
                  onClick={() => setSelected(p)}
                  className={cn(
                    "z-10 flex items-center justify-center rounded-md p-0.5 shadow-sm",
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
        <div className="rounded-2xl border border-border bg-card p-3 text-sm">
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
          planting={selected}
          crop={selected.cropKey ? crops.get(selected.cropKey) : undefined}
          plantings={inside}
          crops={crops}
          rotation={rotationOf.get(selected.id) ?? []}
          canWrite={canWrite}
          busy={remove.isPending}
          onRemove={() => remove.mutate({ farmId, plantingId: selected.id })}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
