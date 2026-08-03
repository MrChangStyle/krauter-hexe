import { availableLetters } from "@/lib/archive-helpers";
import type { Plant } from "@workspace/api-client-react";

export function AlphaFilter({
  plants,
  activeLetter,
  onChange,
}: {
  plants: Plant[];
  activeLetter: string | null;
  onChange: (letter: string | null) => void;
}) {
  const letters = availableLetters(plants);
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
