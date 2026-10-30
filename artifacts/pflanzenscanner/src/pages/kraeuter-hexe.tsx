import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useListPlants, type Plant } from "@workspace/api-client-react";
import { X, ChevronDown, Search, Share2, Check, ChevronRight } from "lucide-react";
import { PlantCard } from "@/components/plant-card";
import { PeckingChicken } from "@/components/pecking-chicken";
import { ApothekenA } from "@/components/apotheken-a";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { HEAL_TARGETS, canonicalizeSymptom, type HealTarget } from "@/lib/heal-targets";
import { SYMPTOM_NAMES } from "@/lib/symptom-vocabulary";
import {
  availableSymptomsFor,
  filterByAilment,
  groupSymptoms,
  relevantPlantsFor,
} from "@/lib/ailment-filter";
import { parseUrlState, buildSearchString, canonicaliseSymptoms } from "@/lib/url-state";
import { PageHeader } from "@/components/page-header";

// ─── target card metadata ─────────────────────────────────────────────────────

// Colours of the target cards; names and pictures come from HEAL_TARGETS.
const TARGET_META: Record<
  HealTarget,
  { activeBg: string; activeRing: string; idleBg: string }
> = {
  human: {
    idleBg: "bg-amber-50 border-amber-200 hover:border-amber-400 dark:border-amber-800",
    activeBg: "bg-amber-100 border-amber-500 dark:bg-amber-950/60",
    activeRing: "ring-2 ring-amber-400",
  },
  poultry: {
    idleBg: "bg-yellow-50 border-yellow-200 hover:border-yellow-400 dark:border-yellow-800",
    activeBg: "bg-yellow-100 border-yellow-500 dark:bg-yellow-950/60",
    activeRing: "ring-2 ring-yellow-400",
  },
  rabbit: {
    idleBg: "bg-purple-50 border-purple-200 hover:border-purple-400 dark:border-purple-800",
    activeBg: "bg-purple-100 border-purple-500 dark:bg-purple-950/60",
    activeRing: "ring-2 ring-purple-400",
  },
  guineaPig: {
    idleBg: "bg-pink-50 border-pink-200 hover:border-pink-400 dark:border-pink-800",
    activeBg: "bg-pink-100 border-pink-500 dark:bg-pink-950/60",
    activeRing: "ring-2 ring-pink-400",
  },
  cat: {
    idleBg: "bg-sky-50 border-sky-200 hover:border-sky-400 dark:border-sky-800",
    activeBg: "bg-sky-100 border-sky-500 dark:bg-sky-950/60",
    activeRing: "ring-2 ring-sky-400",
  },
  horse: {
    idleBg: "bg-orange-50 border-orange-200 hover:border-orange-400 dark:border-orange-800",
    activeBg: "bg-orange-100 border-orange-500 dark:bg-orange-950/60",
    activeRing: "ring-2 ring-orange-400",
  },
  dog: {
    idleBg: "bg-stone-50 border-stone-200 hover:border-stone-400 dark:border-stone-700",
    activeBg: "bg-stone-100 border-stone-500 dark:bg-stone-900/60",
    activeRing: "ring-2 ring-stone-400",
  },
  goat: {
    idleBg: "bg-lime-50 border-lime-200 hover:border-lime-400 dark:border-lime-800",
    activeBg: "bg-lime-100 border-lime-500 dark:bg-lime-950/60",
    activeRing: "ring-2 ring-lime-400",
  },
  sheep: {
    idleBg: "bg-slate-50 border-slate-200 hover:border-slate-400 dark:border-slate-700",
    activeBg: "bg-slate-100 border-slate-500 dark:bg-slate-900/60",
    activeRing: "ring-2 ring-slate-400",
  },
  cattle: {
    idleBg: "bg-emerald-50 border-emerald-200 hover:border-emerald-400 dark:border-emerald-800",
    activeBg: "bg-emerald-100 border-emerald-500 dark:bg-emerald-950/60",
    activeRing: "ring-2 ring-emerald-400",
  },
  pig: {
    idleBg: "bg-rose-50 border-rose-200 hover:border-rose-400 dark:border-rose-800",
    activeBg: "bg-rose-100 border-rose-500 dark:bg-rose-950/60",
    activeRing: "ring-2 ring-rose-400",
  },
  alpaca: {
    idleBg: "bg-teal-50 border-teal-200 hover:border-teal-400 dark:border-teal-800",
    activeBg: "bg-teal-100 border-teal-500 dark:bg-teal-950/60",
    activeRing: "ring-2 ring-teal-400",
  },
  donkey: {
    idleBg: "bg-zinc-50 border-zinc-200 hover:border-zinc-400 dark:border-zinc-700",
    activeBg: "bg-zinc-100 border-zinc-500 dark:bg-zinc-900/60",
    activeRing: "ring-2 ring-zinc-400",
  },
};

