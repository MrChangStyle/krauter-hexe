// Downscaling keeps stored/served photos small enough to decode reliably on
// mobile browsers and cheap to transfer over mobile connections. Raw
// camera/gallery photos are frequently several megabytes; 1280px longest edge
// at JPEG quality 0.72 is sharp on a phone screen at roughly 100-150 KB.

// Downscale a captured File directly via an object URL. This deliberately
// avoids reading the original file as a base64 data URL first: that string
// alone is ~1.4x the file size and roughly doubles the peak memory of the
// capture pipeline - which is exactly what gets the tab killed (page reload
// mid-scan) on low-memory phones right after the camera closes.
export async function downscaleFile(
  file: File,
  maxEdge = 1280,
  quality = 0.72,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scaled = renderDownscaled(img, maxEdge, quality);
    if (scaled) return scaled;
  } catch {
    // Not decodable in this browser (exotic camera/gallery format): fall
    // through and use the original bytes instead of failing the capture.
  } finally {
    URL.revokeObjectURL(url);
  }
  // Canvas unavailable, zero-sized image, or undecodable format: fall back
  // to the original bytes.
  return fileToDataUrl(file);
}

// Scan-optimised downscale: 900 px longest edge, JPEG at quality 0.80.
// Gemini's vision model does not support WebP (returns INVALID_ARGUMENT 400),
// so we always produce JPEG here. 900 px is sufficient for species
// identification and keeps the base64 payload around 60-80 KB vs ~200 KB for
// the default 1280 px archive version.
export async function downscaleScan(
  file: File,
  maxEdge = 900,
  quality = 0.80,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scaled = renderDownscaled(img, maxEdge, quality); // JPEG, no WebP
    if (scaled) return scaled;
  } catch {
    // Undecodable format: pass original bytes; server still handles it.
  } finally {
    URL.revokeObjectURL(url);
  }
  return fileToDataUrl(file);
}

// Downscale an image that is already a data URL (e.g. photos restored from
// the offline queue that were stored before downscaling existed).
export async function downscaleDataUrl(
  dataUrl: string,
  maxEdge = 1280,
  quality = 0.72,
): Promise<string> {
  const img = await loadImage(dataUrl);
  return renderDownscaled(img, maxEdge, quality) ?? dataUrl;
}

// URL under which the API serves a plant's stored photo as a real, cacheable
// image (JSON list/detail responses intentionally carry no image payload).
export function plantImageUrl(id: number): string {
  return `${import.meta.env.BASE_URL}api/plants/${id}/image`;
}

// URL under which the API serves an insect's stored photo.
export function insectImageUrl(id: number): string {
  return `${import.meta.env.BASE_URL}api/insects/${id}/image`;
}

// Side view (Bild 2 of the two-photo mushroom scan); 404 when the entry has
// none - only rendered when the plant's hasSideImage flag is true.
export function plantSideImageUrl(id: number): string {
  return `${import.meta.env.BASE_URL}api/plants/${id}/image/side`;
}

// ── Category placeholder illustrations ──────────────────────────────────────
//
// Community/archive views never attempt to load another user's local photo
// from IndexedDB (images don't exist on the viewer's device). Instead they
// always display a static category-matched illustration bundled under
// public/placeholders/.
//
// Private views (Mein Beet, Meine Scans, Meine Insekten, detail pages) use
// useLocalImage which tries IndexedDB first and falls back to these
// placeholders when the image is absent.

const PLANT_PLACEHOLDER_NAMES: Record<string, string> = {
  poisonous: "plant-poisonous",
  edible:    "plant-edible",
  medicinal: "plant-medicinal",
  mushroom:  "plant-mushroom",
  tree:      "plant-tree",
  shrub:     "plant-shrub",
  moss:      "plant-moss",
  cactus:    "plant-cactus",
};

const INSECT_PLACEHOLDER_NAMES: Record<string, string> = {
  beetle:       "insect-beetle",
  butterfly:    "insect-butterfly",
  bee_wasp:     "insect-bee_wasp",
  fly_mosquito: "insect-fly_mosquito",
  bug_cicada:   "insect-bug_cicada",
  grasshopper:  "insect-grasshopper",
  dragonfly:    "insect-dragonfly",
  spider_other: "insect-spider_other",
};

/** Returns the URL of the category placeholder SVG for a plant category. */
export function plantCategoryPlaceholder(category: string): string {
  const name = PLANT_PLACEHOLDER_NAMES[category] ?? "plant-edible";
  return `${import.meta.env.BASE_URL}placeholders/${name}.svg`;
}

/** Returns the URL of the category placeholder SVG for an insect category. */
export function insectCategoryPlaceholder(category: string): string {
  const name = INSECT_PLACEHOLDER_NAMES[category] ?? "insect-beetle";
  return `${import.meta.env.BASE_URL}placeholders/${name}.svg`;
}

function renderDownscaled(
  img: HTMLImageElement,
  maxEdge: number,
  quality: number,
): string | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // White backing so transparent PNGs don't flatten to black under JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL("image/jpeg", quality);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Fehler beim Lesen des Bildes."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}
