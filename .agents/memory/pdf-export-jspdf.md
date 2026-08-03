---
name: jsPDF client-side PDF export
description: Non-obvious findings for generating PDFs client-side with jsPDF in this German plant app (fonts, image size, mobile memory, verification).
---

# jsPDF client-side PDF export

Lessons from adding the Kategorien → PDF export to Pflanzenscanner.

## German umlauts render with jsPDF core fonts — no TTF embedding needed
jsPDF's built-in `helvetica` renders `ä ö ü ß`, the en-dash `–`, and middot `·`
correctly (WinAnsi/cp1252). Do NOT reach for embedding a Unicode TTF font for
German text — it bloats the bundle for no benefit.
**Why:** the obvious worry with jsPDF is broken glyphs; for German (Latin-1) it
is a non-issue. Verified by rendering output to PNG.
**How to apply:** only embed a custom font if you need characters outside
cp1252 (e.g. Cyrillic, Polish ł, some quotes/emoji).

## Downscale + re-encode images before embedding
Plant photos are stored as full-resolution data URLs (often several MB each).
Draw each to an offscreen canvas (max edge ~900px, `toDataURL('image/jpeg', ~0.72)`)
before `addImage(..., 'JPEG', ...)`. This normalizes png/webp/jpeg to one format
and keeps the PDF small enough to build on a phone.
**Why:** embedding raw multi-MB data URLs makes the PDF huge and slow/crashy on
mobile Safari.

## Stream category-by-category; don't hold all image payloads at once
Plan the document (title totals, which sections to skip) from the lightweight
count endpoint, then fetch each group's records just-in-time inside the render
loop so the previous group's image data can be GC'd before the next loads.
**Why:** holding every selected record (with base64 images) in one array is the
peak-memory killer on low-end phones — it defeats the point of downscaling.

## Verifying a generated PDF without a browser
- jsPDF runs headless in Node for text + `addImage(dataUrlString, 'JPEG', ...)`
  (a data-URL string needs no DOM; only `HTMLImageElement`/canvas inputs do).
  Run the script from inside the package dir so Node resolves `jspdf` (bare
  imports resolve from the file's dir, not cwd).
- Render pages to images with `pdftoppm -png -r 110 file.pdf out` (poppler is
  available), then view the PNG with the ReadFile tool (it displays images).
  This is how you confirm layout + glyph rendering visually.
