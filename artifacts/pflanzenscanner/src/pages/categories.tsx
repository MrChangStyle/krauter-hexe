import { useState, useRef } from "react";
import { useListPlants, ToxicityLevel } from "@workspace/api-client-react";
import { useImageBackup } from "@/lib/use-image-backup";
import { applyAlpha } from "@/lib/archive-helpers";
import { AlphaFilter } from "@/components/alpha-filter";
import { ArrowLeft, Download, Layers, Sprout } from "lucide-react";
import { PlantCard } from "@/components/plant-card";
import { PeckingChicken } from "@/components/pecking-chicken";
import { WitchCauldron } from "@/components/witch-cauldron";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { exportCategoriesPdf } from "@/lib/pdf-export";
import { cn } from "@/lib/utils";
import {
  VIEW_CATEGORIES,
  VIEW_CATEGORY_LABELS,
  apiCategoryOf,
  computeCategorySummary,
  filterPlantsForView,
  viewCount,
  type ViewCategory,
} from "@/lib/view-categories";

// ─── Colours (same palette logic as the insect category cards) ────────────────

const categoryColors: Record<ViewCategory, string> = {
  poisonous:          "bg-rose-100   text-rose-800   border-rose-200   dark:bg-rose-950/50   dark:text-rose-300",
  edible:             "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300",
  medicinal:          "bg-indigo-100  text-indigo-800  border-indigo-200  dark:bg-indigo-950/50  dark:text-indigo-300",
  mushroom:           "bg-amber-100   text-amber-800   border-amber-200   dark:bg-amber-950/50   dark:text-amber-300",
  tree:               "bg-teal-100    text-teal-800    border-teal-200    dark:bg-teal-950/50    dark:text-teal-300",
  shrub:              "bg-lime-100    text-lime-800    border-lime-200    dark:bg-lime-950/50    dark:text-lime-300",
  moss:               "bg-cyan-100    text-cyan-800    border-cyan-200    dark:bg-cyan-950/50    dark:text-cyan-300",
  cactus:             "bg-orange-100  text-orange-800  border-orange-200  dark:bg-orange-950/50  dark:text-orange-300",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CategoriesPage({
  initialCategory = null,
}: {
  initialCategory?: ViewCategory | null;
}) {
  const [selectedCategory, setSelectedCategory] = useState<ViewCategory | null>(initialCategory);
  const [toxicityFilter, setToxicityFilter] = useState<ToxicityLevel | null>(null);
  const [edibleOnly, setEdibleOnly] = useState(false);
  const [treeFilter, setTreeFilter] = useState<"all" | "edible" | "fruits">("all");
  const [mushroomFilter, setMushroomFilter] = useState<"all" | "edible" | "poisonous">("all");
  const [letter, setLetter] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [selected, setSelected] = useState<Set<ViewCategory>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const exportingRef = useRef(false);
  const { toast } = useToast();

  const { data: allPlants, isLoading } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });

  // Background: upload locally-cached photos to GCS so they appear on all devices.
  useImageBackup(allPlants, "plant");

  const summary = computeCategorySummary(allPlants);
  const countFor = (cat: ViewCategory) => viewCount(summary, cat);
  const selectableCats = VIEW_CATEGORIES.filter((cat) => countFor(cat) > 0);

  const toggle = (cat: ViewCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const handleDownload = async () => {
    if (exportingRef.current) return;
    const chosen = VIEW_CATEGORIES.filter((cat) => selected.has(cat));
    if (chosen.length === 0) return;
    exportingRef.current = true;
    setIsExporting(true);
    try {
      const result = await exportCategoriesPdf(chosen);
      toast({
        title: "PDF erstellt",
        description: `${result.plants} ${result.plants === 1 ? "Eintrag" : "Einträge"} aus ${result.categories} ${result.categories === 1 ? "Kategorie" : "Kategorien"} exportiert.`,
      });
      setShowExport(false);
      setSelected(new Set());
    } catch {
      toast({ title: "Download fehlgeschlagen", description: "Bitte versuche es erneut.", variant: "destructive" });
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  };

  // ── Drill-down ──────────────────────────────────────────────────────────────

  if (selectedCategory) {
    const apiCategory = apiCategoryOf(selectedCategory);
    const base = allPlants
      ? filterPlantsForView(
          allPlants.filter((p) => p.category === apiCategory),
          selectedCategory,
        )
      : undefined;

    const filtered =
      toxicityFilter && selectedCategory === "poisonous"
        ? base?.filter((p) => p.humanToxicityLevel === toxicityFilter)
        : edibleOnly && selectedCategory === "edible"
          ? base?.filter((p) => p.humanStatus === "edible")
          : treeFilter === "edible" && (selectedCategory === "tree" || selectedCategory === "shrub")
            ? base?.filter((p) => p.humanStatus === "edible")
            : treeFilter === "fruits" && (selectedCategory === "tree" || selectedCategory === "shrub")
              ? base?.filter((p) => p.hasEdibleFruits === true)
              : selectedCategory === "mushroom" && mushroomFilter !== "all"
                ? base?.filter((p) => p.humanStatus === mushroomFilter)
                : base;

    const displayPlants = filtered ? applyAlpha(filtered, letter) : undefined;
    const totalInCat = base?.length ?? 0;

    return (
      <div className="space-y-3">
        {/* Header — identical structure to insect ArtenTab drill-down */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedCategory(null); setLetter(null); setToxicityFilter(null); setEdibleOnly(false); setTreeFilter("all"); setMushroomFilter("all"); }}
            className="flex items-center justify-center w-9 h-9 rounded-full border hover:bg-muted transition-colors shrink-0"
            aria-label="Zurück zur Übersicht"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-lg leading-tight">
                {VIEW_CATEGORY_LABELS[selectedCategory]}
              </h2>
              {selectedCategory === "medicinal" && (
                <button
                  onClick={() => {/* navigate via wouter */}}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 transition-colors"
                >
                  <WitchCauldron size={28} />
                  <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">Kräuter-Hexe</span>
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalInCat} Eintrag{totalInCat === 1 ? "" : "einträge"}
            </p>
          </div>
        </div>

        {/* Sub-filters */}
        {(selectedCategory === "tree" || selectedCategory === "shrub") && (
          <div className="flex flex-wrap gap-2">
            {(["all", "edible", "fruits"] as const).map((val) => {
              const label = val === "all" ? "Alle" : val === "edible" ? "Essbar" : "Essbare Früchte";
              const isActive = treeFilter === val;
              return (
                <button key={val} onClick={() => { setTreeFilter(val); setLetter(null); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${isActive
                    ? val === "all" ? "bg-primary text-primary-foreground" : "bg-emerald-500 text-white"
                    : val === "all" ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-700 border border-emerald-300"}`}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {selectedCategory === "edible" && (
          <div className="flex flex-wrap gap-2">
            {([false, true] as const).map((onlyEdible) => {
              const isActive = edibleOnly === onlyEdible;
              return (
                <button key={String(onlyEdible)} onClick={() => { setEdibleOnly(onlyEdible); setLetter(null); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${isActive
                    ? onlyEdible ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
                    : onlyEdible ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  {onlyEdible ? "Essbar" : "Alle"}
                </button>
              );
            })}
          </div>
        )}

        {selectedCategory === "poisonous" && (
          <div className="flex flex-wrap gap-2">
            {([null, "intolerant", "poisonous", "lethal"] as const).map((level) => {
              const label = level === null ? "Alle" : level === "intolerant" ? "Unverträglich" : level === "poisonous" ? "Giftig" : "Tödlich";
              const isActive = toxicityFilter === level;
              const activeColor = level === null ? "bg-primary text-primary-foreground" : level === "intolerant" ? "bg-yellow-500 text-white" : level === "poisonous" ? "bg-orange-500 text-white" : "bg-red-500 text-white";
              const inactiveColor = level === null ? "bg-muted text-muted-foreground" : level === "intolerant" ? "bg-yellow-100 text-yellow-700 border border-yellow-300" : level === "poisonous" ? "bg-orange-100 text-orange-700 border border-orange-300" : "bg-red-100 text-red-700 border border-red-300";
              return (
                <button key={String(level)} onClick={() => { setToxicityFilter(isActive ? null : level); setLetter(null); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${isActive ? activeColor : inactiveColor}`}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {selectedCategory === "mushroom" && (
          <div className="flex flex-wrap gap-2">
            {(["all", "edible", "poisonous"] as const).map((val) => {
              const label = val === "all" ? "Alle" : val === "edible" ? "Essbar" : "Giftig";
              const isActive = mushroomFilter === val;
              const activeColor = val === "all" ? "bg-primary text-primary-foreground" : val === "edible" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white";
              const inactiveColor = val === "all" ? "bg-muted text-muted-foreground" : val === "edible" ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-rose-100 text-rose-700 border border-rose-300";
              return (
                <button key={val} onClick={() => { setMushroomFilter(val); setLetter(null); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${isActive ? activeColor : inactiveColor}`}>
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-14">
            <PeckingChicken size={100} label="Wird geladen …" className="text-primary" />
          </div>
        ) : totalInCat === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-10 gap-3 bg-muted/30 rounded-3xl border border-dashed">
            <Sprout className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Noch keine {VIEW_CATEGORY_LABELS[selectedCategory]} gescannt.
            </p>
          </div>
        ) : (
          <>
            {filtered && filtered.length > 0 && (
              <AlphaFilter plants={filtered} activeLetter={letter} onChange={setLetter} />
            )}
            <p className="text-xs text-muted-foreground">
              {displayPlants && filtered && displayPlants.length === filtered.length
                ? `${filtered.length} Eintrag${filtered.length === 1 ? "" : "einträge"}`
                : `${displayPlants?.length ?? 0} von ${filtered?.length ?? 0} · Buchstabe ${letter}`}
            </p>
            {displayPlants?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Keine Einträge für diesen Filter.
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {displayPlants?.map((plant) => (
                  <PlantCard key={plant.id} plant={plant} variant="private" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Overview grid ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <header className="mb-1">
        <h1 className="text-3xl font-serif flex items-center gap-3">
          <Layers className="w-8 h-8 text-primary" />
          Arten
        </h1>
        <p className="text-muted-foreground mt-1">
          Wähle eine Gruppe, um alle gescannten Vertreter zu sehen.
        </p>
      </header>

      <div className="flex items-center justify-end gap-3">
        {!isLoading && selectableCats.length > 0 && (
          <button
            onClick={() => setShowExport((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors shrink-0",
              showExport
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
            )}
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        )}
      </div>

      {/* PDF export panel — shown when PDF button is active */}
      {showExport && !isLoading && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Kategorien für den Export auswählen:</p>
          <div className="flex flex-col gap-2">
            {selectableCats.map((cat) => (
              <label key={cat} className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox
                  checked={selected.has(cat)}
                  onCheckedChange={() => toggle(cat)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{VIEW_CATEGORY_LABELS[cat]}</span>
                <span className="text-xs text-muted-foreground ml-auto">{countFor(cat)}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleDownload}
              disabled={selected.size === 0 || isExporting}
              size="sm"
              className="rounded-full flex-1"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {isExporting ? "Erstelle PDF…" : `Herunterladen${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setShowExport(false); setSelected(new Set()); }}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Category grid — identical card structure to the insect ArtenTab */}
      {isLoading ? (
        <div className="flex items-center justify-center py-14">
          <PeckingChicken size={100} label="Kategorien werden geladen …" className="text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {VIEW_CATEGORIES.map((cat) => {
            const count = countFor(cat);
            const color = categoryColors[cat];
            const isEmpty = count === 0;

            return (
              <button
                key={cat}
                onClick={() => !isEmpty && setSelectedCategory(cat)}
                disabled={isEmpty}
                className={cn(
                  "flex flex-col items-start text-left gap-2 p-4 rounded-2xl border transition-all active:scale-[0.97] hover:shadow-md",
                  isEmpty
                    ? "bg-muted/40 text-muted-foreground border-border cursor-default opacity-60"
                    : color + " hover:brightness-95 cursor-pointer",
                )}
              >
                <span className="font-semibold text-sm leading-tight">
                  {VIEW_CATEGORY_LABELS[cat]}
                </span>
                <span className="text-xs leading-snug opacity-80">
                  {isEmpty ? "Keine Einträge" : `${count} Eintrag${count === 1 ? "" : "einträge"}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
