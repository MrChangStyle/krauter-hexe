import { useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// How often an already-open app re-checks the server for a newer version.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Shows an automatic banner as soon as a new version of the app has been
// deployed and the service worker has fetched it. The user taps "Jetzt
// aktualisieren" to activate the new worker and reload onto the fresh build.
// Uses a plain fixed overlay instead of a Radix AlertDialog so there is no
// modal-action close-handler complexity that can swallow the button click.
export function UpdatePrompt() {
  const intervalStarted = useRef(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration || intervalStarted.current) return;
      intervalStarted.current = true;
      setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (!needRefresh) return null;

  const handleUpdate = () => {
    if (busy) return;
    setBusy(true);
    updateServiceWorker(true)
      .then(() => {
        // The SW will skipWaiting and the page reloads automatically.
        // Show a brief success toast in case the reload takes a moment.
        toast({ title: "Erfolgreich aktualisiert!" });
      })
      .catch((err: unknown) => {
        console.error("[UpdatePrompt] updateServiceWorker failed:", err);
        toast({
          title: "Aktualisierung fehlgeschlagen",
          description: "Bitte später erneut versuchen.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setBusy(false);
        setNeedRefresh(false);
      });
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      // clicking the backdrop does nothing — user must choose "Jetzt aktualisieren"
    >
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="text-base font-semibold">Neue Version verfügbar</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Eine neue Version ist bereit. Deine gespeicherten Pflanzen und
          wartenden Fotos bleiben erhalten.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={handleUpdate}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
}
