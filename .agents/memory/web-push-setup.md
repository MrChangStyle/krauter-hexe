---
name: Web push setup
description: How push notifications are wired in this PWA and the traps hit while adding them.
---

- VAPID keys are auto-generated on first server start and stored in a single-row DB table — no manual secrets; dev and prod each get their own pair (prod pair appears after first publish boot).
- Push handlers live in a static `public/push-sw.js` pulled into the generated Workbox worker via `workbox.importScripts` — keeps generateSW, no injectManifest switch. Push only works in the published app (SW is prod-only).
- **Why scope-relative URLs:** `notificationclick` must resolve payload paths against `self.registration.scope`, not origin, or taps 404 under a base path.
- Server scheduler evaluates reminder HH:MM in Europe/Berlin wall-clock (Intl.DateTimeFormat parts), with an in-memory per-day dedup set cleared daily.
- Client keeps legacy local-notification tickers as fallback but skips them when `isPushEnabled()` — otherwise open-app users get duplicate reminders.
- **OpenAPI spec drift trap:** the spec had drifted behind committed generated clients (missing /leaderboard, AuthUser.username/leavesCount) and had a duplicate YAML path key that orval v8 hard-fails on. Any codegen run regenerates EVERYTHING — fix the spec first, never hand-edit generated files.
