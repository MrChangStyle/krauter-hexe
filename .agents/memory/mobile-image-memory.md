---
name: Mobile image memory blanks previews
description: Why storing/serving full-resolution photos as list thumbnails blanks previews on phones, and the downscale-at-capture rule.
---

# Full-res photos blank out list previews on mobile

Storing raw camera photos (multi-MB, ~4000px) and rendering them directly as
small list thumbnails makes previews render **blank/black** on phones, even
though they render fine on desktop.

**Why:** a mobile browser (esp. iOS Safari) has a per-page image-decode memory
budget. A ~4000px JPEG decodes to tens of MB of bitmap; a list of several at
once blows the budget and the browser silently drops/blanks the images. Desktop
has far more headroom, so this does NOT reproduce in a headless/desktop
screenshot — never conclude "previews work" from a desktop capture alone.

**How to apply:** downscale photos at capture (offscreen canvas, ~1600px max
edge, JPEG ~0.8) before storing/serving; never embed originals as thumbnails.
If a high-res original is truly needed, serve a small thumbnail in list views
and the full image only in the detail view. Backfilling oversized rows is a
one-off migration — any image tool works (`magick`/`convert` are already in the
environment, so no node image lib is needed).

**Watch for:** a 1x1 placeholder image (data URL ~100-120 chars) can only come
from a programmatic/test insert, never from the camera/gallery UI — treat such
rows as leftover test fixtures.
