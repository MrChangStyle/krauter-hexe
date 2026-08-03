---
name: Stale installed-PWA service-worker trap
description: Empty views with ZERO matching requests in prod logs = the device's installed PWA is stuck on an old service worker, not a server/data bug.
---

# Stale installed-PWA service-worker trap

Symptom: the published PWA shows empty archive/lists (and queued items never
drain) even though the user says they are online — and the prod DB clearly has
the data.

**Decisive diagnostic:** fetch deployment (autoscale) logs for the window the
user tested. If the ONLY requests are the platform healthcheck (`/api/healthz`)
and NO `/api/plants` (or whatever the view fetches) ever reaches the server,
the client never hit the network. The data request is being short-circuited by
a stale/broken service worker in the *installed* PWA.

**Confirm cheaply:** have the user open the same URL in a fresh private/incognito
browser tab (bypasses the installed PWA's SW). If the data appears there, the
server + deployed code are fine and the installed app is the culprit.

**Why it traps itself:** the old SW fails/short-circuits fetches, so it can never
reach the network to fetch the new `sw.js` — even with `registerType:'autoUpdate'`
(present here since well before the offline work). autoUpdate only heals once a
load actually reaches the network.

**Recovery (give gentle first — it preserves the IndexedDB scan queue):**
1. On stable WLAN, open the installed app, fully close it (swipe from app
   switcher), wait, reopen — repeat 1–2×. This lets the new SW swap in and the
   queue drain.
2. If still stale: clear site data / reinstall the PWA. This WIPES IndexedDB, so
   any photo stuck in the offline queue is lost (re-scan it).

**How to apply:** before blaming server/data for an "empty published app,"
check prod logs for the absence of the view's data request; absence points at
the client SW, not the backend.
