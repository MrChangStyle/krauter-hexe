---
name: Offline read architecture (PWA)
description: How the plant PWA achieves full offline reads — React Query networkMode, single-list derivation, and image warmup.
---

# Offline-capable reads in this PWA

Goal: every already-scanned plant (archive, categories, category drill-down,
detail, photos) must be viewable with no connection.

## Rules that make it work

- **React Query must use `networkMode: 'offlineFirst'`** (set in the QueryClient
  defaults). The default `'online'` *pauses* queries when `navigator.onLine` is
  false, so they never even reach the service worker cache. `'offlineFirst'`
  runs the query, hits the SW cache, and only errors if the cache misses.
  **Why:** without this the SW caches data but the UI still shows nothing
  offline.

- **The service worker / PWA is production-only here** (disabled in dev). Offline
  caching therefore cannot be verified in the workspace — it activates only in
  the published app, and only after the app has been online once to populate the
  caches. Test matrix: publish → open online once → airplane mode → check every
  read view.

- **Derive all read views from ONE cached list query, not many endpoints.**
  The list endpoint and the per-id detail endpoint return identical fields
  (both select the same public columns; only the image bytes are served
  separately by URL). So detail is `list.find(p => p.id === id)`, the category
  summary is computed client-side from the list, and category drill-down is a
  client-side filter. This collapses the entire read path onto `/api/plants` +
  `/api/plants/:id/image`, both of which are cached and warmed.
  **Why:** NetworkFirst only caches an endpoint *after* it's been requested
  online; depending on many endpoints leaves first-time offline gaps. One list
  query is warmed once and covers everything.

- **Proactively warm the cache while online.** A warmup hook fetches the full
  list (shared query key) and every plant image once when online, so the SW
  (CacheFirst for images, NetworkFirst for data) holds *all* scanned content,
  not just what the user happened to open.

- **When a shared-list write happens (delete/scan), invalidate `['/api/plants']`**
  so archive/categories/detail don't show ghost entries from cache.

## SW runtimeCaching order (first match wins)
1. `/api/plants/:id/image` → CacheFirst (long-lived image cache).
2. `/api/plants` and `/api/categories` → NetworkFirst (short timeout, falls back
   to cache offline).
3. `/api/*` catch-all → NetworkOnly (auth/session, scans, users, mutations stay
   uncached — never cache auth/session responses).
