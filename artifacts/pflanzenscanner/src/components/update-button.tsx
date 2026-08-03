import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useScanQueue } from "@/lib/scan-queue-context";
import { forceAppUpdate } from "@/lib/force-update";

// Small header action that lets the user force the app onto the newest version
// when the installed PWA is stuck on an old, cached build (e.g. empty archive).
export function UpdateButton() {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const { isOnline } = useScanQueue();

  const handleUpdate = () => {
    if (busy) return;
    setBusy(true);
    // forceAppUpdate clears SW + caches and reloads — page will not return.
    void forceAppUpdate();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title="App aktualisieren"
          aria-label="App aktualisieren"
          className="flex items-center rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>App aktualisieren?</AlertDialogTitle>
          <AlertDialogDescription>
            {isOnline
              ? "Lädt die neueste Version und behebt Anzeigeprobleme wie ein leeres Archiv. Deine gespeicherten Pflanzen und wartenden Fotos bleiben erhalten."
              : "Du bist gerade offline. Nach der Aktualisierung wird die App neu geladen – ohne Internet wird danach die zwischengespeicherte Version angezeigt."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
          {/* Plain button instead of AlertDialogAction to avoid Radix's
              internal onOpenChange(false) swallowing the click handler. */}
          <button
            type="button"
            disabled={busy}
            onClick={handleUpdate}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird aktualisiert…
              </>
            ) : (
              "Jetzt aktualisieren"
            )}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
