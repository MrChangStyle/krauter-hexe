/**
 * Nützlinge-Ratgeber (docs/schaedlinge.md): which beneficial helps against
 * which garden problem, and what to do so it settles in the garden. Fixed
 * content, no AI. Numbers are Richtwerte (marked in the texts) and listed
 * under „Offen“ in the docs for a professional review.
 */

export type MeasureId =
  | "no-poison"
  | "flowers"
  | "insect-hotel"
  | "earwig-pot"
  | "water"
  | "wild-corner"
  | "hedgehog"
  | "nest-box"
  | "pond"
  | "mulch"
  | "buy";

export type BeneficialId =
  | "ladybird"
  | "lacewing"
  | "hoverfly"
  | "earwig"
  | "parasitic-wasp"
  | "predatory-mite"
  | "ground-beetle"
  | "hedgehog"
  | "toad"
  | "birds"
  | "nematodes"
  | "earthworm"
  | "wild-bees";

export type ProblemId = "aphids" | "spider-mites" | "slugs" | "caterpillars" | "fungus-gnats" | "whitefly" | "grubs" | "soil" | "pollination";

export interface Measure {
  id: MeasureId;
  title: string;
  /** One line: what it is good for. */
  short: string;
  steps: string[];
  /** When to do it. */
  season: string;
}

export interface Beneficial {
  id: BeneficialId;
  name: string;
  /** What it does in the garden. */
  helps: string;
  /** A number to picture it – a Richtwert. */
  fact?: string;
  /** Can be bought from a Nützlings-Versand. */
  buy?: string;
  measures: MeasureId[];
  /** Words in an insect's German name that mean this beneficial. */
  keywords: string[];
}

export interface GardenProblem {
  id: ProblemId;
  title: string;
  hint: string;
  /** What to do first. */
  first: string;
  beneficials: BeneficialId[];
  /** Words in a pest's German name that point to this problem. */
  keywords: string[];
}

