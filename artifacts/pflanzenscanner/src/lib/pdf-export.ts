import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  getCategorySummary,
  listPlants,
  type Plant,
  type Insect,
} from "@workspace/api-client-react";
import { plantImageUrl, plantSideImageUrl, insectImageUrl } from "./image";
import { getImage } from "./image-store";
import { ANIMALS, getAnimalInfo } from "./animals";
import { HEAL_TARGETS, symptomsFor } from "./heal-targets";
import {
  VIEW_CATEGORIES,
  VIEW_CATEGORY_LABELS,
  apiCategoryOf,
  filterPlantsForView,
  viewCategoryOf,
  viewCount,
  type ViewCategory,
} from "./view-categories";

type RGB = [number, number, number];

// Category accent colors (mirror the tinted cards in the app).
const CATEGORY_COLOR: Record<ViewCategory, RGB> = {
  poisonous:          [190, 18, 60],   // rose-700
  edible:             [4, 120, 87],    // emerald-700
  medicinal:          [67, 56, 202],   // indigo-700
  mushroom:           [180, 83, 9],    // amber-700
  tree:               [15, 118, 110],  // teal-700
  shrub:              [77, 124, 15],   // lime-700
  moss:               [14, 116, 144],  // cyan-700
  cactus:             [194, 65, 12],   // orange-700
};

const GREEN: RGB = [4, 120, 87];
const RED: RGB = [190, 18, 60];
const TEXT: RGB = [31, 41, 55]; // gray-800
const MUTED: RGB = [107, 114, 128]; // gray-500
const LINE: RGB = [226, 232, 240]; // slate-200
const BRAND: RGB = [21, 128, 61]; // green-700

// jsPDF font sizes are in points; convert to mm (the document unit) for layout.
const PT_TO_MM = 0.352778;

export interface PdfExportResult {
  categories: number;
  plants: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Photos come from the Cloudinary CDN. Without CORS the canvas would be
    // tainted and toDataURL() throws, so every network image is requested in
    // CORS mode. For same-origin URLs "anonymous" still sends the session
    // cookie, so the server's own image endpoint keeps working.
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}

/**
 * Where to load an entry's photo from, in order: the copy in this device's
 * IndexedDB (always available offline), the CDN URL stored on the entry, and
 * finally the server endpoint that still serves pre-CDN rows.
 */
function remotePhotoSrc(imageUrl: string | null | undefined): string | null {
  return typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl)
    ? imageUrl
    : null;
}

interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

// Downscale + re-encode to JPEG. Photos are loaded from the same-origin image
// endpoint; re-encoding keeps the PDF small and normalizes every source format
// (jpeg / png / webp) so jsPDF only ever embeds JPEG.
async function prepareImage(
  src: string,
  maxEdge = 900,
  quality = 0.72,
): Promise<PreparedImage> {
  const img = await loadImage(src);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas-Kontext nicht verfügbar");
  // White backing so transparent PNGs don't render black in the PDF.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width: w, height: h };
}

/**
 * Build a single-plant info sheet as a PDF Blob. The layout mirrors the detail
 * page: large hero photo, side photo (mushrooms), safety status for every
 * animal, all text sections, and the full symptom list with applications.
 * Returns the raw Blob so the caller can share it via the Web Share API or
 * trigger a download via doc.save().
 */
