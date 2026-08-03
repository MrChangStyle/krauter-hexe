---
name: Offline PWA / IndexedDB queue testing
description: How to E2E-test offline capture and crash-recovery for an IndexedDB-backed queue in the dev environment.
---

# Testing an offline, IndexedDB-backed queue in a dev PWA

**You cannot simulate a full offline app-relaunch in the dev environment.** The
dev server serves the app shell (HTML/JS) over the network, so `reload()` while
the browser context is offline just fails to load the page. Only the installed
*production* PWA has a cached shell that opens while offline.

**How to test instead (Playwright):**
- Offline *capture*: with the app already loaded, set the context offline, then
  drive the file input — the item should be saved to the queue, not scanned.
- Drain on reconnect: set the context back online and poll; the queue should
  auto-drain to empty.
- Crash recovery / out-of-band state: inject a record straight into IndexedDB
  via `page.evaluate` (open the DB, `put` a record), then force the relevant
  component to re-read storage by **in-app navigation** (e.g. tap a bottom-nav
  item to remount the page), NOT a full reload — staying offline throughout so
  nothing auto-scans while you assert the recovered state.

**Why:** a page that reads a queue only from cached React-context state won't
reflect an out-of-band IndexedDB change until some refresh trigger fires. Two
prior test rounds failed on this before the page was made to re-read storage on
mount and the test switched to inject + in-app-remount.

**How to apply:** any time you add offline/local-first behavior backed by
IndexedDB to a PWA here, don't test recovery with an offline reload — inject +
in-app-remount, and reserve true offline-relaunch verification for the deployed
PWA.
