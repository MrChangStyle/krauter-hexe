import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Wie das Gerät", icon: Monitor },
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
];

/** Mehr → Darstellung: hell, dunkel oder wie das Gerät (per Gerät gespeichert). */
export function ThemeCard() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="theme-card">
      <h2 className="font-semibold">Darstellung</h2>
      <div role="radiogroup" aria-label="Darstellung" className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => {
              setChoice(value);
              setTheme(value);
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
              choice === value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
