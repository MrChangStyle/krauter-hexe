import {
  BEE_COLONY_COLUMNS,
  BEE_TREATMENT_COLUMNS,
  MEDICAL_COLUMNS,
  beeColonyRow,
  beeTreatmentRow,
  hasBees,
  countText,
  STOCK_COLUMNS,
  deDate,
  exportFileName,
  medicalRow,
  stockRow,
  type ExportData,
} from "./farm-health";
import { todayIso } from "./farm-labels";
import { ORGANIC_DISCLAIMER } from "./farming-labels";
import { FERTILIZER_COLUMNS, GRAZING_COLUMNS, ORGANIC_FEED_COLUMNS, ORGANIC_SPACE_COLUMNS, SEED_COLUMNS } from "./organic-check";

type RGB = [number, number, number];

const TEXT: RGB = [31, 41, 55]; // gray-800
const MUTED: RGB = [107, 114, 128]; // gray-500
const LINE: RGB = [226, 232, 240]; // slate-200
const HEAD_BG: RGB = [241, 245, 249]; // slate-100
const BRAND: RGB = [21, 128, 61]; // green-700

// Relative column widths; scaled to the page.
const STOCK_WIDTHS = [16, 14, 11, 14, 10, 11, 12, 11];
const MEDICAL_WIDTHS = [9, 12, 10, 17, 18, 13, 11, 7, 9, 11];
const BEE_COLONY_WIDTHS = [20, 24, 14, 12, 12];
const BEE_TREATMENT_WIDTHS = [9, 12, 12, 12, 16, 8, 9, 12, 16];

/** The extra parts of the Bio-Dokumentation (docs/bio.md, B5). */
export interface OrganicDoc {
  /** e.g. "Bio · DE-ÖKO-006 · seit 01.03.2024" */
  status: string;
  /** null: the farm keeps this area conventional (Bio je Bereich). */
  feedRows: string[][] | null;
  /** null: Stall und Auslauf kept conventional – grazing goes with it. */
  spaceRows: string[][] | null;
  grazingRows: string[][] | null;
  /** null: the member may not see the seeds. */
  seedRows: string[][] | null;
  /** null: the member may not see the garden. */
  fertilizerRows: string[][] | null;
  /** Areas the farm keeps conventional, e.g. "Fütterung, Erzeugnisse"; empty when none. */
  conventional: string;
}

/**
 * Stock list and health history for the veterinary office, A4 landscape.
 * Saves the file and returns its name.
 */
