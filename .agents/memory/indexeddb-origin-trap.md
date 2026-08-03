---
name: Local-first photos are stranded by a domain move
description: Why a local-first PWA loses its pictures when the app moves to a new host, and the only window in which they can be rescued.
---

# Moving a local-first PWA to a new domain strands its local data

IndexedDB is bound to the origin. Every photo that exists **only** in the browser's
local store disappears from view the moment the app is served from a different
domain — the rows are still in the database, but their image column is empty, so
the UI falls back to placeholders. Nothing on the server can recover them.

**Why this bites specifically here:** persist-first scanning means a photo is
written to IndexedDB immediately and only *later* (opportunistically) uploaded to
the CDN. Any entry whose upload never ran is device-only. Expect a large share of
the archive to be in that state — check with a count of rows that have a local id
but no remote URL before assuming a hosting move is safe.

**The rescue window:** the old origin must still be reachable, and each device must
open the app *there* (logged in, on a page that lists the entries) so the
upload-to-CDN path runs. Only the device that took a photo can rescue it. Do not
tear down the old deployment until that has happened on every device.

**Two traps in the upload path:**

- An idempotency check of the form "URL column is not null → already stored" wrongly
  covers rows that still carry a *dead* URL from a decommissioned storage backend.
  Test for a servable `http(s)` URL instead, or those rows can never be repaired.
- A silent, once-per-session background upload is not good enough for a rescue of
  hundreds of photos on a phone: without visible progress the user closes the tab
  early and assumes it worked.

**Diagnosis order when "images are missing" after a host move:** confirm the stored
remote URLs actually resolve (curl one), then count how many rows have no remote URL
at all. If the remote ones load in a *fresh* browser profile, the problem is not the
CDN, the CSP or CORS — it is the origin change.
