import { useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Camera, ChevronDown, Leaf, Loader2, Skull, Sparkles, Trash2, Wheat } from "lucide-react";
import {
  getGetHusbandryGuideQueryKey,
  getListFeedAnalysesQueryKey,
  useAnalyzeFeed,
  useDeleteFeedAnalysis,
  useGetHusbandryGuide,
  useListFeedAnalyses,
  useListToxicPlants,
  useSuggestFarmAnimalSpecies,
  type FarmSpecies,
  type FeedLog,
  type SpeciesSuggestion,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { downscaleFile } from "@/lib/image";
import { SPECIES_LABELS } from "@/lib/farm-labels";
import { deDate } from "@/lib/farm-health";

export const AI_NOTE = "KI-Einschätzung – ersetzt keinen Tierarzt";

/** Farm species the plant archive keeps a toxicity status for. */
export const ARCHIVE_SPECIES: ReadonlySet<FarmSpecies> = new Set(["poultry", "rabbit", "guineaPig", "cat", "horse"]);

function errorText(err: unknown, fallback: string): string {
  return (err as { data?: { error?: string } } | null)?.data?.error ?? fallback;
}

export function AiNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      {AI_NOTE}
    </p>
  );
}

/** A section that opens on tap and only then loads its content. */
function Collapsible({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** Rendered (and so fetched) only once opened. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold"
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-3 border-t border-border px-4 py-3 text-sm">{children}</div>}
    </section>
  );
}

// ── Species suggestion (animal form) ─────────────────────────────────────────

export function SpeciesSuggestionBox({
  farmId,
  photo,
  onApply,
}: {
  farmId: number;
  photo: string;
  onApply: (species: FarmSpecies, breed: string | null) => void;
}) {
  const [result, setResult] = useState<{ photo: string; suggestion: SpeciesSuggestion } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggest = useSuggestFarmAnimalSpecies({
    mutation: {
      onSuccess: (suggestion) => setResult({ photo, suggestion }),
      onError: (err) => setError(errorText(err, "Die KI ist gerade nicht erreichbar.")),
    },
  });
  // A new photo makes an old suggestion meaningless.
  const current = result?.photo === photo ? result.suggestion : null;

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      {!current ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={suggest.isPending}
          onClick={() => {
            setError(null);
            suggest.mutate({ farmId, data: { imageData: photo } });
          }}
        >
          {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Tierart per KI vorschlagen
        </Button>
      ) : !current.isAnimal || !current.species ? (
        <p className="text-sm text-muted-foreground">Auf dem Foto ist kein Tier sicher zu erkennen.</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm">
            <span className="font-medium">{SPECIES_LABELS[current.species]}</span>
            {current.breed && <span> · {current.breed}</span>}
            <span className="text-muted-foreground"> ({Math.round(current.confidence * 100)} % sicher)</span>
          </p>
          <Button type="button" size="sm" onClick={() => onApply(current.species!, current.breed)}>
            Übernehmen
          </Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AiNote />
    </div>
  );
}

// ── Haltungs-Wiki ────────────────────────────────────────────────────────────

function HusbandryBody({ farmId, species }: { farmId: number; species: FarmSpecies }) {
  const guide = useGetHusbandryGuide(farmId, species, {
    query: { queryKey: getGetHusbandryGuideQueryKey(farmId, species), staleTime: Infinity, retry: false },
  });
  if (guide.isLoading) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Wird geladen – beim ersten Mal schreibt die KI es neu …
      </p>
    );
  }
  if (!guide.data) return <p className="text-destructive">{errorText(guide.error, "Das Haltungs-Wiki ist gerade nicht verfügbar.")}</p>;
  const g = guide.data;
  const parts: Array<[string, string]> = [
    ["Ernährung", g.nutrition],
    ["Haltung", g.housing],
    ["Pflege", g.care],
    ["Gesundheit", g.health],
    ["Lebenserwartung", g.lifeExpectancy],
  ];
  return (
    <>
      <p>{g.summary}</p>
      {parts.map(([label, text]) => (
        <div key={label}>
          <h3 className="font-semibold">{label}</h3>
          <p className="text-muted-foreground">{text}</p>
        </div>
      ))}
      <AiNote />
    </>
  );
}

export function HusbandrySection({ farmId, species }: { farmId: number; species: FarmSpecies }) {
  if (species === "other") return null;
  return (
    <Collapsible icon={<BookOpen className="h-4 w-4 text-primary" />} title={`Haltungs-Wiki: ${SPECIES_LABELS[species]}`}>
      <HusbandryBody farmId={farmId} species={species} />
    </Collapsible>
  );
}

// ── Poisonous plants from the archive ────────────────────────────────────────

const LEVEL_LABELS = { intolerant: "unverträglich", poisonous: "giftig", lethal: "tödlich" } as const;