function withCanonicalSymptoms<T extends { symptoms: string[] }>(state: T): T {
  const fixed = (s: string) => {
    const name = canonicalizeSymptom(s);
    return SYMPTOM_NAMES.includes(name) ? name : s;
  };
  return { ...state, symptoms: [...new Set(state.symptoms.map(fixed))] };
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KraeuterHexePage() {
  const [, navigate] = useLocation();
  const [shareCopied, setShareCopied] = useState(false);

  // Initialise from URL so a shared link restores state immediately
  // Older links may name a complaint by a former wording ("Verdauungs-
  // beschwerden") – map it to today's fixed name.
  const initialUrlState = useRef(withCanonicalSymptoms(parseUrlState(window.location.search)));
  const [target, setTarget] = useState<HealTarget>(() => initialUrlState.current.target);
  const [query, setQuery] = useState(() => initialUrlState.current.query);
  const [selectedByTarget, setSelectedByTarget] = useState<
    Record<string, Set<string>>
  >(() => {
    const { target: t, symptoms } = initialUrlState.current;
    return symptoms.length > 0 ? { [t]: new Set(symptoms) } : {};
  });

  // Symptoms that came from the URL but couldn't be matched to any available
  // symptom on this device — shown as a notice so the user knows the filter
  // was only partially applied.
  const [notFoundSymptoms, setNotFoundSymptoms] = useState<string[]>([]);

  // Guard so the one-time URL-symptom canonicalisation only fires once.
  const canonicalisedRef = useRef(false);

  // Tracks whether the reconciliation effect has already run at least once
  // with plant data available.  Used to suppress the toast on first-load so
  // only mid-session plant removals trigger the notice.
  const reconciliationInitialisedRef = useRef(false);

  // Symptoms that were auto-stripped mid-session because their carrier plant
  // was deleted.  Shown as a transient notice that auto-dismisses after 3 s.
  const [removedSymptoms, setRemovedSymptoms] = useState<string[]>([]);

  const { data: allPlants, isLoading } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });


  const relevantPlants = useMemo<Plant[]>(
    () => (allPlants ? relevantPlantsFor(allPlants, target) : []),
    [allPlants, target],
  );

  const availableSymptoms = useMemo<string[]>(
    () => availableSymptomsFor(relevantPlants, target),
    [relevantPlants, target],
  );

  const symptomGroups = useMemo(() => groupSymptoms(availableSymptoms), [availableSymptoms]);
  // Groups opened or closed by hand in the menu.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // The Beschwerden menu, closed by "Übernehmen".
  const [menuOpen, setMenuOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string, isOpen: boolean) => {
    const without = (set: Set<string>) => new Set([...set].filter((l) => l !== label));
    if (isOpen) {
      setOpenGroups(without);
      setClosedGroups((c) => new Set(c).add(label));
    } else {
      setClosedGroups(without);
      setOpenGroups((o) => new Set(o).add(label));
    }
  };

  const selected = selectedByTarget[target] ?? new Set<string>();
  const hasQuery = query.trim().length > 0;
  const hasSelected = selected.size > 0;

  const results = useMemo<{ plant: Plant; matched: string[] }[]>(
    () => filterByAilment(relevantPlants, target, query, selected),
    [relevantPlants, target, query, selected],
  );

  // Stable serialised key for the current symptom set — avoids the effect
  // firing on every render when selected falls back to a new Set() reference.
  const selectedKey = useMemo(
    () => Array.from(selected).sort().join(","),
    [selected],
  );

  // Once plants load, reconcile the URL symptoms with the available symptom
  // list using a case-insensitive match.  Symptoms that match by case-
  // insensitive comparison are replaced with their canonical (server) form so
  // filtering works correctly.  Symptoms with no match at all are surfaced as
  // a notice so the user knows the filter was only partially applied.
  // This runs once after the first non-empty availableSymptoms load.
  const availableSymptomsKey = availableSymptoms.join(",");
  useEffect(() => {
    if (!allPlants || availableSymptoms.length === 0) return;
    if (canonicalisedRef.current) return;
    const urlSymptoms = initialUrlState.current.symptoms;
    if (urlSymptoms.length === 0) return;

    canonicalisedRef.current = true;

    const { canonical, notFound } = canonicaliseSymptoms(urlSymptoms, availableSymptoms);

    // Replace URL-loaded symptoms with their canonical forms
    const { target: t } = initialUrlState.current;
    setSelectedByTarget((prev) => ({ ...prev, [t]: new Set(canonical) }));
    setNotFoundSymptoms(notFound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!allPlants, availableSymptomsKey]);

  // Whenever availableSymptoms changes after plants have loaded, strip any
  // selected tags that are no longer present in the available list.  This
  // covers both URL-initialised selections and symptoms chosen manually in
  // the current session (e.g. when the only carrier plant is deleted).
  // The !allPlants guard prevents wiping valid selections during a loading
  // flash where availableSymptoms is temporarily empty.
  // After the first run the reconciliationInitialisedRef is set so that
  // subsequent runs (mid-session plant removal) can show a transient notice.
  useEffect(() => {
    if (!allPlants) return;
    const availableSet = new Set(
      availableSymptoms.map((s) => s.toLocaleLowerCase("de-DE")),
    );
    const currentSelected = selectedByTarget[target] ?? new Set<string>();
    const filtered = new Set(
      Array.from(currentSelected).filter((tag) =>
        availableSet.has(tag.toLocaleLowerCase("de-DE")),
      ),
    );
    if (filtered.size !== currentSelected.size) {
      setSelectedByTarget((prev) => ({ ...prev, [target]: filtered }));
      // Only notify mid-session — suppress on first-load initialisation.
      if (reconciliationInitialisedRef.current) {
        const stripped = Array.from(currentSelected).filter(
          (tag) => !availableSet.has(tag.toLocaleLowerCase("de-DE")),
        );
        setRemovedSymptoms(stripped);
      }
    }
    reconciliationInitialisedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!allPlants, availableSymptomsKey]);

  // Auto-dismiss the removed-symptoms notice after 3 s.
  useEffect(() => {
    if (removedSymptoms.length === 0) return;
    const timer = setTimeout(() => setRemovedSymptoms([]), 3000);
    return () => clearTimeout(timer);
  }, [removedSymptoms]);

  // ── Sync state → URL ──────────────────────────────────────────────────────
  useEffect(() => {
    const search = buildSearchString(target, selected, query);
    navigate(`?${search}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, selectedKey, query]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const toggleSymptom = (tag: string) => {
    setSelectedByTarget((prev) => {
      const current = new Set(prev[target] ?? []);
      if (current.has(tag)) current.delete(tag);
      else current.add(tag);
      return { ...prev, [target]: current };
    });
  };

  const clearSymptoms = () =>
    setSelectedByTarget((prev) => ({ ...prev, [target]: new Set() }));

  const handleTargetChange = (newTarget: HealTarget) => {
    setTarget(newTarget);
    setNotFoundSymptoms([]);
  };

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: "Kräuter-Hexe" });
        return;
      } catch {
        // user cancelled or share failed → fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // clipboard also unavailable — silently ignore
    }
  }, []);

  return (
    <div className="p-6 h-full flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="mb-6">
        <PageHeader
          look="kraeuter"
          subtitle="Finde Pflanzen, die für dein Ziel essbar sind oder eine Heilwirkung haben – und filtere nach Beschwerden."
          actions={
              <button
                type="button"
                onClick={handleShare}
                aria-label="Ansicht teilen"
                title="Link kopieren"
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
                  shareCopied
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40",
                )}
              >
                {shareCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Kopiert!
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    Teilen
                  </>
                )}
              </button>
          }
        />
      </header>

      {/* ── Target grid ────────────────────────────────────────────── */}
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</span>
        <span className="text-sm font-medium text-foreground">Wähle die Art des Patienten</span>
      </div>
      <div className="mb-6 grid grid-cols-4 gap-2 mt-2 sm:grid-cols-5">
        {HEAL_TARGETS.map((t) => {
          const meta = TARGET_META[t.key];
          const active = t.key === target;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTargetChange(t.key)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-3 px-1 transition-all duration-150 active:scale-95 select-none",
                active
                  ? `${meta.activeBg} ${meta.activeRing} shadow-sm`
                  : `${meta.idleBg} bg-card`,
              )}
            >
              <span
                className="text-3xl leading-none"
                aria-hidden="true"
                style={{ lineHeight: 1.1 }}
              >
                {t.emoji}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold leading-tight text-center",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Step 2 label ───────────────────────────────────────────── */}
      {relevantPlants.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</span>
          <span className="text-sm font-medium text-foreground">Wähle die Symptome</span>
        </div>
      )}

      {/* ── Free-text ailment search ────────────────────────────────── */}
      {relevantPlants.length > 0 && (
        <div className="mb-4 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Beschwerde eingeben, z. B. Husten …"
            aria-label="Nach Beschwerde suchen"
            className="h-11 pl-9 pr-9 rounded-full"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Suche löschen"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Symptom filter ─────────────────────────────────────────── */}
      {availableSymptoms.length > 0 && (
        <div className="mb-5 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <ApothekenA size={22} />
              Nach Beschwerden filtern
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={clearSymptoms}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Zurücksetzen ({selected.size})
              </button>
            )}
          </div>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal">
                <span className="truncate text-left">
                  {selected.size === 0
                    ? "Beschwerden auswählen"
                    : `${selected.size} ausgewählt`}
                </span>
                <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            {/* The list scrolls on its own; "Übernehmen" and "Zurücksetzen"
                stay fixed at the bottom so it is clear how to finish. */}
            <DropdownMenuContent
              align="start"
              side="bottom"
              collisionPadding={8}
              className="flex max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] w-[var(--radix-dropdown-menu-trigger-width)] flex-col overflow-hidden p-0"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-1" data-testid="symptom-list">
              <DropdownMenuLabel>Beschwerden</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* Groups open on a tap; a lone group or one with a chosen
                  complaint is open from the start. */}
              {symptomGroups.map((g) => {
                const chosen = g.names.filter((n) => selected.has(n)).length;
                const open = symptomGroups.length === 1 || openGroups.has(g.label) || (chosen > 0 && !closedGroups.has(g.label));
                return (
                  <div key={g.label}>
                    <DropdownMenuItem
                      onSelect={(e?: Event) => {
                        e?.preventDefault?.();
                        toggleGroup(g.label, open);
                      }}
                      aria-expanded={open}
                      className="justify-between gap-2 font-medium"
                    >
                      <span className="truncate">
                        {g.label} <span className="font-normal text-muted-foreground">({g.names.length})</span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {chosen > 0 && (
                          <span className="rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">{chosen}</span>
                        )}
                        <ChevronRight className={cn("w-4 h-4 opacity-60 transition-transform", open && "rotate-90")} />
                      </span>
                    </DropdownMenuItem>
                    {open &&
                      g.names.map((tag) => (
                        <DropdownMenuCheckboxItem
                          key={tag}
                          checked={selected.has(tag)}
                          onCheckedChange={() => toggleSymptom(tag)}
                          onSelect={(e) => e.preventDefault()}
                          className="pl-10"
                        >
                          {tag}
                        </DropdownMenuCheckboxItem>
                      ))}
                  </div>
                );
              })}
              </div>
              <div className="shrink-0 space-y-1 border-t bg-popover p-2" data-testid="symptom-actions">
                <Button type="button" className="w-full" onClick={() => setMenuOpen(false)}>
                  {selected.size === 0 ? "Schließen" : `Übernehmen (${selected.size})`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  disabled={selected.size === 0}
                  onClick={clearSymptoms}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Zurücksetzen
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {Array.from(selected)
                .sort((a, b) => a.localeCompare(b, "de-DE"))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleSymptom(tag)}
                    aria-label={`${tag} entfernen`}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                      "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700",
                    )}
                  >
                    {tag}
                    <X className="w-3 h-3" />
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mid-session removed-filter notice ─────────────────────── */}
      {removedSymptoms.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
          <span className="mt-0.5 shrink-0 text-base leading-none">ℹ️</span>
          <span>
            {removedSymptoms.length === 1
              ? `Filter «${removedSymptoms[0]}» wurde entfernt, da die Pflanze nicht mehr vorhanden ist`
              : `Filter wurden entfernt, da die Pflanze nicht mehr vorhanden ist: ${removedSymptoms.map((s) => `«${s}»`).join(", ")}`}
          </span>
          <button
            type="button"
            onClick={() => setRemovedSymptoms([])}
            aria-label="Hinweis schließen"
            className="ml-auto shrink-0 text-orange-600 hover:text-orange-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Unmatched URL symptoms notice ──────────────────────────── */}
      {notFoundSymptoms.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="mt-0.5 shrink-0 text-base leading-none">⚠️</span>
          <span>
            {notFoundSymptoms.length === 1
              ? "1 Beschwerde aus dem Link nicht gefunden"
              : `${notFoundSymptoms.length} Beschwerden aus dem Link nicht gefunden`}
            {": "}
            <span className="font-medium">{notFoundSymptoms.join(", ")}</span>
          </span>
          <button
            type="button"
            onClick={() => setNotFoundSymptoms([])}
            aria-label="Hinweis schließen"
            className="ml-auto shrink-0 text-amber-600 hover:text-amber-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-14">
          <PeckingChicken size={100} label="Wird geladen …" className="text-primary" />
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {relevantPlants.length === 0
            ? "Noch keine passenden Pflanzen für dieses Ziel gefunden."
            : !hasQuery && !hasSelected
            ? "Gib oben eine Beschwerde ein, um passende Pflanzen zu sehen."
            : "Keine Pflanzen für diese Beschwerde gefunden."}
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          {results.map(({ plant, matched }) => (
            <PlantCard
              key={plant.id}
              plant={plant}
              matchedSymptoms={matched}
              onSymptomClick={toggleSymptom}
            />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center pb-4 px-2">
        Info: Ich bin kein Arzt. Ich verweise ausschließlich auf mögliche heilende Wirkung von Pflanzen und Kräutern.
      </p>
    </div>
  );
}