export const MEASURES: Record<MeasureId, Measure> = {
  "no-poison": {
    id: "no-poison",
    title: "Auf Gift verzichten",
    short: "Die Grundlage: Spritzmittel und Schneckenkorn treffen die Nützlinge mit.",
    steps: [
      "Keine Insektizide spritzen – auch „biologische“ Mittel wie Pyrethrine oder Neem töten Marienkäfer- und Florfliegenlarven.",
      "Kein Schneckenkorn mit Metaldehyd: Igel, Kröten und Laufkäfer fressen vergiftete Schnecken.",
      "Ein paar Läuse aushalten: Nützlinge kommen nur, wo sie Futter finden – meist mit 1–2 Wochen Verzögerung (Richtwert).",
      "Stark befallene Triebe lieber abschneiden oder Läuse mit einem scharfen Wasserstrahl abspritzen.",
    ],
    season: "Das ganze Jahr",
  },
  flowers: {
    id: "flowers",
    title: "Blühpflanzen von März bis Oktober",
    short: "Erwachsene Schwebfliegen, Florfliegen und Schlupfwespen leben von Nektar und Pollen – ihre Larven fressen dann die Läuse.",
    steps: [
      "Ungefüllte, möglichst heimische Blüten wählen – gefüllte Sorten haben kaum Nektar.",
      "Doldenblütler für die Kleinen: Dill, Fenchel, Koriander, Wilde Möhre, Schafgarbe.",
      "Lippenblütler und Kräuter blühen lassen: Thymian, Oregano, Salbei, Minze.",
      "Für Lücken im Jahr: Krokusse und Weiden im Frühjahr, Phacelia, Ringelblume, Kornblume im Sommer, Astern und Efeu im Herbst.",
      "Ein Blühstreifen am Beetrand reicht schon – ab etwa 1 m² lohnt es sich (Richtwert).",
    ],
    season: "Säen März–Mai, blühen lassen bis Oktober",
  },
  "insect-hotel": {
    id: "insect-hotel",
    title: "Nisthilfe für Wildbienen (Insektenhotel)",
    short: "Mauerbienen und andere Wildbienen bestäuben Obst und Gemüse – sie brauchen Röhren zum Nisten.",
    steps: [
      "Hartholz (Buche, Eiche, Esche) ins Seitenholz anbohren, nicht ins Stirnholz – sonst reißt es. Bohrungen 3–9 mm, 5–10 cm tief, glatt geschliffen (Richtwert).",
      "Oder hohle Stängel (Schilf, Bambus) hinter dem Knoten abschneiden, die Enden glätten und waagerecht bündeln – hinten geschlossen.",
      "Sonnig aufhängen, Richtung Süd bis Südost, regengeschützt, fest und mindestens 1 m über dem Boden (Richtwert).",
      "Zapfen, Stroh und Holzwolle weglassen – die nutzt kaum eine Biene.",
      "Blüten in der Nähe: Viele Wildbienen fliegen nur wenige hundert Meter weit (Richtwert).",
      "Drei Viertel der Wildbienen nisten im Boden: eine kleine Stelle offenen, sandigen Boden frei lassen.",
    ],
    season: "Bis März aufhängen, im Winter draußen lassen",
  },
  "earwig-pot": {
    id: "earwig-pot",
    title: "Ohrwurm-Topf",
    short: "Ohrwürmer fressen nachts Blattläuse – tagsüber brauchen sie ein Versteck.",
    steps: [
      "Einen Tontopf mit Holzwolle oder Stroh füllen und mit Draht oder einem Netz verschließen.",
      "Kopfüber in Bodennähe hinstellen, bis er bewohnt ist – im Juni schauen.",
      "Dann in den Obstbaum oder an einen Stab ins Beet hängen, mit Kontakt zu Ast oder Stamm, damit die Tiere hinkommen.",
      "Bei Weichobst und Dahlien vorsichtig: Finden sie keine Läuse, knabbern sie auch daran.",
    ],
    season: "Ab Mai aufstellen, im Herbst reinigen",
  },
  water: {
    id: "water",
    title: "Insektentränke",
    short: "Bienen, Schwebfliegen und Vögel brauchen an heißen Tagen Wasser.",
    steps: [
      "Eine flache Schale mit Steinen, Murmeln oder Moos füllen – so landen die Tiere, ohne zu ertrinken.",
      "Regenwasser nehmen und alle 2–3 Tage wechseln, damit keine Mücken brüten (Richtwert).",
      "Halbschattig aufstellen, damit sie nicht zu schnell austrocknet.",
      "Für Vögel und Igel: eine zweite, etwas tiefere Schale am Boden mit Ausstieg.",
    ],
    season: "April bis September",
  },
  "wild-corner": {
    id: "wild-corner",
    title: "Wilde Ecke: Totholz, Steine, Laub",
    short: "Marienkäfer, Laufkäfer, Kröten und viele andere überwintern hier.",
    steps: [
      "In einer ruhigen Ecke Äste, Baumschnitt und ein paar Steine aufschichten.",
      "Laub unter Hecken und in den Beeten liegen lassen.",
      "Hohle Stängel von Stauden über den Winter stehen lassen – darin überwintern Insekten. Erst im April schneiden.",
      "Nicht aufräumen: Je unordentlicher die Ecke, desto besser.",
    ],
    season: "Im Herbst anlegen, bis April in Ruhe lassen",
  },
  hedgehog: {
    id: "hedgehog",
    title: "Igel willkommen heißen",
    short: "Ein Igel frisst nachts Schnecken, Käferlarven und Raupen.",
    steps: [
      "Einen Durchschlupf im Zaun lassen, etwa 13 × 13 cm (Richtwert) – Igel laufen nachts mehrere Gärten ab.",
      "Einen Laubhaufen oder ein Igelhaus an einer ruhigen Stelle.",
      "Mähroboter nur tagsüber fahren lassen.",
      "Kellerschächte und Teiche mit Ausstiegshilfe sichern.",
      "Kein Schneckenkorn – und keine Milch hinstellen, die vertragen Igel nicht.",
    ],
    season: "Das ganze Jahr, Winterquartier ab Oktober",
  },
  "nest-box": {
    id: "nest-box",
    title: "Nistkasten für Meisen",
    short: "Ein Meisenpaar füttert seine Jungen mit tausenden Raupen.",
    steps: [
      "Flugloch 26–28 mm für Blaumeisen, 32 mm für Kohlmeisen (Richtwert).",
      "In 2–3 m Höhe aufhängen (Richtwert), Flugloch nach Osten oder Südosten, weg vom Wetter.",
      "Katzensicher: nicht über einem Ast, auf den eine Katze springen kann.",
      "Im Herbst das alte Nest herausnehmen.",
    ],
    season: "Bis Februar aufhängen, im Oktober reinigen",
  },
  pond: {
    id: "pond",
    title: "Kleine Wasserstelle oder Mini-Teich",
    short: "Kröten, Molche und Libellen brauchen Wasser – und fressen Schnecken und Mücken.",
    steps: [
      "Schon ein eingegrabener Mörtelkübel mit Wasserpflanzen hilft.",
      "Eine flache Seite oder einen Stein als Ausstieg einbauen.",
      "Ohne Fische – sie fressen Laich und Larven.",
      "Daneben Steine und dichte Pflanzen als Versteck.",
    ],
    season: "Anlegen im Frühjahr",
  },
  mulch: {
    id: "mulch",
    title: "Boden bedecken und füttern",
    short: "Regenwürmer und Bodenlebewesen machen den Boden locker und fruchtbar.",
    steps: [
      "Den Boden nie nackt lassen: dünn mit angetrocknetem Rasenschnitt, Laub oder Stroh mulchen.",
      "Kompost oben aufbringen statt tief einzugraben.",
      "Nicht umgraben – mit der Grabegabel nur lockern.",
      "Im Herbst Gründüngung säen, z. B. Phacelia oder Senf.",
    ],
    season: "Das ganze Jahr, mulchen ab Mai",
  },
  buy: {
    id: "buy",
    title: "Nützlinge kaufen",
    short: "Bei starkem Befall oder im Gewächshaus kannst du Nützlinge bestellen und gezielt aussetzen.",
    steps: [
      "Gibt es im Gartenhandel oder beim Nützlings-Versand – meist als Kärtchen, in Tonmineral oder Pulver.",
      "Sofort nach dem Eintreffen ausbringen, nicht lagern.",
      "Auf die Temperatur achten – die meisten brauchen mindestens 12–18 °C (Richtwert, steht auf der Packung).",
      "Vorher und danach nicht spritzen.",
      "Im Freien wandern sie ab: Am besten wirken sie im Gewächshaus, Wintergarten oder an Zimmerpflanzen.",
    ],
    season: "Je nach Art, meist April bis September",
  },
};

