import { ScrollRow } from "@/components/scroll-row";
import { availableLetters } from "@/lib/archive-helpers";
import type { Plant } from "@workspace/api-client-react";

export function AlphaFilter({
  plants,
  activeLetter,
  onChange,
  className = "-mx-6 px-6",
}: {
  plants: Plant[];
  activeLetter: string | null;
  onChange: (letter: string | null) => void;
  /** Bleed to the page edge; pages with another side padding pass their own. */
  className?: string;
}) {
  const letters = availableLetters(plants);
  if (letters.length <= 1) return null;

  return (
    <div className="mb-1">
      <ScrollRow className={className} label="Nach Anfangsbuchstaben filtern" testId="alpha-filter">
        <button
          onClick={() => onChange(null)}
          className={`shrink-0 min-w-[2.25rem] h-8 px-2.5 rounded-lg text-sm font-semibold border transition-colors ${
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
            className={`shrink-0 min-w-[2.25rem] h-8 px-2 rounded-lg text-sm font-semibold border transition-colors ${
              activeLetter === l
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </ScrollRow>
    </div>
  );
}
