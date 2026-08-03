// Web-push handlers, imported into the generated Workbox service worker via
// workbox.importScripts. Keeps push support without switching the PWA build
// to injectManifest.
self.addEventListener("push", (event) => {
  let payload = { title: "Kräuterhexe", body: "", tag: undefined, url: "/" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch (e) {
    // Non-JSON payload: show it as plain text.
    payload.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Resolve app-relative paths against the SW scope so links work when the
  // app is served under a base path (payload "/aufgaben" -> "<scope>/aufgaben").
  const rawUrl = (event.notification.data && event.notification.data.url) || "/";
  const targetUrl = new URL(rawUrl.replace(/^\//, ""), self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
