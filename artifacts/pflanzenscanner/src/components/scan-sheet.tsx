import { useLocation } from "wouter";
import { ChevronRight, Lock, PawPrint, ScanLine, Stethoscope, Wheat, X } from "lucide-react";
import { useModules } from "@/hooks/use-modules";
import { cn } from "@/lib/utils";

/**
 * The menu behind the big scan button in the bottom bar: "Bestimmen" (the
 * universal scan) first, then the special scans. Locked entries belong to
 * modules that are not available yet; hidden modules leave the menu.
 */
export function ScanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const { visible } = useModules();
  if (!open) return null;

  const go = (to: string) => {
    onClose();
    setLocation(to);
  };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Scan auswählen">
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 bg-black/50 animate-in fade-in"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-2xl rounded-t-3xl bg-card p-5 pb-8 space-y-4 animate-in slide-in-from-bottom duration-200">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-muted" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Was möchtest du scannen?</h2>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => go("/?scan=auto")}
          className="flex w-full items-center gap-4 rounded-2xl bg-primary p-4 text-left text-primary-foreground shadow-md active:scale-[0.99] transition-transform"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
            <ScanLine className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-lg font-semibold">Bestimmen</span>
            <span className="block text-sm opacity-90">Pflanze, Pilz oder Insekt – wird automatisch erkannt</span>
          </span>
        </button>

        <div className="space-y-2">
          <SheetRow
            icon={<Stethoscope className="h-5 w-5 text-orange-700 dark:text-orange-300" />}
            tone="bg-orange-100 dark:bg-orange-950/50"
            label="Pflanze ist krank"
            hint="Pflanzendoc · Diagnose und Pflege-Guide"
            onClick={() => go("/pflanzendoc")}
          />
          <SheetRow
            icon={<span aria-hidden="true" className="text-lg leading-none">🍄</span>}
            tone="bg-amber-100 dark:bg-amber-950/50"
            label="Pilz prüfen"
            hint="3 Fotos · oben, Seite und Lamellen"
            onClick={() => go("/?scan=pilz")}
          />
          {visible("animals") && (
            <SheetRow
              icon={<PawPrint className="h-5 w-5 text-sky-700 dark:text-sky-300" />}
              tone="bg-sky-100 dark:bg-sky-950/50"
              label="Tier bestimmen"
              hint="Neues Tier · Art und Rasse per Foto"
              // The new-animal form suggests species and breed from the photo.
              onClick={() => go("/farm/tier/neu")}
            />
          )}
          {visible("feed") && (
            <SheetRow
              icon={<Wheat className="h-5 w-5 text-yellow-700 dark:text-yellow-300" />}
              tone="bg-yellow-100 dark:bg-yellow-950/50"
              label="Futteretikett lesen"
              hint="Futterplaner · Werte per Foto übernehmen"
              onClick={() => go("/farm/futter?etikett=1")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SheetRow({
  icon,
  tone,
  label,
  hint,
  onClick,
  locked = false,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  hint: string;
  onClick?: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors",
        locked ? "border-2 border-dashed opacity-80" : "bg-muted/60 hover:bg-muted",
      )}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {locked ? (
        <Lock className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
