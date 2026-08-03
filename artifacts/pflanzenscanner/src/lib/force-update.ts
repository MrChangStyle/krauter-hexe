// Escape hatch for the "stale installed PWA" trap: an old service worker can
// keep serving a cached (empty) version of the app and never reach the network
// to update itself. This forcibly removes the service worker and every Cache
// Storage entry, then reloads so the browser fetches the newest version fresh.
//
// IMPORTANT: This deliberately does NOT touch IndexedDB, so the offline scan
// queue (photos waiting to be identified) and any other stored data survive.
export async function forceAppUpdate(): Promise<void> {
  // 1) Unregister every service worker controlling this origin.
  try {
    if ("serviceWorker" in navigator) {
      const registrations =
        await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
  } catch {
    // Best effort - continue even if the browser blocks this.
  }

  // 2) Delete every Cache Storage bucket (workbox precache + runtime caches).
  //    This clears the stale app shell and any cached-but-empty API responses.
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best effort.
  }

  // 3) Reload from the network. With the SW gone and caches cleared, the
  //    browser fetches the current index.html and re-registers the fresh SW.
  window.location.reload();
}
