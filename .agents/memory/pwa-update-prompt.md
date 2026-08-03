---
name: PWA update-prompt setup (vite-plugin-pwa)
description: Gotchas when switching a vite-plugin-pwa app from autoUpdate to a user-facing "new version" prompt.
---

# Switching vite-plugin-pwa from autoUpdate to a prompt

To show a user-facing "Neue Version verfügbar" popup instead of silent auto-reload:
set `registerType: 'prompt'` + `injectRegister: null`, and register via the
`useRegisterSW()` hook from `virtual:pwa-register/react`. Show a dialog when
`needRefresh` is true; the confirm button calls `updateServiceWorker(true)`
(activates the waiting worker + reloads).

**Gotcha — workbox-window is a required dependency.** The `virtual:pwa-register/react`
module imports `workbox-window`; if it isn't an explicit dependency of the app
package the **production build fails** with `Rollup failed to resolve import
"workbox-window"` (dev/typecheck still pass, so it's easy to miss). Add
`workbox-window` matching the workbox major that vite-plugin-pwa pulls in (v7.x here).

**Gotcha — types.** `virtual:pwa-register/react` needs a triple-slash reference
(`/// <reference types="vite-plugin-pwa/react" />`) in a `vite-env.d.ts`; the
tsconfig `types` array does not include it automatically.

**Migration caveat (autoUpdate → prompt).** Devices still running the previous
`autoUpdate` client won't see the prompt for the *first* prompt-based release
while the app stays continuously open — old client logic auto-activates and
reloads once instead. They land on the prompt build after one close/reopen;
every release after that prompts as intended. This is expected, not a bug.

**Why:** discovered while adding the update popup — the build-only failure and the
one-time transition behavior are both non-obvious and cost a debugging cycle.