export async function exportPlantPdf(plant: Plant, appUrl?: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const paragraph = (
    text: string,
    x: number,
    maxW: number,
    sizePt: number,
    style: "normal" | "bold" | "italic",
    color: RGB,
    lineFactor = 1.4,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(sizePt);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    const lh = sizePt * PT_TO_MM * lineFactor;
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, x, y, { baseline: "top" });
      y += lh;
    }
  };

  const section = (label: string, content: string | null | undefined) => {
    const value = (content ?? "").trim();
    if (!value) return;
    ensureSpace(18);
    paragraph(label.toUpperCase(), margin, contentW, 8, "bold", MUTED, 1.2);
    y += 1;
    paragraph(value, margin, contentW, 10.5, "normal", TEXT, 1.4);
    y += 4;
  };

  const divider = () => {
    ensureSpace(5);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.25);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
  };

  const badge = (text: string, x: number, yy: number, fill: RGB): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const padX = 2.4;
    const h = 5.4;
    const w = doc.getTextWidth(text) + padX * 2;
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, yy, w, h, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(text, x + padX, yy + h / 2 + 0.2, { baseline: "middle" });
    return w;
  };

  // ── Brand header ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text("KRÄUTER-HEXE", margin, y, { baseline: "top" });
  y += 9 * PT_TO_MM * 1.2 + 1;

  // ── Hero image ─────────────────────────────────────────────────────────────
  // For new local-first records, load from IndexedDB; fall back to the legacy
  // server endpoint for older records.
  const mainImgSrc =
    (plant.localImageId ? await getImage(plant.localImageId) : null) ??
    remotePhotoSrc(plant.imageUrl) ??
    plantImageUrl(plant.id);
  const sideImgSrc = plant.hasSideImage
    ? (plant.localImageId ? await getImage(`${plant.localImageId}-side`) : null) ??
      remotePhotoSrc(plant.imageUrlSide) ??
      plantSideImageUrl(plant.id)
    : null;

  const maxImgH = 85;
  const maxImgW = contentW;
  try {
    const prepared = await prepareImage(mainImgSrc, 1200, 0.8);
    const ratio = Math.min(maxImgW / prepared.width, maxImgH / prepared.height);
    const dw = prepared.width * ratio;
    const dh = prepared.height * ratio;
    ensureSpace(dh + 2);
    const imgX = margin + (contentW - dw) / 2;
    doc.addImage(prepared.dataUrl, "JPEG", imgX, y, dw, dh, undefined, "FAST");
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(imgX, y, dw, dh, "S");
    y += dh + 4;
  } catch {
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentW, 50, "S");
    y += 54;
  }

  // ── Side image (mushroom only) ─────────────────────────────────────────────
  if (plant.hasSideImage && sideImgSrc) {
    try {
      const sideW = (contentW - 4) / 2;
      const sideMaxH = 55;
      const prepared = await prepareImage(sideImgSrc, 800, 0.75);
      const ratio = Math.min(sideW / prepared.width, sideMaxH / prepared.height);
      const dw = prepared.width * ratio;
      const dh = prepared.height * ratio;
      ensureSpace(dh + 8);
      const imgX = margin + (sideW - dw) / 2;
      doc.addImage(prepared.dataUrl, "JPEG", imgX, y, dw, dh, undefined, "FAST");
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.2);
      doc.rect(imgX, y, dw, dh, "S");
      paragraph(
        "Ansicht von der Seite",
        margin,
        sideW,
        8,
        "normal",
        MUTED,
        1.2,
      );
      y += dh + 6;
    } catch {
      // Skip silently
    }
  }

  // ── Plant name ────────────────────────────────────────────────────────────
  ensureSpace(20);
  paragraph(plant.germanName, margin, contentW, 22, "bold", TEXT, 1.15);
  paragraph(plant.botanicalName, margin, contentW, 12, "italic", MUTED, 1.2);
  y += 1;
  paragraph(
    `Gescannt am ${format(new Date(plant.createdAt), "dd. MMMM yyyy", { locale: de })}`,
    margin,
    contentW,
    8.5,
    "normal",
    MUTED,
    1.2,
  );
  y += 3;

  divider();

  // ── Safety status ─────────────────────────────────────────────────────────
  paragraph("SICHERHEITSSTATUS", margin, contentW, 8, "bold", MUTED, 1.2);
  y += 2;

  // Human row
  const humanEdible = plant.humanStatus === "edible";
  let bx = margin;
  const humanBadgeText = humanEdible ? "Mensch: Ungiftig" : "Mensch: GIFTIG";
  bx += badge(humanBadgeText, bx, y, humanEdible ? GREEN : RED) + 3;
  y += 5.4 + 3;

  // Animal rows (two per line)
  const animalBadges: Array<{ text: string; safe: boolean }> = [];
  for (const a of ANIMALS) {
    const info = getAnimalInfo(plant, a.key);
    if (!info) continue;
    const safe = info.status === "safe";
    animalBadges.push({ text: `${a.label}: ${safe ? "Genießbar" : "GIFTIG"}`, safe });
  }
  let col = 0;
  let rowY = y;
  for (const b of animalBadges) {
    if (col === 2) { col = 0; rowY += 5.4 + 2; y = rowY; }
    const bxc = col === 0 ? margin : margin + contentW / 2;
    badge(b.text, bxc, rowY, b.safe ? GREEN : RED);
    col++;
  }
  y = rowY + 5.4 + 5;

  divider();

  // ── Text detail sections ───────────────────────────────────────────────────
  section("Erklärung: Mensch", plant.edibilityDetails);

  for (const a of ANIMALS) {
    const info = getAnimalInfo(plant, a.key);
    if (info?.toxicityDetails) section(`Erklärung: ${a.label}`, info.toxicityDetails);
  }

  if (plant.humanStatus === "edible" &&
      (plant.category === "edible" || plant.category === "mushroom")) {
    section("Zubereitung", plant.preparation);
  }

  section("Inhaltsstoffe", plant.activeIngredients);
  section("Standort & Vorkommen", plant.habitat);
  section("Standortansprüche", plant.siteConditions);
  section("Weitere Nutzung", plant.otherUses);
  section("Düngung im Eigenanbau", plant.fertilizerTips);

  // ── Heilwirkung ────────────────────────────────────────────────────────────
  const hasAnyBenefit =
    !!plant.humanBenefits?.trim() ||
    ANIMALS.some((a) => !!getAnimalInfo(plant, a.key)?.benefits?.trim());

  if (hasAnyBenefit) {
    divider();
    paragraph("HEILWIRKUNG", margin, contentW, 8, "bold", MUTED, 1.2);
    y += 2;
    if (plant.humanBenefits?.trim()) {
      paragraph("Für den Menschen", margin, contentW, 9.5, "bold", TEXT, 1.3);
      y += 0.5;
      paragraph(plant.humanBenefits, margin, contentW, 10.5, "normal", TEXT, 1.4);
      y += 3;
    }
    for (const a of ANIMALS) {
      const info = getAnimalInfo(plant, a.key);
      if (!info?.benefits?.trim()) continue;
      paragraph(`Für ${a.label}`, margin, contentW, 9.5, "bold", TEXT, 1.3);
      y += 0.5;
      paragraph(info.benefits, margin, contentW, 10.5, "normal", TEXT, 1.4);
      y += 3;
    }
  }

  // ── Behandelbare Beschwerden ───────────────────────────────────────────────
  const symptomGroups = HEAL_TARGETS.map((t) => ({
    ...t,
    tags: symptomsFor(plant, t.key),
  })).filter((g) => g.tags.length > 0);

  if (symptomGroups.length > 0) {
    divider();
    paragraph("BEHANDELBARE BESCHWERDEN", margin, contentW, 8, "bold", MUTED, 1.2);
    y += 3;
    for (const group of symptomGroups) {
      ensureSpace(10);
      paragraph(group.label.toUpperCase(), margin, contentW, 8.5, "bold", TEXT, 1.2);
      y += 1;
      const applications =
        (plant.symptomApplications as Record<string, Record<string, string>> | undefined)?.[group.key] ?? {};
      for (const tag of group.tags) {
        ensureSpace(8);
        // Tag pill — thin border box
        const tagH = 5.5;
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.setLineWidth(0.2);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
        const tagW = Math.min(doc.getTextWidth(tag) + 6, contentW);
        doc.roundedRect(margin, y, tagW, tagH, 1.5, 1.5, "S");
        doc.text(tag, margin + 3, y + tagH / 2 + 0.3, { baseline: "middle" });
        y += tagH + 1.5;
        const application = applications[tag];
        if (application) {
          paragraph(application, margin + 2, contentW - 4, 9, "normal", MUTED, 1.35);
        }
        y += 1;
      }
      y += 2;
    }
  }

  // ── Attribution box ────────────────────────────────────────────────────────
  const boxH = appUrl ? 22 : 16;
  ensureSpace(boxH + 6);
  y += 4;
  // Subtle green-tinted background
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(167, 243, 208); // emerald-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, boxH, 2.5, 2.5, "FD");

  // Brand label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text("KRÄUTER-HEXE", margin + 4, y + 5, { baseline: "top" });

  // Description
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
  doc.text(
    "Pflanzensteckbrief erstellt mit der Kräuter-Hexe App",
    margin + 4,
    y + 5 + 8.5 * PT_TO_MM * 1.3,
    { baseline: "top" },
  );

  // App URL as a visible link hint (if provided)
  if (appUrl) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const linkY = y + 5 + 8.5 * PT_TO_MM * 1.3 * 2 + 1;
    doc.text("Anmelden & App:", margin + 4, linkY, { baseline: "top" });
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
    const labelW = doc.getTextWidth("Anmelden & App:  ");
    // textWithLink uses the default "alphabetic" baseline; shift down by ~75% of
    // the font height (8pt × 0.352778 mm/pt × 0.75) to align with our "top" grid.
    const lbShift = 8 * PT_TO_MM * 0.75;
    doc.textWithLink(appUrl, margin + 4 + labelW, linkY + lbShift, { url: appUrl });
  }

  y += boxH + 6;

  // ── Footer on every page ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  const footerDate = format(new Date(), "dd.MM.yyyy", { locale: de });
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const appNote = appUrl ? ` · ${appUrl}` : "";
    const left = `Kräuter-Hexe · ${footerDate}${appNote}`;
    const right = pageCount > 1 ? `Seite ${i} / ${pageCount}` : "";
    // Clip the left label so it never runs into the page number on the right.
    const rightW = right ? doc.getTextWidth(right) + 4 : 0;
    const maxLeft = contentW - rightW;
    const clippedLeft = doc.splitTextToSize(left, maxLeft)[0] as string;
    doc.text(clippedLeft, margin, pageH - 8, { baseline: "top" });
    if (right) {
      doc.text(right, pageW - margin - doc.getTextWidth(right), pageH - 8, {
        baseline: "top",
      });
    }
  }

  return doc.output("blob");
}

