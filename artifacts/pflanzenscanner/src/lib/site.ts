import type { FarmSpecies, ModuleId } from "@workspace/api-client-react";
import { MODULES } from "@/lib/modules";

/**
 * The public homepage (docs/landingpage.md): its pages, the packages with
 * their provisional prices, what each module offers with and without AI, and
 * the Modul-Finder that recommends modules and a package from what someone
 * keeps. Pure data and rules – nothing here changes what the app allows yet.
 */

// ── Pages ─────────────────────────────────────────────────────────────────────

export const SITE_PATHS = {
  start: "/",
  plants: "/funktionen/pflanzen",
  animals: "/funktionen/tiere",
  farm: "/funktionen/hof",
  pricing: "/preise",
  finder: "/modul-finder",
} as const;
export type SitePage = keyof typeof SITE_PATHS;

export const SITE_NAV: { page: SitePage; label: string }[] = [
  { page: "plants", label: "Pflanzen" },
  { page: "animals", label: "Tiere" },
  { page: "farm", label: "Gemeinsam auf dem Hof" },
  { page: "pricing", label: "Preise & Pakete" },
  { page: "finder", label: "Modul-Finder" },
];

export const SITE_TITLES: Record<SitePage, { title: string; description: string }> = {
  start: { title: "Little Farming – Pflanzen, Garten und Tiere in einer App", description: "Pflanzen erkennen, Beete planen, Tiere versorgen, Pflichten im Blick: die App für Balkon, Garten und kleinen Hof." },
  plants: { title: "Pflanzen & Garten – Little Farming", description: "Pflanzen-Scan, Pflegeplan, Pflanzendoc, Beet-Architekt, Vorratskammer und mehr." },
  animals: { title: "Tiere & Hof – Little Farming", description: "Stall-Aufgaben, Futterplaner, Zucht, Arzneimittel, Pflichten, Weide, Bienen und Wildtier-Radar." },
  farm: { title: "Gemeinsam auf dem Hof – Little Farming", description: "Team, Rollen, Urlaubsvertretung, Erinnerungen und Wetterwarnungen für alle, die mit anpacken." },
  pricing: { title: "Preise & Pakete – Little Farming", description: "Basis kostenlos, Lite und Premium mit KI. Welches Paket passt zu dir?" },
  finder: { title: "Modul-Finder – Little Farming", description: "Sag uns, was du hast – Garten, Hühner, Ziegen, Bienen – und wir empfehlen die passenden Module und das Paket." },
};

/** The site page for a path, or null (the app's own routes). */
export function sitePageOf(path: string): SitePage | null {
  const clean = path.replace(/\/$/, "") || "/";
  const hit = (Object.entries(SITE_PATHS) as [SitePage, string][]).find(([page, p]) => page !== "start" && p === clean);
  return hit ? hit[0] : null;
}

// ── Packages ──────────────────────────────────────────────────────────────────

export type PlanId = "basis" | "lite" | "premium";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** € per month and per year; provisional (PRICES_PROVISIONAL). */
  monthly: number;
  yearly: number;
  /** AI requests per day (photo checks, suggestions). */
  aiPerDay: number;
  features: string[];
}

/** The prices are proposals until payment exists (docs/premium.md). */
export const PRICES_PROVISIONAL = true;

/**
 * Testphase (docs/premium.md): everything is open and free, and whoever tests
 * now keeps the app free after the start. Set to false once TEST_PHASE_END is
 * set on the server and the start has happened.
 */
export const TEST_PHASE = true;
export const TEST_PHASE_TITLE = "Testphase: alles offen und kostenlos";
export const TEST_PHASE_TEXT = "Während der Testphase sind alle Funktionen frei – auch die KI, mit einem Tageslimit. Und wer jetzt testet, behält die App auch nach dem Start kostenlos.";

