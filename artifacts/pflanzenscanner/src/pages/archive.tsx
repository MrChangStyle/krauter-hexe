import { useState } from "react";
import { useListPlants } from "@workspace/api-client-react";
import { BookOpen, Sprout, ArrowLeft, ShieldCheck } from "lucide-react";
import { PlantCard } from "@/components/plant-card";
import { PeckingChicken } from "@/components/pecking-chicken";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ANIMALS, type AnimalKey, getAnimalInfo } from "@/lib/animals";
import type { Plant } from "@workspace/api-client-react";
import { firstLetter, applyAlpha } from "@/lib/archive-helpers";
import { AlphaFilter } from "@/components/alpha-filter";
import { useImageBackup } from "@/lib/use-image-backup";

// ─── types ────────────────────────────────────────────────────────────────────

type FilterTarget = "human" | AnimalKey;
type Tab = "archive" | "edible";

// ─── constants ────────────────────────────────────────────────────────────────

const TARGETS: Array<{
  value: FilterTarget;
  label: string;
  emoji: string;
  description: string;
}> = [
  { value: "human",     label: "Mensch",          emoji: "🧑", description: "Essbare Pflanzen für Menschen" },
  { value: "poultry",   label: "Geflügel",         emoji: "🐔", description: "Sicher für Hühner, Enten & Co." },
  { value: "rabbit",    label: "Hase",             emoji: "🐇", description: "Sicher für Kaninchen & Hasen" },
  { value: "guineaPig", label: "Meerschwein",  emoji: "🐹", description: "Sicher für Meerschweinchen" },
  { value: "cat",       label: "Katze",            emoji: "🐱", description: "Sicher für Katzen" },
  { value: "horse",     label: "Pferd",            emoji: "🐴", description: "Sicher für Pferde" },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function isEdibleFor(plant: Plant, target: FilterTarget): boolean {
  if (target === "human")
    // Only genuinely edible food plants (edible category + edible mushrooms).
    // Trees/shrubs/mosses/medicinal plants are excluded even if humanStatus is
    // "edible" — "ungiftig" ≠ "essbar" in the food sense.
    return plant.humanStatus === "edible" &&
      (plant.category === "edible" || plant.category === "mushroom");
  return getAnimalInfo(plant, target as AnimalKey)?.status === "safe";
}

function targetLabel(target: FilterTarget): string {
  return TARGETS.find((t) => t.value === target)?.label ?? target;
}


// ─── sub-views ────────────────────────────────────────────────────────────────

/** Grid of selectable target cards (picker). */
function EdiblePicker({
  plants,
  onSelect,
}: {
  plants: Plant[];
  onSelect: (target: FilterTarget) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Wähle aus, für wen du essbare Pflanzen sehen möchtest.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {TARGETS.map(({ value, label, emoji, description }) => {
          const count = plants.filter((p) => isEdibleFor(p, value)).length;
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className="flex flex-col items-center text-center gap-2 p-5 rounded-2xl border bg-card hover:bg-muted/50 hover:border-emerald-400 hover:shadow-md transition-all active:scale-[0.97]"
            >
              <span className="text-4xl leading-none" aria-hidden="true">
                {emoji}
              </span>
              <span className="font-serif text-lg text-foreground leading-tight">
                {label}
              </span>
              <span className="text-xs text-muted-foreground leading-snug">
                {description}
              </span>
              <span
                className={`mt-1 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  count > 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count > 0 && <ShieldCheck className="w-3 h-3 shrink-0" />}
                {count === 0
                  ? "Keine Einträge"
                  : `${count} Pflanze${count === 1 ? "" : "n"}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Filtered + alpha-browsable plant list for one selected target. */
function EdibleList({
  plants,
  target,
  onBack,
}: {
  plants: Plant[];
  target: FilterTarget;
  onBack: () => void;
}) {
  const [letter, setLetter] = useState<string | null>(null);

  const { emoji, label, description } =
    TARGETS.find((t) => t.value === target) ?? {
      emoji: "",
      label: targetLabel(target),
      description: "",
    };

  const edible = plants.filter((p) => isEdibleFor(p, target));
  const displayed = applyAlpha(edible, letter);

  return (
    <div className="space-y-3">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-full border hover:bg-muted transition-colors shrink-0"
          aria-label="Zurück zur Auswahl"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="font-serif text-xl flex items-center gap-2 leading-tight">
            <span aria-hidden="true">{emoji}</span>
            {label}
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {edible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 bg-muted/30 rounded-3xl border border-dashed">
          <Sprout className="w-12 h-12 text-muted-foreground mb-3 opacity-50" />
          <h3 className="text-lg font-serif mb-1">Keine Einträge</h3>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            Noch keine gescannte Pflanze ist sicher für{" "}
            {target === "human" ? "Menschen" : label}.
          </p>
        </div>
      ) : (
        <>
          <AlphaFilter plants={edible} activeLetter={letter} onChange={setLetter} />

          <p className="text-xs text-muted-foreground">
            {displayed.length === edible.length
              ? `${edible.length} Pflanze${edible.length === 1 ? "" : "n"} sicher für ${target === "human" ? "Menschen" : label}`
              : `${displayed.length} von ${edible.length} Pflanzen · Buchstabe ${letter}`}
          </p>

          <div className="space-y-4 pb-4">
            {displayed.map((plant) => (
              <PlantCard key={plant.id} plant={plant} variant="private" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Plain chronological archive list with A-B-C filter. */
function ArchiveList({ plants }: { plants: Plant[] }) {
  const [letter, setLetter] = useState<string | null>(null);
  const displayed = applyAlpha(plants, letter);

  return (
    <div className="space-y-3">
      <AlphaFilter plants={plants} activeLetter={letter} onChange={setLetter} />

      <p className="text-xs text-muted-foreground">
        {displayed.length === plants.length
          ? `${plants.length} Pflanze${plants.length === 1 ? "" : "n"} im Archiv`
          : `${displayed.length} von ${plants.length} · Buchstabe ${letter}`}
      </p>

      <div className="space-y-4 pb-4">
        {displayed.map((plant) => (
          <PlantCard key={plant.id} plant={plant} variant="private" />
        ))}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  const { data: plants, isLoading } = useListPlants(undefined, {
    query: { queryKey: ["/api/plants"] },
  });

  const [tab, setTab] = useState<Tab>("archive");
  const [selectedTarget, setSelectedTarget] = useState<FilterTarget | null>(null);

  const allPlants = plants ?? [];

  // Background: upload any locally-cached photos to GCS so they are visible on
  // all devices. Only processes plants whose photo lives in this device's
  // IndexedDB (silently skips plants the user didn't scan on this device).
  useImageBackup(allPlants, "plant");

  return (
    <div className="p-6 h-full flex flex-col">
      <header className="mb-5">
        <h1 className="text-3xl font-serif flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          Archiv
        </h1>
        <p className="text-muted-foreground mt-1">
          Deine gescannten Pflanzen im Überblick.
        </p>
      </header>

      {/* Tab bar */}
      {!isLoading && allPlants.length > 0 && (
        <div className="flex gap-1 mb-5 p-1 bg-muted rounded-xl">
          <button
            onClick={() => setTab("archive")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "archive"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Alle Pflanzen
          </button>
          <button
            onClick={() => { setTab("edible"); setSelectedTarget(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "edible"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Essbar für …
          </button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <PeckingChicken size={110} label="Pflanzen werden geladen …" className="text-primary" />
        </div>
      ) : allPlants.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/30 rounded-3xl border border-dashed">
          <Sprout className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
          <h2 className="text-xl font-serif mb-2">Noch keine Scans</h2>
          <p className="text-muted-foreground mb-6 max-w-[250px]">
            Fotografiere deine erste Pflanze, um sie hier in deinem Archiv zu speichern.
          </p>
          <Link href="/"><Button>Jetzt scannen</Button></Link>
        </div>
      ) : tab === "archive" ? (
        <ArchiveList plants={allPlants} />
      ) : selectedTarget !== null ? (
        <EdibleList plants={allPlants} target={selectedTarget} onBack={() => setSelectedTarget(null)} />
      ) : (
        <EdiblePicker plants={allPlants} onSelect={setSelectedTarget} />
      )}
    </div>
  );
}