export async function exportFarmPdf(data: ExportData, organic?: OrganicDoc): Promise<string> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const bottom = pageH - 14;
  const fontSize = 8;
  const lineH = 3.6;
  let y = margin;

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  function title(text: string, size: number, rgb: RGB = TEXT) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    color(rgb);
    doc.text(text, margin, y, { baseline: "top" });
    y += size * 0.45 + 2;
  }

  function table(columns: readonly string[], weights: number[], rows: string[][], empty: string) {
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * contentW);

    const drawRow = (cells: readonly string[], head: boolean) => {
      doc.setFont("helvetica", head ? "bold" : "normal");
      doc.setFontSize(fontSize);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(c, widths[i]! - 2) as string[]);
      const height = Math.max(...wrapped.map((w) => w.length)) * lineH + 2;
      if (y + height > bottom) {
        doc.addPage();
        y = margin;
        if (!head) drawRow(columns, true);
        doc.setFont("helvetica", head ? "bold" : "normal");
        doc.setFontSize(fontSize);
      }
      if (head) {
        doc.setFillColor(HEAD_BG[0], HEAD_BG[1], HEAD_BG[2]);
        doc.rect(margin, y, contentW, height, "F");
      }
      color(TEXT);
      let x = margin;
      wrapped.forEach((lines, i) => {
        doc.text(lines, x + 1, y + 1, { baseline: "top", lineHeightFactor: lineH / (fontSize * 0.3528) });
        x += widths[i]!;
      });
      y += height;
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.line(margin, y, margin + contentW, y);
    };

    drawRow(columns, true);
    if (rows.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(fontSize);
      color(MUTED);
      doc.text(empty, margin + 1, y + 1.5, { baseline: "top" });
      y += lineH + 3;
    }
    for (const row of rows) drawRow(row, false);
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  title(organic ? "Bio-Dokumentation" : "Bestandsliste und Medizin-Historie", 15, BRAND);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  color(TEXT);
  doc.text(
    [
      data.farmName,
      data.holdingNumber ? `Registriernummer ${data.holdingNumber}` : null,
      `Zeitraum ${deDate(data.period.from)} – ${deDate(data.period.to)}`,
      organic?.status ?? null,
    ]
      .filter(Boolean)
      .join(" · "),
    margin,
    y,
    { baseline: "top" },
  );
  y += 8;

  title(`Bestandsliste (${countText(data.animals.length, "Tier", "Tiere")})`, 11);
  table(STOCK_COLUMNS, STOCK_WIDTHS, data.animals.map(stockRow), "Keine Tiere in diesem Zeitraum.");
  y += 6;
  if (y + 20 > bottom) {
    doc.addPage();
    y = margin;
  }
  title(`Medizin-Historie (${countText(data.records.length, "Eintrag", "Einträge")})`, 11);
  table(MEDICAL_COLUMNS, MEDICAL_WIDTHS, data.records.map(medicalRow), "Keine Einträge in diesem Zeitraum.");

  const section = (text: string) => {
    y += 6;
    if (y + 20 > bottom) {
      doc.addPage();
      y = margin;
    }
    title(text, 11);
  };

  if (organic) {
    // Shares and areas as of today; "(!)" marks a value outside the Richtwert.
    if (organic.feedRows) {
      section("Fütterung – Anteile der aktuellen Rationen (Trockenmasse, Stand heute)");
      table(ORGANIC_FEED_COLUMNS, [20, 11, 14, 13, 11, 31], organic.feedRows, "Keine Rationen im Futterplaner.");
    }
    if (organic.spaceRows) {
      section("Stall und Auslauf (Stand heute)");
      table(ORGANIC_SPACE_COLUMNS, [24, 8, 16, 14, 16, 14], organic.spaceRows, "Keine Gruppen mit Bio-Mindestflächen.");
    }
    if (organic.grazingRows) {
      section(`Weidegang (${countText(organic.grazingRows.length, "Eintrag", "Einträge")})`);
      table(GRAZING_COLUMNS, [24, 30, 10, 12, 12], organic.grazingRows, "Kein Weidegang in diesem Zeitraum eingetragen.");
    }
    if (organic.seedRows) {
      section(`Saatgut (Bestand heute, ${countText(organic.seedRows.length, "Posten", "Posten")})`);
      table(SEED_COLUMNS, [20, 18, 14, 16, 10, 10, 12], organic.seedRows, "Kein Saatgut eingetragen.");
    }
    if (organic.fertilizerRows) {
      section(`Düngung (${countText(organic.fertilizerRows.length, "Eintrag", "Einträge")})`);
      table(FERTILIZER_COLUMNS, [12, 20, 22, 30, 10], organic.fertilizerRows, "Keine Düngung in diesem Zeitraum eingetragen.");
    }
    y += 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(fontSize);
    color(MUTED);
    const notes = doc.splitTextToSize(
      `(!) = außerhalb des Richtwerts der EU-Öko-Verordnung. ${ORGANIC_DISCLAIMER}${organic.conventional ? ` Konventionell geführt: ${organic.conventional}.` : ""}`,
      contentW,
    ) as string[];
    doc.text(notes, margin, y, { baseline: "top" });
    y += lineH * notes.length;
  }

  if (hasBees(data)) {
    section(`Bienenvölker (${countText(data.beeColonies.length, "Volk", "Völker")})`);
    table(BEE_COLONY_COLUMNS, BEE_COLONY_WIDTHS, data.beeColonies.map(beeColonyRow), "Keine Völker in diesem Zeitraum.");
    section(`Bienen – Bestandsbuch der Behandlungen (${countText(data.beeTreatments.length, "Eintrag", "Einträge")})`);
    table(BEE_TREATMENT_COLUMNS, BEE_TREATMENT_WIDTHS, data.beeTreatments.map(beeTreatmentRow), "Keine Behandlungen in diesem Zeitraum.");
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const created = deDate(todayIso());
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(MUTED);
    doc.text(`Erstellt mit Little Farming am ${created}`, margin, pageH - 8, { baseline: "top" });
    const label = `Seite ${i} / ${pageCount}`;
    doc.text(label, pageW - margin - doc.getTextWidth(label), pageH - 8, { baseline: "top" });
  }

  const name = organic ? exportFileName(data, "pdf").replace("_Bestand_", "_Bio-Dokumentation_") : exportFileName(data, "pdf");
  doc.save(name);
  return name;
}
