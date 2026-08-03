import {
  getPushPublicKey,
  subscribePush,
  unsubscribePush,
} from "@workspace/api-client-react";

// True when this browser can technically deliver web push (needs a service
// worker, the Push API and the Notification API). In dev the service worker
// is disabled, so push only works in the published app.
export function pushSupported(): boolean {
  return (
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // getRegistration() (instead of .ready) so we don't hang forever in dev,
  // where no service worker is registered.
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ?? null;
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "no-sw" | "error" };

// Asks for notification permission and registers this browser's push
// subscription with the server.
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return { ok: false, reason: "no-sw" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no-sw" };

  try {
    const { publicKey } = await getPushPublicKey();
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error" };
    }
    await subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Whether this browser currently has an active push subscription.
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return sub !== null;
}

// Re-sync an existing subscription with the server (e.g. after login on a
// device that already granted permission). Safe to call on every app start.
export async function syncPushSubscription(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
    await subscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch {
    /* best-effort */
  }
}

// Turns push off for this device only.
export async function disablePush(): Promise<void> {
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await unsubscribePush({ endpoint: sub.endpoint });
  } catch {
    /* server cleanup is best-effort; local unsubscribe still applies */
  }
  await sub.unsubscribe();
}