export const BENEFICIALS: Record<BeneficialId, Beneficial> = {
  ladybird: {
    id: "ladybird",
    name: "Marienkäfer",
    helps: "Käfer und vor allem die Larven fressen Blattläuse, einige Arten auch Spinnmilben.",
    fact: "Eine Larve frisst bis zur Verpuppung einige hundert Läuse (Richtwert).",
    buy: "Larven des Zweipunkt-Marienkäfers",
    measures: ["no-poison", "wild-corner", "flowers"],
    keywords: ["marienkäfer"],
  },
  lacewing: {
    id: "lacewing",
    name: "Florfliege",
    helps: "Die Larven („Blattlauslöwen“) fressen Blattläuse, Spinnmilben, Thripse und Eier von Schädlingen.",
    fact: "Eine Larve schafft mehrere hundert Läuse (Richtwert).",
    buy: "Florfliegenlarven",
    measures: ["flowers", "no-poison", "wild-corner"],
    keywords: ["florfliege", "blattlauslöwe"],
  },
  hoverfly: {
    id: "hoverfly",
    name: "Schwebfliege",
    helps: "Die Larven fressen Blattläuse, die Fliegen selbst bestäuben Blüten.",
    fact: "Eine Larve frisst einige hundert Läuse (Richtwert).",
    measures: ["flowers", "water", "no-poison"],
    keywords: ["schwebfliege"],
  },
  earwig: {
    id: "earwig",
    name: "Ohrwurm",
    helps: "Jagt nachts Blattläuse, Spinnmilben und Insekteneier – besonders in Obstbäumen.",
    measures: ["earwig-pot", "no-poison"],
    keywords: ["ohrwurm", "ohrenkneifer"],
  },
  "parasitic-wasp": {
    id: "parasitic-wasp",
    name: "Schlupfwespe",
    helps: "Legt ihre Eier in Blattläuse, Raupeneier oder Weiße Fliegen – daraus schlüpfen neue Schlupfwespen. Für Menschen harmlos.",
    buy: "Gegen Weiße Fliege (Encarsia) und Raupen-Eier (Trichogramma)",
    measures: ["flowers", "no-poison", "buy"],
    keywords: ["schlupfwespe", "brackwespe", "erzwespe"],
  },
  "predatory-mite": {
    id: "predatory-mite",
    name: "Raubmilbe",
    helps: "Frisst Spinnmilben und Thripse, Bodenarten auch Trauermückenlarven. Vor allem im Gewächshaus und an Zimmerpflanzen.",
    buy: "Gegen Spinnmilben, Thripse und Trauermücken",
    measures: ["buy", "no-poison", "mulch"],
    keywords: ["raubmilbe"],
  },
  "ground-beetle": {
    id: "ground-beetle",
    name: "Laufkäfer",
    helps: "Jagt nachts am Boden Schnecken und ihre Eier, Raupen und Käferlarven.",
    measures: ["wild-corner", "mulch", "no-poison"],
    keywords: ["laufkäfer", "puppenräuber", "goldschmied"],
  },
  hedgehog: {
    id: "hedgehog",
    name: "Igel",
    helps: "Frisst Schnecken, Käferlarven, Raupen und Engerlinge.",
    measures: ["hedgehog", "wild-corner", "no-poison"],
    keywords: ["igel"],
  },
  toad: {
    id: "toad",
    name: "Erdkröte & Blindschleiche",
    helps: "Fressen Nacktschnecken, Asseln und Insekten.",
    measures: ["pond", "wild-corner", "no-poison"],
    keywords: ["kröte", "blindschleiche", "molch"],
  },
  birds: {
    id: "birds",
    name: "Meisen & andere Singvögel",
    helps: "Sammeln Raupen, Blattläuse und Käfer – vor allem, wenn sie Junge füttern.",
    fact: "Ein Meisenpaar verfüttert in der Brutzeit viele tausend Raupen (Richtwert).",
    measures: ["nest-box", "water", "wild-corner"],
    keywords: ["meise", "vogel", "spatz", "rotkehlchen"],
  },
  nematodes: {
    id: "nematodes",
    name: "Nematoden",
    helps: "Winzige Fadenwürmer, die gezielt Larven befallen: Trauermücken, Dickmaulrüssler, Engerlinge oder Nacktschnecken – je nach Art.",
    buy: "Werden mit dem Gießwasser ausgebracht; Boden feucht und mindestens etwa 12 °C warm (Richtwert)",
    measures: ["buy"],
    keywords: ["nematode", "fadenwurm"],
  },
  earthworm: {
    id: "earthworm",
    name: "Regenwurm & Bodenleben",
    helps: "Regenwürmer, Asseln und Springschwänze machen aus Laub Humus, lockern den Boden und lassen Wasser versickern.",
    measures: ["mulch", "no-poison", "wild-corner"],
    keywords: ["regenwurm", "assel", "springschwanz", "tausendfüßer"],
  },
  "wild-bees": {
    id: "wild-bees",
    name: "Wildbienen & Hummeln",
    helps: "Bestäuben Obst, Beeren, Kürbis und Tomaten – Hummeln fliegen schon bei kühlem Wetter.",
    measures: ["insect-hotel", "flowers", "water", "no-poison"],
    keywords: ["wildbiene", "mauerbiene", "hummel", "sandbiene", "holzbiene", "biene"],
  },
};

