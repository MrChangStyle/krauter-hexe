/**
 * Beschwerden-Wortschatz der Kräuter-Hexe (docs/kraeuter-hexe.md): every
 * symptom tag the AI writes is mapped to exactly one fixed name, so the filter
 * never shows the same complaint twice ("Magenkrämpfe", "Magen-Darm-Krampf"
 * and "Verdauungsbeschwerden" are all "Magen-Darm-Beschwerden"). The names
 * are grouped for the filter menu; a name may sit in two groups (e.g.
 * "Hautentzündungen" under Entzündungen and Haut & Wunden).
 *
 * The API server keeps an identical copy in
 * api-server/src/lib/symptomVocabulary.ts – a test there compares both.
 * No imports, so both packages can load it.
 */

/** Ordered rules: the first that matches the lower-cased tag wins. */
export const SYMPTOM_RULES: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  // Inflammations by body part first (stomach before mucosa before skin, so
  // "Magenschleimhautentzündung" and "Schleimhautentzündung" land right),
  // then the general one.
  ["Magen-Darm-Entzündungen", /(magen|darm|gastr|kolitis|colitis|enterit).*(entzünd|itis)|(entzünd).*(magen|darm)/],
  ["Mund- und Rachenentzündungen", /(mund|rachen|hals|mandel|zahnfleisch).*(entzünd|itis)|schleimhaut|angina|tonsill|aphthe|stomatit|gingivit|pharyngit/],
  ["Hautentzündungen", /(haut|ekzem|neurodermit).*(entzünd|itis)|(entzünd).*(haut)|dermatitis/],
  ["Gelenkentzündungen", /(gelenk).*(entzünd)|arthritis|(entzünd).*(gelenk)/],
  ["Blasen- und Harnwegsinfekte", /(harn|blase|niere|zystit|cystit)/],
  ["Augenbeschwerden", /(auge|bindehaut|konjunktiv|augenlid)/],
  ["Husten", /(husten|bronch)/],
  ["Erkältung & Schnupfen", /(erkält|grippe|grippal|schnupfen|nebenhöhle|sinusit|rhinit)/],
  ["Entzündungen (allgemein)", /(entzünd|itis\b)/],
  // Skin and injuries.
  ["Verbrennungen", /(verbrenn|sonnenbrand|brandwund)/],
  ["Wunden", /(wund|schürf|verletz|riss)/],
  ["Insektenstiche", /(insekt|mücke|biene|wespe|bremse)|^stich/],
  ["Prellungen & Verstauchungen", /(prell|bluterguss|blaue? fleck|verstauch|quetsch|zerrung)/],
  ["Hautprobleme", /(haut|ekzem|akne|juck|ausschlag|schuppen|warze|pickel)/],
  // Airways.
  ["Halsschmerzen", /(hals|heiser|schluck)/],
  ["Atemwegsbeschwerden", /(atem|asthma|lunge|kurzatm)/],
  ["Fieber", /fieber/],
  // Stomach and gut.
  ["Durchfall", /(durchfall|diarrh)/],
  ["Verstopfung", /(verstopf|obstipat)/],
  ["Blähungen & Völlegefühl", /(bläh|völle|meteoris|trommelsucht|aufgas)/],
  ["Übelkeit", /(übel|erbrech|brechreiz)/],
  ["Appetitlosigkeit", /(appetit|fressunlust|futterverweiger)/],
  ["Leber- und Gallenbeschwerden", /(leber|galle)/],
  ["Parasiten & Würmer", /(wurm|würmer|parasit|milbe|läuse|laus|floh|flöh|kokzid|zecke)/],
  ["Magen-Darm-Beschwerden", /(magen|darm|verdau|bauch|kolik|sodbrenn|reflux)/],
  // Pain and cramps.
  ["Kopfschmerzen", /(kopf|migräne)/],
  ["Zahn- und Zahnfleischbeschwerden", /(zahn|zähne)/],
  ["Frauenbeschwerden", /(menstru|regel|periode|wechseljahr|frauen|zyklus|pms)/],
  ["Krämpfe", /(krampf|krämpf|spasm)/],
  ["Gelenk- und Muskelschmerzen", /(gelenk|rheum|muskel|glieder|rücken|gicht|arthr|ischias|hexenschuss)/],
  // Nerves and sleep.
  ["Schlafstörungen", /(schlaf)/],
  ["Nervosität & Stress", /(nervosit|nervös|unruh|stress|angst|beruhig|anspannung|reizbar)/],
  ["Abwehrschwäche", /(immun|abwehr|infektanfäll)/],
  ["Erschöpfung", /(müdig|erschöpf|schwäche|kraftlos|antriebslos)/],
  // Other organs.
  ["Herz-Kreislauf-Beschwerden", /(herz|kreislauf|blutdruck|durchblut)/],
  ["Stoffwechselbeschwerden", /(stoffwechsel|blutzucker|diabet|cholesterin)/],
  ["Schmerzen", /schmerz/],
];