export const PLANS: Plan[] = [
  {
    id: "basis",
    name: "Basis",
    tagline: "Alles ohne KI – für immer kostenlos",
    monthly: 0,
    yearly: 0,
    aiPerDay: 3,
    features: [
      "Alle Module ohne KI: Pflegeplan, Beet-Architekt, Stall-Aufgaben, Futterplaner, Pflichten, Weide, Bienen …",
      "Erinnerungen per Push für dich und dein Team",
      "Unbegrenzt Pflanzen, Beete, Tiere und Teammitglieder",
      "3 KI-Anfragen am Tag zum Kennenlernen",
    ],
  },
  {
    id: "lite",
    name: "Lite",
    tagline: "KI für Pflanzen und Garten",
    monthly: 2.99,
    yearly: 29.9,
    aiPerDay: 15,
    features: [
      "Alles aus Basis",
      "Pflanzen- und Insekten-Scan, Pflanzendoc per Foto",
      "Beet-KI: Foto-Analyse, Beet-Vorschlag, neue Anbaudaten",
      "15 KI-Anfragen am Tag",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Alle KI-Funktionen für Garten und Hof",
    monthly: 5.99,
    yearly: 59.9,
    aiPerDay: 40,
    features: [
      "Alles aus Lite",
      "Hof-KI: Tierart per Foto, Haltungs-Wiki, Futter-Etikett lesen",
      "Bienen-Standort-Check und Wildtier-Radar mit Kamera-KI",
      "Grow-KI-Check (ab 18)",
      "40 KI-Anfragen am Tag",
    ],
  },
];

export const planById = (id: PlanId): Plan => PLANS.find((p) => p.id === id)!;

/** "2,99 €" / "kostenlos" */
export function priceText(eur: number): string {
  return eur === 0 ? "kostenlos" : `${eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** What a yearly plan saves against twelve months, in whole percent. */
export function yearlySaving(plan: Pick<Plan, "monthly" | "yearly">): number {
  return plan.monthly === 0 ? 0 : Math.round((1 - plan.yearly / (plan.monthly * 12)) * 100);
}

// ── Modules ───────────────────────────────────────────────────────────────────

export interface ModuleSite {
  /** What it does, three or four points. */
  points: string[];
  /** The AI part and the package it needs; none: the module has no AI. */
  ai?: { text: string; plan: Exclude<PlanId, "basis"> };
  /** The app's screenshot in public/site/screens (without extension). */
  screen: string;
}

/** Every module of MODULES (not the areas) – a test keeps them in step. */
export const MODULE_SITE: Partial<Record<ModuleId, ModuleSite>> = {
  "my-plants": {
    points: ["Sammlung nach Zimmer, Balkon oder Beet", "Steckbrief mit Licht, Wasser und Giftigkeit für Kinder und Tiere", "Fotos und Notizen je Pflanze"],
    ai: { text: "Art per Foto erkennen", plan: "lite" },
    screen: "meine-pflanzen",
  },
  "care-plan": { points: ["Gießen, Düngen, Umtopfen mit Erinnerung", "Push aufs Handy zur richtigen Zeit", "Wetter-Hinweise bei Frost und Hitze"], screen: "pflegeplan" },
  "plant-doc": { points: ["Mögliche Ursachen für gelbe Blätter, Flecken und Welke", "Pflege-Guide zum Nachlesen"], ai: { text: "Diagnose per Foto", plan: "lite" }, screen: "pflanzendoc" },
  pests: { points: ["Schädlinge und Nützlinge erkennen und filtern", "Biologische und, wenn nötig, chemische Gegenmittel", "Nützlinge fördern: wer gegen Läuse, Schnecken & Co. hilft – mit Anleitung für Insektenhotel, Ohrwurm-Topf und Tränke"], ai: { text: "Insekten-Scan per Foto", plan: "lite" }, screen: "schaedlinge" },
  lexicon: { points: ["Alle gescannten Arten zum Nachschlagen", "Pilze mit deutlichen Giftigkeits-Hinweisen"], screen: "lexikon" },
  "herb-witch": { points: ["Heilkräuter nach Beschwerden", "Traditionelle Anwendung und Zubereitung", "Mit klaren Hinweisen zu Risiken"], screen: "kraeuter" },
  garden: {
    points: ["Beete wie auf Karopapier planen – Mischkultur und Fruchtfolge geprüft", "Aussaat- und Erntekalender nach deinen Frostterminen", "Saatgut-Vorrat mit Keimtest", "Ernte-Auswertung und Wirtschaftlichkeit"],
    ai: { text: "Beet-Foto-Analyse, Beet-Vorschlag, neue Anbaudaten", plan: "lite" },
    screen: "beet",
  },
  pantry: { points: ["Eingekochtes, Eingefrorenes, Getrocknetes und Honig", "Menge, Lagerort und Haltbarkeit", "Direkt aus der Ernte anlegen"], screen: "vorrat" },
  grow: { points: ["Zelt, Pflanzen, Tagebuch – nur ab 18", "Strom- und Kostenrechner", "KCanG-Check"], ai: { text: "KI-Check für Gesundheit und Trichome", plan: "premium" }, screen: "grow" },
  "farm-tasks": { points: ["Füttern, Ausmisten, Eier sammeln als wiederkehrende Aufgaben", "Erinnerung für alle im Team", "Abhaken mit Namen und Uhrzeit"], screen: "stall" },
  feed: {
    points: ["Rationen je Tiergruppe", "Futterbedarf über die Saison, mehr Futter bei Kälte", "Vorrat mit Nachkauf-Erinnerung"],
    ai: { text: "Futter-Etikett per Foto lesen", plan: "premium" },
    screen: "futter",
  },
  breeding: { points: ["Trächtigkeit und Brut mit errechnetem Termin", "Brunstkalender und Absetzen", "Jungtiere direkt im Bestand anlegen"], screen: "zucht" },
  medicines: { points: ["Arzneimittel mit Charge und Ablaufdatum", "Wartezeiten für Milch, Eier und Fleisch", "Behandlungen im Bestandsbuch"], screen: "arzneimittel" },
  duties: { points: ["Was bei Veterinäramt und Tierseuchenkasse zu tun ist", "Stichtag und Frist deines Bundeslandes", "Stallpflicht bei Geflügelpest"], screen: "pflichten" },
  yields: { points: ["Eier, Milch, Fleisch, Wolle und Ernte erfassen", "Ausgaben und Verkäufe dazu", "Legeleistung und Bilanz des Jahres"], screen: "ertrag" },
  pasture: { points: ["Weiden auf der Karte einzeichnen", "Weidetagebuch, Ruhezeit und Umtreiben", "Mähtermine mit Heuwetter und Wurm-Hinweise"], screen: "weide" },
  bees: { points: ["Stockkarte je Volk: Durchsicht, Fütterung, Honig", "Varroa-Behandlung im Bestandsbuch", "Schwarmkontrolle und Einfüttern mit Erinnerung"], ai: { text: "Standort-Check per Foto", plan: "premium" }, screen: "bienen" },
  wildlife: { points: ["Kameras am Stall melden sich per Push", "Auf Wunsch mit Licht oder Sirene"], ai: { text: "Erkennt Fuchs, Marder und Greifvogel", plan: "premium" }, screen: "kameras" },
  handover: { points: ["Vertretung bekommt Zugang für ein paar Tage", "Sieht genau, was heute zu tun ist", "Zugang endet von selbst"], screen: "uebergabe" },
  members: { points: ["Rollen: Admin, Mitarbeiter, Gast", "Freigaben je Modul", "Kontakte vom Tierarzt bis zur Stallhilfe"], screen: "team" },
  export: { points: ["Bestandsliste und Behandlungen als PDF oder Tabelle", "Fertig für das Veterinäramt"], screen: "export" },
};

export const moduleLabel = (id: ModuleId): string => MODULES.find((m) => m.id === id)?.label ?? id;

// ── Tierarten ─────────────────────────────────────────────────────────────────

/**
 * The animals the app knows, for the Tiere page: every farm species but
 * "other", and the bees (their own module). `isNew` marks the latest one.
 */
export const SITE_SPECIES: { key: Exclude<FarmSpecies, "other"> | "bees"; label: string; emoji: string; isNew?: true }[] = [
  { key: "poultry", label: "Hühner & Geflügel", emoji: "🐔" },
  { key: "goat", label: "Ziegen", emoji: "🐐" },
  { key: "sheep", label: "Schafe", emoji: "🐑" },
  { key: "alpaca", label: "Alpakas", emoji: "🦙", isNew: true },
  { key: "cattle", label: "Rinder", emoji: "🐄" },
  { key: "pig", label: "Schweine", emoji: "🐖" },
  { key: "horse", label: "Pferde", emoji: "🐴" },
  { key: "rabbit", label: "Kaninchen", emoji: "🐇" },
  { key: "guineaPig", label: "Meerschweinchen", emoji: "🐹" },
  { key: "bees", label: "Bienen", emoji: "🐝" },
  { key: "dog", label: "Hunde", emoji: "🐕" },
  { key: "cat", label: "Katzen", emoji: "🐈" },
];

/** Prefilled text when a visitor asks for a species the app lacks. */
export const SPECIES_WISH_TEXT = "Bitte ergänzt die Tierart: ";

// ── Modul-Finder ──────────────────────────────────────────────────────────────

export const FINDER_ANIMALS = ["poultry", "goat", "sheep", "alpaca", "cattle", "pig", "horse", "rabbit", "bees", "pets"] as const;
export type FinderAnimal = (typeof FINDER_ANIMALS)[number];
export const FINDER_ANIMAL_LABELS: Record<FinderAnimal, string> = {
  poultry: "Hühner & Geflügel",
  goat: "Ziegen",
  sheep: "Schafe",
  alpaca: "Alpakas",
  cattle: "Rinder",
  pig: "Schweine",
  horse: "Pferde",
  rabbit: "Kaninchen & Meerschweinchen",
  bees: "Bienen",
  pets: "Hund & Katze",
};

export const FINDER_PLANTS = ["indoor", "garden", "herbs", "grow"] as const;
export type FinderPlant = (typeof FINDER_PLANTS)[number];
export const FINDER_PLANT_LABELS: Record<FinderPlant, string> = {
  indoor: "Zimmer- und Balkonpflanzen",
  garden: "Gemüsegarten oder Hochbeet",
  herbs: "Heil- und Küchenkräuter",
  grow: "Eigenanbau (Grow, ab 18)",
};

export type FinderAi = "never" | "sometimes" | "often";
export const FINDER_AI_LABELS: Record<FinderAi, string> = {
  never: "Nein, ohne KI",
  sometimes: "Ab und zu ein Foto prüfen lassen",
  often: "Oft – für Pflanzen, Tiere und Hof",
};

export interface FinderInput {
  plants: FinderPlant[];
  animals: FinderAnimal[];
  /** Pastures or meadows of their own. */
  pasture: boolean;
  /** Family, helpers or a stand-in look after things too. */
  team: boolean;
  /** Eggs, milk, honey or vegetables are counted or sold. */
  sells: boolean;
  ai: FinderAi;
}

export interface Recommendation {
  modules: { id: ModuleId; why: string }[];
  plan: PlanId;
  planWhy: string;
}

/** Animals the veterinary office registers and the Tierseuchenkasse insures. */
const LIVESTOCK: FinderAnimal[] = ["poultry", "goat", "sheep", "alpaca", "cattle", "pig", "horse"];
const GRAZERS: FinderAnimal[] = ["goat", "sheep", "alpaca", "cattle", "horse"];
const BREEDERS: FinderAnimal[] = ["poultry", "goat", "sheep", "alpaca", "cattle", "pig", "horse", "rabbit"];
const PRODUCERS: FinderAnimal[] = ["poultry", "goat", "sheep", "alpaca", "cattle", "bees"];

/**
 * Which modules fit what someone has, each with a reason, and the package.
 * Nobody with chickens and a vegetable garden gets the bees.
 */
export function recommend(input: FinderInput): Recommendation {
  const out = new Map<ModuleId, string>();
  const add = (id: ModuleId, why: string) => {
    if (!out.has(id)) out.set(id, why);
  };
  const has = (a: FinderAnimal) => input.animals.includes(a);
  const any = (list: FinderAnimal[]) => list.some(has);
  const plants = new Set(input.plants);

  if (plants.has("indoor") || plants.has("garden") || plants.has("herbs")) {
    add("my-plants", "Deine Pflanzen an einem Ort, mit Steckbrief");
    add("care-plan", "Erinnert dich ans Gießen, Düngen und Umtopfen");
    add("plant-doc", "Hilft, wenn eine Pflanze kränkelt");
    add("lexicon", "Zum Nachschlagen aller Arten");
  }
  if (plants.has("garden")) {
    add("garden", "Beete planen, Aussaat- und Erntekalender");
    add("pests", "Schädlinge im Gemüse erkennen und behandeln");
    add("pantry", "Für alles, was aus der Ernte eingekocht wird");
  }
  if (plants.has("herbs")) add("herb-witch", "Heilkräuter und ihre Anwendung");
  if (plants.has("grow")) add("grow", "Zelt, Tagebuch und Stromkosten");

  const animals = input.animals.filter((a) => a !== "bees");
  if (animals.length > 0) add("farm-tasks", "Füttern, Ausmisten, Eier sammeln – mit Erinnerung");
  if (any(["poultry", "goat", "sheep", "alpaca", "cattle", "pig", "horse", "rabbit"])) add("feed", "Rationen und Futtervorrat für deine Tiere");
  if (any(LIVESTOCK) || has("bees")) add("duties", "Anmeldung, Tierseuchenkasse und Stichtagsmeldung");
  if (any([...LIVESTOCK, "rabbit", "pets"])) add("medicines", "Arzneimittel, Wartezeiten und Bestandsbuch");
  if (any(LIVESTOCK)) add("export", "Bestandsliste fürs Veterinäramt");
  if (any(BREEDERS)) add("breeding", "Trächtigkeit, Brut und Jungtiere");
  if (any(GRAZERS) || input.pasture) add("pasture", "Weidetagebuch, Ruhezeiten und Mähtermine");
  if (has("bees")) add("bees", "Stockkarte, Varroa und Honig");
  if (any(["poultry", "rabbit"])) add("wildlife", "Warnt, wenn Fuchs oder Marder kommen");
  if (input.sells || any(PRODUCERS) || plants.has("garden")) add("yields", "Was Garten und Tiere bringen – und kosten");
  if (input.team) {
    add("members", "Familie und Helfer mit eigenen Rollen");
    add("handover", "Die Urlaubsvertretung weiß, was zu tun ist");
  }

  // In the order of the app, so the list reads like the app.
  const order = MODULES.map((m) => m.id);
  const modules = [...out.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([id, why]) => ({ id, why }));

  const premiumAi = modules.filter((m) => MODULE_SITE[m.id]?.ai?.plan === "premium");
  let plan: PlanId = "basis";
  let planWhy = "Alles, was du brauchst, geht ohne KI – und kostet nichts.";
  if (input.ai === "sometimes") {
    plan = "lite";
    planWhy = "Für gelegentliche Foto-Checks bei Pflanzen und im Garten reicht Lite.";
  }
  if (input.ai === "often") {
    plan = premiumAi.length > 0 ? "premium" : "lite";
    planWhy =
      plan === "premium"
        ? `Premium bringt die KI auch für ${premiumAi.map((m) => moduleLabel(m.id)).join(", ")}.`
        : "Deine Module brauchen nur die KI für Pflanzen und Garten – Lite genügt.";
  }
  if (input.ai !== "never" && plants.has("grow") && plan !== "premium") {
    plan = "premium";
    planWhy = "Der Grow-KI-Check gehört zu Premium.";
  }
  return { modules, plan, planWhy };
}

// ── From the finder into the app ─────────────────────────────────────────────

/** The finder's choice, kept on the device until the setup wizard takes it. */
export const FINDER_STORAGE_KEY = "lf-finder-modules";

export function saveFinderChoice(modules: ModuleId[]): void {
  try {
    localStorage.setItem(FINDER_STORAGE_KEY, JSON.stringify(modules));
  } catch {
    // Private mode: the wizard simply offers nothing.
  }
}

export function readFinderChoice(): ModuleId[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(FINDER_STORAGE_KEY) ?? "null") as unknown;
    const known = new Set<string>(MODULES.map((m) => m.id));
    return Array.isArray(raw) && raw.length > 0 ? (raw.filter((id) => typeof id === "string" && known.has(id)) as ModuleId[]) : null;
  } catch {
    return null;
  }
}

/** "Meine Module" for a finder choice: everything not chosen is hidden, an area without a chosen module too. */
export function hiddenForChoice(chosen: ModuleId[]): ModuleId[] {
  const keep = new Set(chosen);
  const hidden = MODULES.filter((m) => !m.isArea && !keep.has(m.id)).map((m) => m.id);
  for (const area of MODULES.filter((m) => m.isArea)) {
    if (!MODULES.some((m) => !m.isArea && m.area === area.area && keep.has(m.id))) hidden.push(area.id);
  }
  return hidden;
}