export const PROBLEMS: GardenProblem[] = [
  {
    id: "aphids",
    title: "Blattläuse",
    hint: "Rosen, Bohnen, Obst, Kräuter",
    first: "Erst ein paar Tage abwarten und Läuse abspritzen – Marienkäfer, Florfliegen und Schwebfliegen folgen meist von selbst.",
    beneficials: ["ladybird", "lacewing", "hoverfly", "earwig", "parasitic-wasp", "birds"],
    keywords: ["blattlaus", "läuse", "laus", "blutlaus"],
  },
  {
    id: "spider-mites",
    title: "Spinnmilben",
    hint: "Gurken, Bohnen, Zimmerpflanzen bei trockener Luft",
    first: "Luftfeuchte erhöhen und Blätter abbrausen; im Gewächshaus oder Zimmer helfen Raubmilben.",
    beneficials: ["predatory-mite", "ladybird", "lacewing", "earwig"],
    keywords: ["spinnmilbe", "rote spinne", "milbe"],
  },
  {
    id: "slugs",
    title: "Schnecken",
    hint: "Salat, Kohl, Jungpflanzen",
    first: "Abends absammeln und morgens gießen statt abends. Auf Dauer helfen Igel, Kröten und Laufkäfer – und, wenn du welche hältst, Laufenten.",
    beneficials: ["ground-beetle", "hedgehog", "toad", "nematodes"],
    keywords: ["schnecke", "nacktschnecke", "wegschnecke"],
  },
  {
    id: "caterpillars",
    title: "Raupen",
    hint: "Kohlweißling, Buchsbaumzünsler, Frostspanner",
    first: "Eier und Raupen absammeln, Kohl mit Netz abdecken. Meisen räumen Raupen im Frühjahr gründlich ab.",
    beneficials: ["birds", "parasitic-wasp", "ground-beetle", "hedgehog"],
    keywords: ["raupe", "weißling", "zünsler", "frostspanner", "eule", "wickler", "spanner"],
  },
  {
    id: "fungus-gnats",
    title: "Trauermücken",
    hint: "Kleine schwarze Fliegen an Zimmerpflanzen",
    first: "Erde abtrocknen lassen und von unten gießen; gegen die Larven in der Erde helfen Nematoden oder Raubmilben.",
    beneficials: ["nematodes", "predatory-mite"],
    keywords: ["trauermücke"],
  },
  {
    id: "whitefly",
    title: "Weiße Fliege",
    hint: "Tomaten, Kohl, Gewächshaus",
    first: "Gelbtafeln zur Kontrolle aufhängen; im Gewächshaus Schlupfwespen (Encarsia) aussetzen.",
    beneficials: ["parasitic-wasp", "lacewing"],
    keywords: ["weiße fliege", "mottenschildlaus"],
  },
  {
    id: "grubs",
    title: "Engerlinge & Dickmaulrüssler",
    hint: "Fraß an Wurzeln, Buchten im Blattrand",
    first: "Larven im Boden mit Nematoden behandeln, wenn der Boden warm genug ist; Igel und Vögel fressen die Larven auch.",
    beneficials: ["nematodes", "hedgehog", "birds", "ground-beetle"],
    keywords: ["engerling", "dickmaulrüssler", "maikäfer", "junikäfer", "gartenlaubkäfer", "rüssler"],
  },
  {
    id: "soil",
    title: "Boden verbessern",
    hint: "Fester, magerer oder nasser Boden",
    first: "Boden bedeckt halten und Kompost oben auftragen – den Rest machen Regenwürmer und Bodenleben.",
    beneficials: ["earthworm"],
    keywords: [],
  },
  {
    id: "pollination",
    title: "Mehr Ernte durch Bestäubung",
    hint: "Obst, Beeren, Kürbis, Tomaten",
    first: "Von März bis Oktober etwas blühen lassen und Nisthilfen anbieten.",
    beneficials: ["wild-bees", "hoverfly"],
    keywords: [],
  },
];

