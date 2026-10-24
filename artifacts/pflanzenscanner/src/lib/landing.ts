import type { ModuleId } from "@workspace/api-client-react";

/**
 * Texts of the landing page (docs/landingpage.md): one sentence per module,
 * longer than the hint in "Meine Module". A test keeps them in step with
 * MODULES, so a new module cannot be missing here.
 */
export const LANDING_TEXT: Partial<Record<ModuleId, string>> = {
  "my-plants": "Pflanze fotografieren, Art erkennen lassen und in deiner Sammlung ablegen – nach Zimmer, Balkon oder Beet sortiert.",
  "care-plan": "Gießen, Düngen, Umtopfen: Die App erinnert dich zur richtigen Zeit, auf Wunsch per Push aufs Handy.",
  "plant-doc": "Gelbe Blätter oder Flecken? Foto machen, mögliche Ursachen erfahren und einen Pflege-Guide bekommen.",
  pests: "Schädlinge und Nützlinge erkennen – mit biologischen und, wenn nötig, chemischen Gegenmitteln.",
  lexicon: "Alle gescannten Arten zum Nachschlagen, inklusive Pilzen mit deutlichen Hinweisen zur Giftigkeit.",
  "herb-witch": "Der Heilkräuter-Ratgeber: Welche Pflanze bei welchen Beschwerden traditionell verwendet wird und wie.",
  garden: "Beete planen, Mischkultur prüfen, Aussaat- und Erntekalender – mit Saatgut-Vorrat und Keimtest.",
  grow: "Eigenanbau für Erwachsene: Zelt, Pflanzen, Tagebuch, Stromkosten. Der KI-Check kommt mit Premium.",
  "farm-tasks": "Füttern, Ausmisten, Eier sammeln: wiederkehrende Aufgaben mit Erinnerung für alle im Team.",
  feed: "Rationen je Tiergruppe, Futterbedarf über die Saison und ein Vorrat, der rechtzeitig Bescheid sagt.",
  breeding: "Trächtigkeit und Brut im Blick: errechneter Termin, Schlupf, Jungtiere direkt im Bestand anlegen.",
  medicines: "Arzneimittel mit Charge und Ablaufdatum, Wartezeiten für Milch, Eier und Fleisch automatisch berechnet.",
  duties: "Tierhaltung anmelden, Tierseuchenkasse, Stallpflicht bei Geflügelpest: was wann zu tun ist.",
  yields: "Eier, Milch und Ernte erfassen, Ausgaben und Verkäufe dazu – und sehen, was der Hof abwirft.",
  pantry: "Was eingekocht, eingefroren oder getrocknet ist – mit Menge, Lagerort und Haltbarkeit, direkt aus der Ernte angelegt. Ein Tipp, wenn ein Glas aus dem Keller geholt wird.",
  bees: "Digitale Stockkarte für jedes Volk: Durchsicht, Fütterung, Varroa-Behandlung mit Bestandsbuch und Honigernte – mit Erinnerung an Schwarmkontrolle und Einfüttern.",
  wildlife: "Kameras am Stall melden Fuchs, Marder und Greifvogel per Push, auf Wunsch mit Licht oder Sirene.",
  handover: "Urlaub? Die Vertretung bekommt für ein paar Tage Zugang und sieht genau, was heute zu tun ist.",
  members: "Team, Vertretung und Rollen verwalten, dazu alle wichtigen Kontakte vom Tierarzt bis zur Stallhilfe.",
  export: "Bestandsliste und Behandlungen als PDF oder Tabelle – fertig für das Veterinäramt.",
};
