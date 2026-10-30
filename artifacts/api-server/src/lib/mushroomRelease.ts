/**
 * Freigabe eines Pilzes durch den Betreiber (docs/scannen.md): the app owner
 * checked the photos of an archived mushroom and releases it as edible – or
 * takes the release back. The automatic rating stays strict (three photos and
 * a confident identification); this is the human check on top of it.
 */

/** Paragraph the scan writes when a mushroom was not rated edible (plantIdentification.ts). */
const NOT_CONFIRMED = /^⚠️ Nicht als essbar bestätigt:[^\n]*(\n\n|$)/;
/** Paragraph of an earlier release by the owner. */
const RELEASED = /^✅ Vom Betreiber [^\n]*(\n\n|$)/;

/** "30.10.2026" */
function deDate(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** The text without the paragraphs a scan or an earlier release put in front. */
export function withoutVerdict(details: string): string {
  let out = details;
  for (;;) {
    const next = out.replace(NOT_CONFIRMED, "").replace(RELEASED, "");
    if (next === out) return out;
    out = next;
  }
}

/** Edibility text after the owner's decision. */
export function releasedDetails(details: string, released: boolean, at: Date): string {
  const rest = withoutVerdict(details);
  const head = released
    ? `✅ Vom Betreiber am ${deDate(at)} anhand der Fotos geprüft und als essbar freigegeben. Trotzdem gilt: Pilze nur essen, wenn du dir sicher bist – im Zweifel eine Pilzberatungsstelle fragen.`
    : `⚠️ Nicht als essbar bestätigt: Der Betreiber hat die Freigabe am ${deDate(at)} zurückgenommen. Zur Sicherheit wird dieser Pilz wie ein giftiger Pilz behandelt.`;
  return rest ? `${head}\n\n${rest}` : head;
}