export function problemById(id: string | null | undefined): GardenProblem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}

function matches(name: string, keywords: string[]): boolean {
  const n = name.toLocaleLowerCase("de");
  return keywords.some((k) => n.includes(k));
}

export function beneficialById(id: string | null | undefined): Beneficial | undefined {
  return id && Object.hasOwn(BENEFICIALS, id) ? BENEFICIALS[id as BeneficialId] : undefined;
}

/** The problems a beneficial helps with. */
export function problemsForBeneficial(id: BeneficialId): GardenProblem[] {
  return PROBLEMS.filter((p) => p.beneficials.includes(id));
}

/** The problems a scanned pest belongs to, from its German name. */
export function problemsForPest(name: string): GardenProblem[] {
  return PROBLEMS.filter((p) => matches(name, p.keywords));
}

/** The beneficial a scanned insect is, from its German name. */
export function beneficialForInsect(name: string): Beneficial | undefined {
  return Object.values(BENEFICIALS).find((b) => matches(name, b.keywords));
}

/**
 * What to do for the given beneficials – the measures that help the most of
 * them first, "no poison" always at the top.
 */
export function measuresFor(ids: BeneficialId[]): Measure[] {
  const count = new Map<MeasureId, number>();
  for (const id of ids) for (const m of BENEFICIALS[id].measures) count.set(m, (count.get(m) ?? 0) + 1);
  const order = Object.keys(MEASURES) as MeasureId[];
  return [...count.keys()]
    .sort((a, b) => Number(b === "no-poison") - Number(a === "no-poison") || count.get(b)! - count.get(a)! || order.indexOf(a) - order.indexOf(b))
    .map((m) => MEASURES[m]);
}

// ── Filter for "Meine Insekten" ──────────────────────────────────────────────

export type RelationFilter = "all" | "pest" | "beneficial" | "neutral";

export const RELATION_FILTERS: { id: RelationFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "pest", label: "Schädlinge" },
  { id: "beneficial", label: "Nützlinge" },
  { id: "neutral", label: "Neutral" },
];

export function filterByRelation<T extends { relationStatus: string }>(items: T[], filter: RelationFilter): T[] {
  return filter === "all" ? items : items.filter((i) => i.relationStatus === filter);
}

export function relationCounts(items: { relationStatus: string }[]): Record<RelationFilter, number> {
  const counts: Record<RelationFilter, number> = { all: items.length, pest: 0, beneficial: 0, neutral: 0 };
  for (const i of items) if (i.relationStatus in counts && i.relationStatus !== "all") counts[i.relationStatus as RelationFilter]++;
  return counts;
}
