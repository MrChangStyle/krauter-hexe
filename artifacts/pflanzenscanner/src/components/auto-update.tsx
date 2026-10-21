import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Installs a new app version at once, without the "Neue Version" popup. For
 * the move screens: they replace the whole app, so the popup never shows
 * there, and an installed app would otherwise keep an old move helper forever.
 * `enabled` is false while data is on its way (the reload would cut it off).
 */
export function AutoUpdate({ enabled }: { enabled: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      void registration?.update();
    },
  });
  useEffect(() => {
    if (needRefresh && enabled) void updateServiceWorker(true);
  }, [needRefresh, enabled, updateServiceWorker]);
  return null;
}
