---
name: Image storage architecture (CDN, never DB blobs)
description: Where plant/insect photos live — a third-party image CDN plus IndexedDB — and why Neon must never hold image bytes.
---

## Rule
Photos go to an external image CDN (currently Cloudinary; previously Replit
Object Storage/GCS). Neon stores only a short text `image_url` / `image_url_side`.
**Never write base64 or BLOB data into Neon columns.**

**Why:** Neon Free Tier is 500 MB; a handful of base64 JPEGs fill it. Only rows
predating the CDN still carry bytes in `image_data`, and that path is closed for
new writes.

## How to apply

### Scan endpoints
Start the upload promise **before** the AI call so it overlaps with Gemini, then
await it and include the returned URL in the insert/update. Upload failure must
stay non-fatal — the photo also lives in the device's IndexedDB and can be
backed up later.

### Client read priority
1. `imageUrl` from the API (absolute https CDN URL) — works on every device
2. `localImageId` → IndexedDB (only on the device that scanned)
3. legacy server endpoint `/plants/:id/image` — pre-CDN rows only
4. category placeholder

### Legacy server image endpoints
Keep them, but have them **302-redirect** to the CDN URL when the row has no
stored bytes. They are still hit by PDF export and by older installed clients,
and redirecting avoids proxying image traffic through the API.

### Canvas / PDF export
Anything that draws a CDN photo into a `<canvas>` must set
`img.crossOrigin = "anonymous"`, or `toDataURL()` throws on a tainted canvas.
On same-origin URLs that setting still sends the session cookie, so one code
path covers both sources.

## Accepted tradeoff
CDN URLs are publicly fetchable by anyone who has them; app auth only controls
who can *discover* them. Public ids are random. Signed private delivery would
mean per-request signing and no plain CDN caching — rejected for a small family
app.

## Migration between providers
A one-off script downloads each legacy object, **always writes a local backup
file first**, uploads to the new provider, then updates the row. Never delete
the source. Make it idempotent and support `--limit` / `--download-only`.
A provider SDK that throws plain objects (Cloudinary does) prints as
`[object Object]` — format errors explicitly or the real cause (e.g. a
placeholder API key) stays hidden.