/**
 * Build and download a clean, print-friendly PDF of the archive for the given
 * categories. Categories are emitted in the app's fixed order; within each
 * category the plants keep the API's newest-first ordering (same as in-app).
 * The library is imported dynamically so it only loads when a user exports.
 */
export async function exportCategoriesPdf(
  categories: ViewCategory[],
): Promise<PdfExportResult> {
  const { jsPDF } = await import("jspdf");

  const ordered = VIEW_CATEGORIES.filter((c) => categories.includes(c));

  // Use the lightweight category summary for counts so the title and page layout
  // can be planned WITHOUT holding every category's (multi-MB) image payloads in
  // memory at once. Each category's plants are fetched just-in-time below and
  // released before the next category loads — important for large archives on
  // low-end phones.
  const summary = await getCategorySummary();
  const countOf = (c: ViewCategory) => viewCount(summary, c);
  const nonEmpty = ordered.filter((c) => countOf(c) > 0);
  const totalPlants = nonEmpty.reduce((sum, c) => sum + countOf(c), 0);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const paragraph = (
    text: string,
    x: number,
    maxW: number,
    sizePt: number,
    style: "normal" | "bold" | "italic",
    color: RGB,
    lineFactor = 1.35,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(sizePt);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    const lh = sizePt * PT_TO_MM * lineFactor;
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, x, y, { baseline: "top" });
      y += lh;
    }
  };

  const section = (label: string, content: string | null | undefined) => {
    const value = (content ?? "").trim();
    if (!value) return;
    ensureSpace(6);
    paragraph(label.toUpperCase(), margin, contentW, 8, "bold", MUTED, 1.2);
    y += 1;
    paragraph(value, margin, contentW, 10.5, "normal", TEXT, 1.4);
    y += 3.5;
  };

  const badge = (text: string, x: number, yy: number, fill: RGB): number => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const padX = 2.4;
    const h = 5.4;
    const w = doc.getTextWidth(text) + padX * 2;
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, yy, w, h, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(text, x + padX, yy + h / 2 + 0.2, { baseline: "middle" });
    return w;
  };

  const categoryHeading = (category: ViewCategory, count: number) => {
    const bandH = 11;
    ensureSpace(bandH + 6);
    const color = CATEGORY_COLOR[category];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(margin, y, contentW, bandH, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(VIEW_CATEGORY_LABELS[category], margin + 4, y + bandH / 2, {
      baseline: "middle",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const countText = `${count} ${count === 1 ? "Eintrag" : "Einträge"}`;
    const cw = doc.getTextWidth(countText);
    doc.text(countText, pageW - margin - 4 - cw, y + bandH / 2, {
      baseline: "middle",
    });
    y += bandH + 6;
  };

  const renderPlant = async (plant: Plant) => {
    const imgBox = 45;
    const gap = 6;
    ensureSpace(imgBox + 8);
    const top = y;

    let imgBottom = top + imgBox;
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    try {
      const localSrc = plant.localImageId ? await getImage(plant.localImageId) : null;
      const prepared = await prepareImage(
        localSrc ?? remotePhotoSrc(plant.imageUrl) ?? plantImageUrl(plant.id),
      );
      const ratio = Math.min(imgBox / prepared.width, imgBox / prepared.height);
      const dw = prepared.width * ratio;
      const dh = prepared.height * ratio;
      doc.addImage(prepared.dataUrl, "JPEG", margin, top, dw, dh, undefined, "FAST");
      doc.rect(margin, top, dw, dh, "S");
      imgBottom = top + dh;
    } catch {
      // Keep a placeholder box so the layout stays consistent.
      doc.rect(margin, top, imgBox, imgBox, "S");
    }

    const textX = margin + imgBox + gap;
    const textW = contentW - imgBox - gap;
    let ty = top;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    for (const line of doc.splitTextToSize(plant.germanName, textW) as string[]) {
      doc.text(line, textX, ty, { baseline: "top" });
      ty += 15 * PT_TO_MM * 1.2;
    }
    ty += 0.5;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    for (const line of doc.splitTextToSize(plant.botanicalName, textW) as string[]) {
      doc.text(line, textX, ty, { baseline: "top" });
      ty += 10.5 * PT_TO_MM * 1.2;
    }
    ty += 1.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(
      `Gescannt am ${format(new Date(plant.createdAt), "dd.MM.yyyy", { locale: de })}`,
      textX,
      ty,
      { baseline: "top" },
    );
    ty += 8.5 * PT_TO_MM * 1.2 + 2.5;

    const humanEdible = plant.humanStatus === "edible";
    const poultrySafe = plant.poultryStatus === "safe";
    const bw = badge(
      humanEdible ? "Mensch: Ungiftig" : "Mensch: GIFTIG",
      textX,
      ty,
      humanEdible ? GREEN : RED,
    );
    badge(
      poultrySafe ? "Geflügel: Genießbar" : "Geflügel: GIFTIG",
      textX + bw + 3,
      ty,
      poultrySafe ? GREEN : RED,
    );
    ty += 5.4;

    // Continue below whichever column (image or text) is taller.
    y = Math.max(imgBottom, ty) + 6;

    section("Erklärung: Mensch", plant.edibilityDetails);
    for (const a of ANIMALS) {
      const info = getAnimalInfo(plant, a.key);
      if (info) section(`Erklärung: ${a.label}`, info.toxicityDetails);
    }
    section("Inhaltsstoffe", plant.activeIngredients);
    section("Standort & Vorkommen", plant.habitat);
    section("Standortansprüche", plant.siteConditions);
    section("Weitere Nutzung", plant.otherUses);
    section("Düngung im Eigenanbau", plant.fertilizerTips);
    section("Heilwirkung – Für den Menschen", plant.humanBenefits);
    for (const a of ANIMALS) {
      const info = getAnimalInfo(plant, a.key);
      if (info) section(`Heilwirkung – Für ${a.label}`, info.benefits);
    }

    ensureSpace(6);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  };

  // ---- Title block (first page) ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text("PFLANZENSCANNER", margin, y, { baseline: "top" });
  y += 9 * PT_TO_MM * 1.2 + 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
  doc.text("Pflanzen-Archiv", margin, y, { baseline: "top" });
  y += 24 * PT_TO_MM * 1.1 + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const created = format(new Date(), "dd. MMMM yyyy", { locale: de });
  const catWord = nonEmpty.length === 1 ? "Kategorie" : "Kategorien";
  const plantWord = totalPlants === 1 ? "Eintrag" : "Einträge";
  doc.text(
    `Erstellt am ${created}  ·  ${nonEmpty.length} ${catWord}  ·  ${totalPlants} ${plantWord}`,
    margin,
    y,
    { baseline: "top" },
  );
  y += 10 * PT_TO_MM * 1.2 + 4;

  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  if (nonEmpty.length === 0) {
    paragraph(
      "Keine Einträge in den ausgewählten Kategorien.",
      margin,
      contentW,
      11,
      "normal",
      MUTED,
    );
  } else {
    let renderedGroups = 0;
    for (const category of nonEmpty) {
      // Fetch only the current category; the previous category's plants (and
      // their image data) become eligible for GC before the next load. The
      // mushroom halves load the shared "mushroom" list and narrow it here.
      const plants = filterPlantsForView(
        await listPlants({ category: apiCategoryOf(category) }),
        category,
      );
      if (plants.length === 0) continue;
      // Each category starts on a fresh page for a clear, sectioned document.
      if (renderedGroups > 0) {
        doc.addPage();
        y = margin;
      }
      renderedGroups += 1;
      categoryHeading(category, plants.length);
      for (const plant of plants) {
        await renderPlant(plant);
        // Yield between plants so the UI thread stays responsive on big exports.
        await new Promise((resolve) => setTimeout(resolve));
      }
    }
  }

  // ---- Page-number footer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const label = `Seite ${i} / ${pageCount}`;
    doc.text(label, pageW - margin - doc.getTextWidth(label), pageH - 8, {
      baseline: "top",
    });
  }

  const dateSlug = format(new Date(), "yyyy-MM-dd");
  const filename =
    nonEmpty.length === 1
      ? `Kraeuterhexe_${VIEW_CATEGORY_LABELS[nonEmpty[0]].replace(/\s+/g, "-")}_${dateSlug}.pdf`
      : `Kraeuterhexe_Archiv_${dateSlug}.pdf`;
  doc.save(filename);

  return { categories: nonEmpty.length, plants: totalPlants };
}

// ─── Insekten PDF export ──────────────────────────────────────────────────────

const INSECT_CATEGORY_LABELS: Record<string, string> = {
  beetle:       "Käfer",
  butterfly:    "Schmetterlinge",
  bee_wasp:     "Bienen / Wespen",
  fly_mosquito: "Fliegen / Mücken",
  bug_cicada:   "Wanzen / Zikaden",
  grasshopper:  "Heuschrecken",
  dragonfly:    "Libellen",
  spider_other: "Spinnen / Andere",
};

const INSECT_RELATION_COLOR: Record<string, RGB> = {
  pest:       [190, 18, 60],   // rose-700
  beneficial: [4, 120, 87],    // emerald-700
  neutral:    [107, 114, 128], // gray-500
};

const INSECT_RELATION_LABEL: Record<string, string> = {
  pest:       "Schädling",
  beneficial: "Nützling",
  neutral:    "Neutral",
};

export interface PlantSelectionPdfResult {
  count: number;
}

/**
 * Export a hand-picked list of plants as a compact multi-plant A4 PDF.
 * One card per plant: hero photo, name, category badge, key text sections.
 * Mirrors the layout style of exportInsectsPdf so both tabs feel consistent.
 */
export async function exportSelectedPlantsPdf(
  plants: Plant[],
): Promise<PlantSelectionPdfResult> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const para = (
    text: string,
    x: number,
    w: number,
    size: number,
    style: "normal" | "bold" | "italic" = "normal",
    color: RGB = TEXT,
    lf = 1.4,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, w) as string[];
    const lh = size * PT_TO_MM * lf;
    for (const line of lines) {
      ensureSpace(lh);
      doc.text(line, x, y, { baseline: "top" });
      y += lh;
    }
  };

  const sect = (label: string, content: string | null | undefined) => {
    const v = (content ?? "").trim();
    if (!v) return;
    ensureSpace(18);
    para(label.toUpperCase(), margin, contentW, 8, "bold", MUTED, 1.2);
    y += 1;
    para(v, margin, contentW, 10, "normal", TEXT, 1.4);
    y += 3;
  };

  const hRule = () => {
    ensureSpace(6);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.25);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  };

  // ── Cover header ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text("Mein Beet", margin, y, { baseline: "top" });
  y += 22 * PT_TO_MM * 1.1 + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const created = format(new Date(), "dd. MMMM yyyy", { locale: de });
  const word = plants.length === 1 ? "Pflanze" : "Pflanzen";
  doc.text(`Erstellt am ${created}  ·  ${plants.length} ${word}`, margin, y, { baseline: "top" });
  y += 10 * PT_TO_MM * 1.2 + 4;

  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Per-plant cards ─────────────────────────────────────────────────────────
  for (let i = 0; i < plants.length; i += 1) {
    const plant = plants[i];
    const viewCat = viewCategoryOf(plant);
    const catColor: RGB = CATEGORY_COLOR[viewCat] ?? MUTED;

    // Photo (local-first: try IndexedDB first, fall back to server URL)
    try {
      const localSrc = plant.localImageId ? await getImage(plant.localImageId) : null;
      const photo = await prepareImage(
        localSrc ?? remotePhotoSrc(plant.imageUrl) ?? plantImageUrl(plant.id),
        900,
        0.78,
      );
      const photoH = Math.min((photo.height / photo.width) * contentW, 80);
      ensureSpace(photoH + 3);
      doc.addImage(photo.dataUrl, "JPEG", margin, y, contentW, photoH, undefined, "FAST");
      y += photoH + 3;
    } catch {
      // no photo — leave gap
    }

    // Category pill
    const catLabel = VIEW_CATEGORY_LABELS[viewCat];
    const isToxic = plant.humanStatus === "poisonous";
    const safetyLabel = isToxic ? "GIFTIG" : "UNGIFTIG";
    const safetyColor: RGB = isToxic ? RED : GREEN;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(catColor[0], catColor[1], catColor[2]);
    doc.text(`${catLabel.toUpperCase()}`, margin, y, { baseline: "top" });
    const catLabelW = doc.getTextWidth(`${catLabel.toUpperCase()}`);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text("  ·  ", margin + catLabelW, y, { baseline: "top" });
    const dotW = doc.getTextWidth("  ·  ");
    doc.setTextColor(safetyColor[0], safetyColor[1], safetyColor[2]);
    doc.text(safetyLabel, margin + catLabelW + dotW, y, { baseline: "top" });
    y += 8 * PT_TO_MM * 1.4 + 1;

    // Names
    para(plant.germanName, margin, contentW, 14, "bold", TEXT, 1.15);
    if (plant.botanicalName) {
      para(plant.botanicalName, margin, contentW, 9, "italic", MUTED, 1.2);
    }
    y += 1;

    // Scan date
    const scanned = format(new Date(plant.createdAt), "dd.MM.yyyy", { locale: de });
    para(`Gescannt am ${scanned}`, margin, contentW, 8, "normal", MUTED, 1.2);
    y += 2;

    // Key text sections
    sect("Standort & Vorkommen", plant.habitat);
    sect("Inhaltsstoffe", plant.activeIngredients);
    sect("Heilwirkung (Mensch)", plant.humanBenefits);
    sect("Weitere Nutzung", plant.otherUses);
    sect("Düngung im Eigenanbau", plant.fertilizerTips);

    if (i < plants.length - 1) {
      hRule();
      await new Promise((r) => setTimeout(r));
    }
  }

  // ── Page numbers ────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const label = `Seite ${i} / ${pageCount}`;
    doc.text(label, pageW - margin - doc.getTextWidth(label), pageH - 8, { baseline: "top" });
  }

  const dateSlug = format(new Date(), "yyyy-MM-dd");
  doc.save(`Kraeuterhexe_Beet_${dateSlug}.pdf`);

  return { count: plants.length };
}

