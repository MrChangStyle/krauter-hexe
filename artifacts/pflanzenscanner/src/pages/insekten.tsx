/**
 * /insekten — parent page with two tabs: Archiv (all scanned insects) and
 * Arten (insects grouped by category with drill-down).
 */
import { useState } from "react";
import { BookOpen, Layers, Bug, ShieldAlert, Leaf, Minus, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListInsects, type Insect } from "@workspace/api-client-react";
import { InsectCard, INSECT_CATEGORY_LABELS, INSECT_RELATION_LABELS } from "@/components/insect-card";
import { PeckingChicken } from "@/components/pecking-chicken";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "archiv" | "arten";
type InsectCategory = Insect["category"];

// ─── Alpha helpers (insect-specific) ─────────────────────────────────────────

function firstLetterI(insect: Insect): string {
  return insect.germanName.charAt(0).toLocaleUpperCase("de");
}

function availableLettersI(insects: Insect[]): string[] {
  const set = new Set(insects.map(firstLetterI));
  return [...set].sort((a, b) => a.localeCompare(b, "de"));
}

function applyAlphaI(insects: Insect[], letter: string | null): Insect[] {
  const list = letter ? insects.filter((i) => firstLetterI(i) === letter) : insects;
  if (!letter) return list;
  return [...list].sort((a, b) => a.germanName.localeCompare(b.germanName, "de"));
}

// ─── Alpha filter (insect version) ───────────────────────────────────────────

