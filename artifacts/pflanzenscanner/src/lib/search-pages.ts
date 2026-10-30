import type { ModuleId } from "@workspace/api-client-react";

/** Suche: the app's own pages, found by name and a few everyday words (docs/suche.md). */
export interface AppPage {
  title: string;
  hint: string;
  href: string;
  module?: ModuleId;
  words: string;
}

export const APP_PAGES: AppPage[] = [
  { title: "Hof", hint: "Startseite mit Wetter und Dashboard", href: "/", words: "start dashboard wetter übersicht" },
  { title: "Meine Pflanzen", hint: "Deine Scans und Sammlung", href: "/meine-pflanzen", module: "my-plants", words: "sammlung zimmer balkon scans filter pilze" },
  { title: "Pflegeplan", hint: "Gießen, Düngen, Umtopfen", href: "/aufgaben", module: "care-plan", words: "gießen düngen umtopfen erinnerung pflege" },
  { title: "Bio & Bewirtschaftung", hint: "Konventionell, naturnah oder bio – umschaltbar", href: "/team", words: "bio biologisch ökologisch öko ökolandbau naturnah nachhaltig konventionell bewirtschaftung demeter bioland naturland kontrollstelle umstellung naturheilverfahren homöopathie wartezeit doppelt behandlungen biofütterung fütterung herkunft region platz stallfläche auslauf quadratmeter nachhaltigkeit steckbrief nistkasten blühstreifen hecke regenwasser kompost" },
  { title: "Pflanzendoc", hint: "Kranke Pflanze per Foto", href: "/pflanzendoc", module: "plant-doc", words: "krank diagnose blätter flecken doktor" },
  { title: "Schädlinge & Nützlinge", hint: "Erkennen und bekämpfen", href: "/schaedlinge", module: "pests", words: "läuse schnecken insekten bekämpfen schädling" },
  { title: "Nützlinge fördern", hint: "Wer gegen welches Problem hilft", href: "/schaedlinge?tab=nuetzlinge", module: "pests", words: "nützling nützlinge marienkäfer florfliege ohrwurm insektenhotel nisthilfe tränke igel regenwurm boden blühstreifen wildbienen" },
  { title: "Lexikon", hint: "Alle Arten, auch Pilze", href: "/lexikon", module: "lexicon", words: "archiv arten pilze giftig" },
  { title: "Kräuter-Hexe", hint: "Heilkräuter-Ratgeber", href: "/kraeuter-hexe", module: "herb-witch", words: "heilkräuter tee beschwerden hausmittel hund ziege schaf rind schwein alpaka esel pferd" },
  { title: "Beet-Architekt", hint: "Beete planen", href: "/beete", module: "garden", words: "garten hochbeet mischkultur gemüse düngung dünger mist kompost gründüngung" },
  { title: "Gartenkalender", hint: "Säen, pflanzen, ernten", href: "/beete/kalender", module: "garden", words: "aussaat ernte kalender" },
  { title: "Saatgut", hint: "Vorrat und Keimtest", href: "/beete/saatgut", module: "garden", words: "samen tüten keimen bio-saatgut samenfest" },
  { title: "Ernte-Auswertung", hint: "Was sich gelohnt hat", href: "/beete/ernte", module: "garden", words: "ernte kilo ertrag beet sorte vergleich wirtschaftlichkeit kosten lohnt stunden" },
  { title: "Grow", hint: "Eigenanbau ab 18", href: "/grow", module: "grow", words: "zelt anbau" },
  { title: "Tiere", hint: "Alle Tier-Module", href: "/farm", module: "animals", words: "hof module bio-check ampel" },
  { title: "Meine Tiere", hint: "Bestand, Gesundheit, Gewicht", href: "/farm/tiere", module: "animals", words: "hühner ziegen schafe alpakas tierarzt bestand liste gruppen krankenakte behandlung wartezeit" },
  { title: "Stall-Aufgaben", hint: "Füttern, Ausmisten", href: "/farm/aufgaben", module: "farm-tasks", words: "füttern futter ausmisten eier stall erinnerung" },
  { title: "Alltagsnotizen", hint: "Einkaufsliste und Merkzettel", href: "/notizen", words: "notiz notizen einkauf einkaufsliste einkaufen kaufen merken merkzettel liste supermarkt drogerie haushalt teilen familie sprechen" },
  { title: "Hof-Aufgaben", hint: "Gemeinsame Liste für heute", href: "/hof-aufgaben", module: "farm-tasks", words: "aufgaben liste heute todo abhaken team teilen kommentar teich garten hof erledigen sprechen" },
  { title: "Futterplaner", hint: "Rationen und Bedarf", href: "/farm/futter", module: "feed", words: "futter ration heu etikett" },
  { title: "Futtervorrat", hint: "Was noch da ist", href: "/farm/futter/vorrat", module: "feed", words: "vorrat nachkaufen säcke" },
  { title: "Zucht", hint: "Trächtigkeit und Brut", href: "/farm/zucht", module: "breeding", words: "trächtig brut küken lämmer geburt" },
  { title: "Arzneimittel", hint: "Vorrat und Wartezeiten", href: "/farm/arzneimittel", module: "medicines", words: "medizin wartezeit wurmkur impfung" },
  { title: "Pflichten & Tierseuchen", hint: "Anmeldung, Kasse, Stallpflicht", href: "/farm/pflichten", module: "duties", words: "meldung tierseuchenkasse vetamt geflügelpest bundesland stichtag" },
  { title: "Ertrag & Bilanz", hint: "Eier, Milch, Kosten", href: "/farm/ertrag", module: "yields", words: "eier milch ernte kosten verkauf bio-erzeugnisse" },
  { title: "Am Stall", hint: "Eier und Aufgaben mit einem Tipp", href: "/farm/stall", module: "farm-tasks", words: "schnell erfassen eier gefüttert getränkt wasser offline" },
  { title: "Vorratskammer", hint: "Eingekochtes, Eingefrorenes, Haltbarkeit", href: "/vorrat", module: "pantry", words: "vorrat keller eingekocht einmachen eingefroren gefriertruhe marmelade gläser haltbarkeit" },
  { title: "Weide", hint: "Flächen, Umtreiben, Ruhezeit", href: "/farm/weide", module: "pasture", words: "weide weiden koppel umtreiben auftreiben weidetagebuch fläche" },
  { title: "Bienen", hint: "Stockkarte, Varroa, Honig", href: "/farm/bienen", module: "bees", words: "imker imkerei volk völker beute varroa honig schwarm königin" },
  { title: "Legeleistung", hint: "Eier je Henne, Verlauf", href: "/farm/legeleistung", module: "yields", words: "eier hennen hühner legen mauser" },
  { title: "Wildtier-Radar", hint: "Kameras und Alarm", href: "/farm/kameras", module: "wildlife", words: "fuchs marder kamera alarm" },
  { title: "Übergabe", hint: "Für die Vertretung", href: "/farm/uebergabe", module: "handover", words: "urlaub vertretung" },
  { title: "Farm & Team", hint: "Team, Rollen, Kontakte", href: "/team", module: "members", words: "mitglieder vertretung kontakte freigaben tierarzt einladen zugang" },
  { title: "Veterinäramt-Export", hint: "Bestandsliste als PDF", href: "/farm/export", module: "export", words: "pdf veterinäramt liste bio-dokumentation öko-kontrolle kontrollstelle" },
  { title: "Meine Module", hint: "Ein- und ausblenden, Demo-Daten", href: "/module", words: "module demo einrichtung tour" },
  { title: "Hilfe & FAQ", hint: "Alle Module erklärt, häufige Fragen", href: "/hilfe", words: "hilfe faq fragen anleitung erklärung wie geht" },
  { title: "Benachrichtigungen", hint: "Was kommt, Ruhezeit", href: "/mehr#push", words: "push erinnerungen ruhezeit" },
  { title: "Konto", hint: "Name, Passwort, Daten", href: "/mehr#konto", words: "passwort ändern vergessen zurücksetzen löschen konto daten" },
  { title: "Paket & Abo", hint: "Basis, Lite, Premium, kündigen", href: "/abo", words: "premium lite basis abo bezahlen kündigen preis paket ki limit rechnung" },
];

const norm = (s: string) => s.toLocaleLowerCase("de-DE").normalize("NFC");

/** Pages whose title or words contain the query, title hits first; hidden modules left out. */
export function matchPages(query: string, visible: (id: ModuleId) => boolean, limit = 5): AppPage[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const shown = APP_PAGES.filter((p) => !p.module || visible(p.module));
  const byTitle = shown.filter((p) => norm(p.title).includes(q));
  const byWords = shown.filter((p) => !byTitle.includes(p) && (norm(p.words).includes(q) || norm(p.hint).includes(q)));
  return [...byTitle, ...byWords].slice(0, limit);
}
