/**
 * Alltagsnotizen (docs/alltagsnotizen.md): the pure rules – shopping or
 * something to remember, and which section of the shop. No database, so the
 * unit tests load it directly. Lower-case German word stems; the first list
 * that matches wins.
 */

import type { NoteCategory, NoteKind } from '@workspace/db/schema';

// Word boundaries that also hold for ä, ö, ü and ß (\b does not).
const w = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})`, 'iu');

// Doing or remembering, not buying: "Oma anrufen", "Tierarzt Termin", "Rechnung bezahlen".
const REMEMBER = w('anruf|anrufen|termin|nicht vergessen|denk an|denken an|bezahl|überweis|zahlen|schreib|mail|melden|zurückrufen|abgeben|zurückbringen|kündig|reparier|geburtstag|tanken|müll|arzt|abholen von');
const BUY = w('kauf|einkauf|besorg|holen|mitbringen|nachkaufen|bestellen|brauche|brauchen|fehlt');

const CATEGORIES: Array<[NoteCategory, RegExp]> = [
  ['tierbedarf', w('hühnerfutter|legemehl|futter|katzenfutter|hundefutter|einstreu|heu|stroh|leckerli|kauknochen|vogelfutter|körner|mineral|katzenstreu|wurmkur')],
  ['garten', w('erde|blumenerde|dünger|samen|saatgut|pflanzen|setzlinge|gartenschlauch|schlauch|mulch|rindenmulch|torf|kompost|schneckenkorn|vlies|baumarkt|schrauben|nägel|dübel|farbe|lack|batterie|glühbirne|leuchtmittel|kabel')],
  ['drogerie', w('zahnbürste|zahnpasta|zahncreme|shampoo|duschgel|seife|deo|creme|rasier|klopapier|toilettenpapier|taschentücher|windeln|tampons|binden|pflaster|tabletten|medikament|apotheke|sonnencreme|wattepads|haargummi')],
  ['haushalt', w('spülmittel|spülmaschine|tabs|waschmittel|weichspüler|putzmittel|reiniger|müllbeutel|müllsäcke|alufolie|frischhaltefolie|backpapier|küchenrolle|schwamm|lappen|kerzen|servietten|eierkartons|gefrierbeutel|haushalt')],
  ['getraenke', w('wasser|sprudel|saft|bier|wein|sekt|cola|limo|limonade|milch|kaffee|tee|kakao|getränk')],
  ['lebensmittel', w('fleisch|wurst|schinken|käse|brot|brötchen|butter|joghurt|quark|sahne|eier|mehl|zucker|salz|nudeln|reis|kartoffel|zwiebel|knoblauch|tomate|gurke|salat|paprika|apfel|äpfel|banane|obst|gemüse|hackfleisch|hähnchen|fisch|öl|essig|marmelade|honig|müsli|haferflocken|gewürz|pfeffer|senf|ketchup|pizza|tiefkühl|schokolade|kekse|chips|lebensmittel')],
];

/** Shopping unless the words say doing or remembering. */
export function guessNoteKind(text: string): NoteKind {
  if (BUY.test(text)) return 'einkauf';
  if (REMEMBER.test(text)) return 'merken';
  return 'einkauf';
}

/** The section of the shop; null for things to remember. */
export function guessNoteCategory(text: string, kind: NoteKind): NoteCategory | null {
  if (kind !== 'einkauf') return null;
  for (const [category, re] of CATEGORIES) if (re.test(text)) return category;
  return 'sonstiges';
}
