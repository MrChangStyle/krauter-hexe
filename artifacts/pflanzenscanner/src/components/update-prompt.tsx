import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { appBuiltAt, formatBuild, markUpdating, takeUpdated } from "@/lib/app-version";

// How often an already-open app re-checks the server for a newer version.
// An installed app on a phone is mostly resumed, not reloaded – so it also
// checks whenever it comes back to the foreground or online.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Read once when the app starts: was this start the reload of an update?
const JUST_UPDATED = takeUpdated();

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
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("online", check);
    },
  });

  // After the reload of an update: say that it worked, and which version runs now.
  useEffect(() => {
    if (!JUST_UPDATED) return;
    const built = formatBuild(appBuiltAt());
    // A moment later: the Toaster subscribes in its own effect, after this one.
    const timer = setTimeout(() => toast({ title: "App aktualisiert", description: built ? `Neuer Stand: ${built}` : undefined }), 600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!needRefresh) return null;

  const handleUpdate = () => {
    if (busy) return;
    setBusy(true);
    markUpdating();
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