export interface InsectPdfExportResult {
  count: number;
}

/**
 * Export a list of insect records as a styled A4 PDF (one card per insect).
 * Layout: cover header → per-insect cards with photo, names, badges, and text.
 */
export async function exportInsectsPdf(
  insects: Insect[],
): Promise<InsectPdfExportResult> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const paragraph = (
    text: string,
    x: number,
    w: number,
    size: number,
    style: "normal" | "bold" = "normal",
    color: RGB = TEXT,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, w) as string[];
    ensureSpace(lines.length * size * PT_TO_MM * 1.35);
    doc.text(lines, x, y, { baseline: "top" });
    y += lines.length * size * PT_TO_MM * 1.35 + 1;
  };

  const divider = () => {
    ensureSpace(6);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.25);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  };

  // ── Cover header ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
  doc.text("Insekten-Archiv", margin, y, { baseline: "top" });
  y += 22 * PT_TO_MM * 1.1 + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const created = format(new Date(), "dd. MMMM yyyy", { locale: de });
  const insectWord = insects.length === 1 ? "Eintrag" : "Einträge";
  doc.text(
    `Erstellt am ${created}  ·  ${insects.length} ${insectWord}`,
    margin, y, { baseline: "top" },
  );
  y += 10 * PT_TO_MM * 1.2 + 4;

  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Per-insect cards ────────────────────────────────────────────────────────
  for (let i = 0; i < insects.length; i += 1) {
    const insect = insects[i];

    // Photo (optional — silently skip if it fails to load)
    let photo: PreparedImage | null = null;
    try {
      const localSrc = insect.localImageId ? await getImage(insect.localImageId) : null;
      photo = await prepareImage(
        localSrc ?? remotePhotoSrc(insect.imageUrl) ?? insectImageUrl(insect.id),
        900,
        0.78,
      );
    } catch {
      // no image stored yet
    }

    const photoH = photo ? Math.min((photo.height / photo.width) * contentW, 80) : 0;
    const photoW = photo ? contentW : 0;

    ensureSpace(photoH + 40);

    // Photo
    if (photo) {
      doc.addImage(photo.dataUrl, "JPEG", margin, y, photoW, photoH);
      y += photoH + 3;
    }

    // Relation badge pill (coloured text)
    const relColor = INSECT_RELATION_COLOR[insect.relationStatus] ?? MUTED;
    const relLabel = INSECT_RELATION_LABEL[insect.relationStatus] ?? insect.relationStatus;
    const catLabel = INSECT_CATEGORY_LABELS[insect.category] ?? insect.category;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(relColor[0], relColor[1], relColor[2]);
    doc.text(`${relLabel.toUpperCase()}  ·  ${catLabel}`, margin, y, { baseline: "top" });
    y += 8 * PT_TO_MM * 1.4 + 1;

    // German name
    paragraph(insect.germanName, margin, contentW, 14, "bold", TEXT);

    // Scientific name
    if (insect.scientificName) {
      paragraph(insect.scientificName, margin, contentW, 9, "normal", MUTED);
    }

    y += 1;

    // Description
    if (insect.description) {
      paragraph(insect.description, margin, contentW, 9, "normal", TEXT);
    }

    // Treatment tips (pests only)
    if (insect.treatmentTips) {
      y += 2;
      paragraph("Bekämpfung & Vorbeugung", margin, contentW, 9, "bold", relColor);
      paragraph(insect.treatmentTips, margin, contentW, 9, "normal", TEXT);
    }

    // Affected plants
    if (insect.affectedPlants.length > 0) {
      y += 2;
      paragraph(
        `Befallene Pflanzen: ${insect.affectedPlants.join(", ")}`,
        margin, contentW, 8, "normal", MUTED,
      );
    }

    // Scan date
    const scanned = format(new Date(insect.createdAt), "dd.MM.yyyy", { locale: de });
    paragraph(`Gescannt am ${scanned}`, margin, contentW, 8, "normal", MUTED);

    if (i < insects.length - 1) {
      divider();
      // Yield to keep UI responsive during large exports
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  // ── Page-number footer ──────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const label = `Seite ${i} / ${pageCount}`;
    doc.text(label, pageW - margin - doc.getTextWidth(label), pageH - 8, { baseline: "top" });
  }

  const dateSlug = format(new Date(), "yyyy-MM-dd");
  doc.save(`Kraeuterhexe_Insekten_${dateSlug}.pdf`);

  return { count: insects.length };
}
