import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useListPlants, type Plant } from "@workspace/api-client-react";
import { X, ChevronDown, Search, Share2, Check, ChevronRight } from "lucide-react";
import { PlantCard } from "@/components/plant-card";
import { PeckingChicken } from "@/components/pecking-chicken";
import { WitchCauldron } from "@/components/witch-cauldron";
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
import { HEAL_TARGETS, type HealTarget } from "@/lib/heal-targets";
import {
  availableSymptomsFor,
  filterByAilment,
  relevantPlantsFor,
} from "@/lib/ailment-filter";
import { parseUrlState, buildSearchString, canonicaliseSymptoms } from "@/lib/url-state";

// ─── target card metadata ─────────────────────────────────────────────────────

const TARGET_META: Record<
  HealTarget,
  { emoji: string; activeBg: string; activeRing: string; idleBg: string }
> = {
  human: {
    emoji: "🧑",
    idleBg: "bg-amber-50   border-amber-200  hover:border-amber-400",
    activeBg: "bg-amber-100  border-amber-500",
    activeRing: "ring-2 ring-amber-400",
  },
  poultry: {
    emoji: "🐓",
    idleBg: "bg-yellow-50  border-yellow-200 hover:border-yellow-400",
    activeBg: "bg-yellow-100 border-yellow-500",
    activeRing: "ring-2 ring-yellow-400",
  },
  rabbit: {
    emoji: "🐇",
    idleBg: "bg-purple-50  border-purple-200 hover:border-purple-400",
    activeBg: "bg-purple-100 border-purple-500",
    activeRing: "ring-2 ring-purple-400",
  },
  guineaPig: {
    emoji: "🐹",
    idleBg: "bg-pink-50    border-pink-200   hover:border-pink-400",
    activeBg: "bg-pink-100   border-pink-500",
    activeRing: "ring-2 ring-pink-400",
  },
  cat: {
    emoji: "🐱",
    idleBg: "bg-sky-50     border-sky-200    hover:border-sky-400",
    activeBg: "bg-sky-100    border-sky-500",
    activeRing: "ring-2 ring-sky-400",
  },
  horse: {
    emoji: "🐴",
    idleBg: "bg-orange-50  border-orange-200 hover:border-orange-400",
    activeBg: "bg-orange-100 border-orange-500",
    activeRing: "ring-2 ring-orange-400",
  },
};

// ─── component ────────────────────────────────────────────────────────────────

export default function KraeuterHexePage() {
  const [, navigate] = useLocation();
  const [shareCopied, setShareCopied] = useState(false);

  // Initialise from URL so a shared link restores state immediately
  const initialUrlState = useRef(parseUrlState(window.location.search));
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
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-serif flex items-center gap-3">
            <WitchCauldron size={64} />
            Kräuter-Hexe
          </h1>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Ansicht teilen"
            title="Link kopieren"
            className={cn(
              "mt-1 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
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
        </div>
        <p className="text-muted-foreground mt-2">
          Finde Pflanzen, die für dein Ziel essbar sind oder eine Heilwirkung
          haben – und filtere nach Beschwerden.
        </p>
      </header>

      {/* ── Target grid ────────────────────────────────────────────── */}
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</span>
        <span className="text-sm font-medium text-foreground">Wähle die Art des Patienten</span>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-2.5 mt-2">
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
                className="text-4xl leading-none"
                aria-hidden="true"
                style={{ lineHeight: 1.1 }}
              >
                {meta.emoji}
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

          <DropdownMenu>
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
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto"
            >
              <DropdownMenuLabel>Beschwerden</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableSymptoms.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selected.has(tag)}
                  onCheckedChange={() => toggleSymptom(tag)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
              {selected.size > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={clearSymptoms}
                    className="justify-center text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Zurücksetzen
                  </DropdownMenuItem>
                </>
              )}
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
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
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
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