/** The filter menu: groups and the names in them, in display order. */
export const SYMPTOM_GROUPS: ReadonlyArray<{ label: string; names: readonly string[] }> = [
  {
    label: "Entzündungen",
    names: ["Entzündungen (allgemein)", "Hautentzündungen", "Mund- und Rachenentzündungen", "Magen-Darm-Entzündungen", "Gelenkentzündungen", "Blasen- und Harnwegsinfekte"],
  },
  { label: "Erkältung & Atemwege", names: ["Erkältung & Schnupfen", "Husten", "Halsschmerzen", "Atemwegsbeschwerden", "Fieber"] },
  {
    label: "Magen & Darm",
    names: ["Magen-Darm-Beschwerden", "Durchfall", "Verstopfung", "Blähungen & Völlegefühl", "Übelkeit", "Appetitlosigkeit", "Leber- und Gallenbeschwerden", "Parasiten & Würmer", "Magen-Darm-Entzündungen"],
  },
  { label: "Haut & Wunden", names: ["Wunden", "Hautprobleme", "Hautentzündungen", "Insektenstiche", "Verbrennungen", "Prellungen & Verstauchungen"] },
  { label: "Schmerzen & Krämpfe", names: ["Schmerzen", "Kopfschmerzen", "Zahn- und Zahnfleischbeschwerden", "Gelenk- und Muskelschmerzen", "Gelenkentzündungen", "Krämpfe", "Frauenbeschwerden"] },
  { label: "Nerven & Schlaf", names: ["Nervosität & Stress", "Schlafstörungen", "Erschöpfung"] },
  { label: "Herz, Kreislauf & mehr", names: ["Herz-Kreislauf-Beschwerden", "Blasen- und Harnwegsinfekte", "Stoffwechselbeschwerden", "Abwehrschwäche", "Augenbeschwerden"] },
];

/** All fixed names. */
export const SYMPTOM_NAMES: readonly string[] = SYMPTOM_RULES.map(([name]) => name);

function sentenceCase(tag: string): string {
  if (tag.length === 0) return tag;
  return tag.charAt(0).toLocaleUpperCase("de-DE") + tag.slice(1).toLocaleLowerCase("de-DE");
}

/**
 * The fixed name for a symptom tag. Tags no rule knows keep their wording in
 * sentence case and land under "Weitere" in the filter.
 */
export function canonicalSymptom(raw: string): string {
  const tag = raw.trim().replace(/\s+/g, " ");
  const lower = tag.toLocaleLowerCase("de-DE");
  // An exact fixed name stays as it is.
  const exact = SYMPTOM_NAMES.find((n) => n.toLocaleLowerCase("de-DE") === lower);
  if (exact) return exact;
  for (const [name, pattern] of SYMPTOM_RULES) if (pattern.test(lower)) return name;
  return sentenceCase(tag);
}
