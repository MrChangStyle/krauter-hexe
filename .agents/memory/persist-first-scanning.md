---
name: Persist-first scanning on mobile
description: Why every scan upload must go through the IndexedDB queue, never a direct fetch
---
Rule: photo capture → downscale → IndexedDB queue → drain uploads. Never fire a direct POST holding the only copy of user data.

**Why:** Low-memory phones reload the PWA tab seconds after the camera closes (seen as client-aborted scan POSTs followed by immediate app reboots). A direct mutation loses the photo and shows no result — while the server may still have saved the plant (orphan rows). Queue-first plus server-side dedup (`alreadyInArchive`) makes crash-rescans converge without duplicates.

**How to apply:** Any new upload/scan path must enqueue first and let the queue drain report outcomes. Each drain result carries its queue item id so the UI can correlate the outcome with the exact capture it is waiting on (older backlog items drained in the same run must not mask the current photo's failure). The scan UI consumes results from the queue context, not from a mutation callback.