function InsectAlphaFilter({
  insects,
  activeLetter,
  onChange,
}: {
  insects: Insect[];
  activeLetter: string | null;
  onChange: (l: string | null) => void;
}) {
  const letters = availableLettersI(insects);
  if (letters.length <= 1) return null;
  return (
    <div className="-mx-6 px-6 overflow-x-auto mb-1">
      <div className="flex gap-1.5 min-w-max pb-1">
        <button
          onClick={() => onChange(null)}
          className={`min-w-[2.25rem] h-8 px-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            activeLetter === null
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          }`}
        >
          Alle
        </button>
        {letters.map((l) => (
          <button
            key={l}
            onClick={() => onChange(activeLetter === l ? null : l)}
            className={`min-w-[2.25rem] h-8 px-2 rounded-lg text-sm font-semibold border transition-colors ${
              activeLetter === l
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Archiv tab ───────────────────────────────────────────────────────────────

function ArchivTab({ insects }: { insects: Insect[] }) {
  const [letter, setLetter] = useState<string | null>(null);
  const displayed = applyAlphaI(insects, letter);

  if (insects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 gap-3">
        <Bug className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Noch keine Insekten gescannt.
        </p>
        <p className="text-xs text-muted-foreground">
          Nutze den Insekten Scanner im Werkzeug-Bereich.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InsectAlphaFilter insects={insects} activeLetter={letter} onChange={setLetter} />
      <p className="text-xs text-muted-foreground">
        {displayed.length === insects.length
          ? `${insects.length} Insekt${insects.length === 1 ? "" : "en"} im Archiv`
          : `${displayed.length} von ${insects.length} · Buchstabe ${letter}`}
      </p>
      <div className="space-y-3">
        {displayed.map((insect) => (
          <InsectCard key={insect.id} insect={insect} />
        ))}
      </div>
    </div>
  );
}

// ─── Arten tab ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: InsectCategory[] = [
  "beetle",
  "butterfly",
  "bee_wasp",
  "fly_mosquito",
  "bug_cicada",
  "grasshopper",
  "dragonfly",
  "spider_other",
];

const CATEGORY_COLORS: Record<InsectCategory, string> = {
  beetle:       "bg-amber-100   text-amber-800   border-amber-200   dark:bg-amber-950/50   dark:text-amber-300",
  butterfly:    "bg-violet-100  text-violet-800  border-violet-200  dark:bg-violet-950/50  dark:text-violet-300",
  bee_wasp:     "bg-yellow-100  text-yellow-800  border-yellow-200  dark:bg-yellow-950/50  dark:text-yellow-300",
  fly_mosquito: "bg-slate-100   text-slate-700   border-slate-200   dark:bg-slate-800/50   dark:text-slate-300",
  bug_cicada:   "bg-lime-100    text-lime-800    border-lime-200    dark:bg-lime-950/50    dark:text-lime-300",
  grasshopper:  "bg-green-100   text-green-800   border-green-200   dark:bg-green-950/50   dark:text-green-300",
  dragonfly:    "bg-cyan-100    text-cyan-800    border-cyan-200    dark:bg-cyan-950/50    dark:text-cyan-300",
  spider_other: "bg-rose-100    text-rose-800    border-rose-200    dark:bg-rose-950/50    dark:text-rose-300",
};

const RELATION_COUNTS_LABEL = (pests: number, beneficial: number): string => {
  const parts: string[] = [];
  if (pests > 0) parts.push(`${pests} Schädling${pests === 1 ? "" : "e"}`);
  if (beneficial > 0) parts.push(`${beneficial} Nützling${beneficial === 1 ? "" : "e"}`);
  return parts.join(" · ") || "Keine Einträge";
};

function ArtenTab({ insects }: { insects: Insect[] }) {
  const [selectedCategory, setSelectedCategory] = useState<InsectCategory | null>(null);
  const [letter, setLetter] = useState<string | null>(null);

  // Drill-down view
  if (selectedCategory !== null) {
    const inCategory = insects.filter((i) => i.category === selectedCategory);
    const displayed = applyAlphaI(inCategory, letter);

    return (
      <div className="space-y-3">
        {/* Back + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedCategory(null); setLetter(null); }}
            className="flex items-center justify-center w-9 h-9 rounded-full border hover:bg-muted transition-colors shrink-0"
            aria-label="Zurück zur Übersicht"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-lg">
              {INSECT_CATEGORY_LABELS[selectedCategory]}
            </h2>
            <p className="text-xs text-muted-foreground">
              {inCategory.length} Eintrag{inCategory.length === 1 ? "" : "einträge"}
            </p>
          </div>
        </div>

        {inCategory.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-10 gap-3 bg-muted/30 rounded-3xl border border-dashed">
            <Bug className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Noch keine {INSECT_CATEGORY_LABELS[selectedCategory]} gescannt.
            </p>
          </div>
        ) : (
          <>
            <InsectAlphaFilter insects={inCategory} activeLetter={letter} onChange={setLetter} />
            <p className="text-xs text-muted-foreground">
              {displayed.length === inCategory.length
                ? `${inCategory.length} Eintrag${inCategory.length === 1 ? "" : "einträge"}`
                : `${displayed.length} von ${inCategory.length} · Buchstabe ${letter}`}
            </p>
            <div className="space-y-3">
              {displayed.map((insect) => (
                <InsectCard key={insect.id} insect={insect} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Category grid
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
      <div className="grid grid-cols-2 gap-3">
        {CATEGORY_ORDER.map((cat) => {
          const inCat = insects.filter((i) => i.category === cat);
          const pests = inCat.filter((i) => i.relationStatus === "pest").length;
          const beneficial = inCat.filter((i) => i.relationStatus === "beneficial").length;
          const color = CATEGORY_COLORS[cat];

          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "flex flex-col items-start text-left gap-2 p-4 rounded-2xl border transition-all active:scale-[0.97] hover:shadow-md",
                inCat.length > 0
                  ? color + " hover:brightness-95 cursor-pointer"
                  : "bg-muted/40 text-muted-foreground border-border cursor-default opacity-60",
              )}
              disabled={inCat.length === 0}
            >
              <span className="font-semibold text-sm leading-tight">
                {INSECT_CATEGORY_LABELS[cat]}
              </span>

              <span className="text-xs leading-snug opacity-80">
                {inCat.length === 0
                  ? "Keine Einträge"
                  : RELATION_COUNTS_LABEL(pests, beneficial)}
              </span>

              {/* Relation badges */}
              {inCat.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                  {pests > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-rose-200/60 text-rose-800 rounded px-1.5 py-0.5">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      {pests}
                    </span>
                  )}
                  {beneficial > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-200/60 text-emerald-800 rounded px-1.5 py-0.5">
                      <Leaf className="w-2.5 h-2.5" />
                      {beneficial}
                    </span>
                  )}
                  {inCat.filter((i) => i.relationStatus === "neutral").length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-gray-200/60 text-gray-700 rounded px-1.5 py-0.5">
                      <Minus className="w-2.5 h-2.5" />
                      {inCat.filter((i) => i.relationStatus === "neutral").length}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

export default function InsektenPage() {
  const [activeTab, setActiveTab] = useState<Tab>("archiv");

  const { data: insects = [], isLoading, isError } = useListInsects({
    query: { queryKey: ["/api/insects"] },
  });

  return (
    <div className="flex flex-col flex-1">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4">
        <div className="flex gap-0 max-w-2xl mx-auto">
          <TabButton
            active={activeTab === "archiv"}
            onClick={() => setActiveTab("archiv")}
            icon={BookOpen}
            label="Archiv"
          />
          <TabButton
            active={activeTab === "arten"}
            onClick={() => setActiveTab("arten")}
            icon={Layers}
            label="Arten"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-5 pb-6 space-y-4 flex-1">
        {isLoading && (
          <div className="flex items-center justify-center py-14">
            <PeckingChicken size={100} label="Insekten werden geladen …" className="text-primary" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive text-center py-8">
            Insekten konnten nicht geladen werden.
          </p>
        )}
        {!isLoading && !isError && activeTab === "archiv" && (
          <ArchivTab insects={insects} />
        )}
        {!isLoading && !isError && activeTab === "arten" && (
          <ArtenTab insects={insects} />
        )}
      </div>
    </div>
  );
}