function ToxicPlantsBody({ farmId, species }: { farmId: number; species: FarmSpecies }) {
  const plants = useListToxicPlants(farmId, species);
  if (plants.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  const list = plants.data ?? [];
  if (list.length === 0) {
    return <p className="text-muted-foreground">Im Pflanzenarchiv ist noch keine Pflanze als giftig für diese Tierart eingetragen.</p>;
  }
  return (
    <>
      <p className="text-muted-foreground">Aus dem Pflanzenarchiv der Kräuterhexe ({list.length}):</p>
      <ul className="divide-y divide-border">
        {list.map((p) => (
          <li key={p.plantId} className="py-2">
            <Link href={`/pflanze/${p.plantId}`} className="font-medium underline-offset-4 hover:underline">
              {p.germanName}
            </Link>
            <span className="text-xs italic text-muted-foreground"> {p.botanicalName}</span>
            {p.toxicityLevel && (
              <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                {LEVEL_LABELS[p.toxicityLevel]}
              </span>
            )}
            {p.details && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{p.details}</p>}
          </li>
        ))}
      </ul>
      <AiNote />
    </>
  );
}

export function ToxicPlantsSection({ farmId, species }: { farmId: number; species: FarmSpecies }) {
  if (!ARCHIVE_SPECIES.has(species)) return null;
  return (
    <Collapsible icon={<Skull className="h-4 w-4 text-destructive" />} title={`Giftige Pflanzen für ${SPECIES_LABELS[species]}`}>
      <ToxicPlantsBody farmId={farmId} species={species} />
    </Collapsible>
  );
}

// ── Feed check ───────────────────────────────────────────────────────────────

const VERDICT = {
  good: { label: "Passt", className: "bg-primary/10 text-primary" },
  limited: { label: "Eingeschränkt geeignet", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  unsuitable: { label: "Nicht geeignet", className: "bg-destructive/10 text-destructive" },
} as const;

function FeedResult({ log, onDelete }: { log: FeedLog; onDelete?: () => void }) {
  const a = log.analysis;
  const nutrients: Array<[string, string | null]> = [
    ["Protein", a.nutrients.protein],
    ["Fett", a.nutrients.fat],
    ["Rohfaser", a.nutrients.fiber],
    ["Kohlenhydrate", a.nutrients.carbohydrates],
    ["Mineralstoffe", a.nutrients.minerals],
  ];
  const poisonous = a.items.filter((i) => i.poisonous);
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", VERDICT[a.verdict].className)}>
          {VERDICT[a.verdict].label}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {deDate(log.date)}
          {onDelete && (
            <button
              type="button"
              aria-label="Futter-Check löschen"
              className="rounded p-1 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      {poisonous.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
          <p className="flex items-center gap-1.5 font-semibold text-destructive">
            <Skull className="h-4 w-4" />
            Giftig für dieses Tier
          </p>
          <ul className="mt-1 space-y-0.5">
            {poisonous.map((i) => (
              <li key={i.name}>
                {i.name}
                {i.archive?.status === "poisonous" ? (
                  <span className="text-xs text-muted-foreground"> – laut Pflanzenarchiv{i.archive.toxicityLevel ? ` ${LEVEL_LABELS[i.archive.toxicityLevel]}` : ""}</span>
                ) : (
                  <span className="text-xs text-muted-foreground"> – laut KI</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Erkannt: </span>
        {a.items.map((i) => i.name).join(", ") || "–"}
      </p>
      {a.assessment && <p>{a.assessment}</p>}
      {a.medicalNotes.length > 0 && (
        <div>
          <p className="font-medium">Abgleich mit der Gesundheitsakte</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {a.medicalNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {nutrients
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export function FeedSection({ farmId, animalId, canWrite }: { farmId: number; animalId: number; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const logs = useListFeedAnalyses(farmId, animalId);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListFeedAnalysesQueryKey(farmId, animalId) });
  const analyze = useAnalyzeFeed({
    mutation: {
      onSuccess: () => void refresh(),
      onError: (err) => setError(errorText(err, "Die KI ist gerade nicht erreichbar.")),
    },
  });
  const remove = useDeleteFeedAnalysis({
    mutation: {
      onSuccess: () => void refresh(),
      onError: () => toast({ title: "Nicht gelöscht", variant: "destructive" }),
    },
  });
  const busy = preparing || analyze.isPending;
  const all = logs.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Wheat className="h-4 w-4 text-primary" />
          Futter-Check
        </h2>
        {canWrite && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError(null);
                setPreparing(true);
                try {
                  const imageData = await downscaleFile(file);
                  analyze.mutate({ farmId, animalId, data: { imageData } });
                } finally {
                  setPreparing(false);
                }
              }}
            />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Futter prüfen
            </Button>
          </>
        )}
      </div>
      {busy && <p className="text-sm text-muted-foreground">Die KI schaut sich das Futter an …</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {all.length === 0 && !busy ? (
        <p className="text-sm text-muted-foreground">
          {canWrite
            ? "Fotografiere das Futter: Die KI schätzt Nährstoffe, gleicht mit der Gesundheitsakte ab und prüft Pflanzen gegen das Pflanzenarchiv."
            : "Noch kein Futter geprüft."}
        </p>
      ) : (
        <div className="space-y-2">
          {all.slice(0, 3).map((log) => (
            <FeedResult
              key={log.id}
              log={log}
              onDelete={
                canWrite
                  ? () => {
                      if (window.confirm("Diesen Futter-Check löschen?")) remove.mutate({ farmId, logId: log.id });
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {all.length > 0 && <AiNote />}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Leaf className="h-3.5 w-3.5" />
        Giftig gilt, sobald Pflanzenarchiv oder KI es sagen.
      </p>
    </section>
  );
}
