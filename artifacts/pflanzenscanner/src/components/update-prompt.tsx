import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "@/hooks/use-toast";
import { appBuiltAt, formatBuild, markUpdating, takeUpdated } from "@/lib/app-version";

// How often an already-open app re-checks the server for a newer version.
// An installed app on a phone is mostly resumed, not reloaded – so it also
// checks whenever it comes back to the foreground or online.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
// Right after opening or coming back nobody is typing yet: update at once.
const FRESH_MS = 10 * 1000;
// In the background for this long: update there, unseen.
const HIDDEN_MS = 60 * 1000;

// Read once when the app starts: was this start the reload of an update?
const JUST_UPDATED = takeUpdated();

/** Someone is typing – a reload now would lose the text. */
function typing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(el.type));
}

/**
 * Installs a new app version by itself, without a button
 * (docs/benachrichtigungen.md): at once if the app was just opened or brought
 * back and nobody is typing, otherwise after it has been in the background for
 * a minute – then the reload goes unseen and nothing typed is lost. After the
 * reload the app says "App aktualisiert" with the new build time.
 */
export function UpdatePrompt() {
  const intervalStarted = useRef(false);
  const activeSince = useRef(Date.now());
  const updating = useRef(false);
  const { toast } = useToast();

  const {
    needRefresh: [needRefresh],
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

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") activeSince.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!needRefresh) return;
    const install = () => {
      if (updating.current) return;
      updating.current = true;
      markUpdating();
      // The new worker takes over and the page reloads by itself.
      updateServiceWorker(true).catch((err: unknown) => {
        updating.current = false;
        console.error("[UpdatePrompt] updateServiceWorker failed:", err);
      });
    };
    if (document.visibilityState === "visible" && Date.now() - activeSince.current < FRESH_MS && !typing()) {
      install();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") timer = setTimeout(install, HIDDEN_MS);
      else if (!typing()) install();
    };
    // Already in the background: count from now.
    if (document.visibilityState === "hidden") timer = setTimeout(install, HIDDEN_MS);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [needRefresh, updateServiceWorker]);

  // After the reload of an update: say that it worked, and which version runs now.
  useEffect(() => {
    if (!JUST_UPDATED) return;
    const built = formatBuild(appBuiltAt());
    // A moment later: the Toaster subscribes in its own effect, after this one.
    const timer = setTimeout(() => toast({ title: "App aktualisiert", description: built ? `Neuer Stand: ${built}` : undefined }), 600);
    return () => clearTimeout(timer);
  }, [toast]);

  return null;
}
