/**
 * Rechtliches zum Eigenanbau – a plain summary of the Konsumcannabisgesetz as
 * information, not legal advice (docs/grow.md). Update STAND and the points
 * when the law changes.
 */

export const LEGAL_STAND = "Oktober 2026";

export const LEGAL_POINTS: { title: string; text: string; ref: string }[] = [
  {
    title: "Nur für Erwachsene",
    text: "Anbau, Besitz und Konsum sind nur Personen ab 18 Jahren erlaubt.",
    ref: "§§ 2, 3, 9 KCanG",
  },
  {
    title: "Bis zu 3 Pflanzen pro Person",
    text: "Jede volljährige Person darf an ihrem Wohnsitz oder gewöhnlichen Aufenthalt gleichzeitig bis zu drei Cannabispflanzen anbauen.",
    ref: "§ 9 KCanG",
  },
  {
    title: "Vor Kindern und Dritten schützen",
    text: "Pflanzen und Ernte müssen gegen den Zugriff durch Kinder, Jugendliche und Dritte gesichert sein – zum Beispiel in einem abschließbaren Raum oder Schrank.",
    ref: "§ 10 KCanG",
  },
  {
    title: "Wie viel man besitzen darf",
    text: "Am Wohnsitz bis zu 50 g getrocknetes Cannabis pro Person, außerhalb der Wohnung bis zu 25 g.",
    ref: "§ 3 KCanG",
  },
  {
    title: "Nicht weitergeben",
    text: "Cannabis aus dem privaten Eigenanbau darf nicht an andere weitergegeben oder verkauft werden.",
    ref: "§ 9 KCanG",
  },
  {
    title: "Samen",
    text: "Erwachsene dürfen Samen zum Eigenanbau erwerben, auch aus anderen EU-Staaten. Stecklinge und Jungpflanzen gewerblich zu verkaufen ist dagegen nicht erlaubt.",
    ref: "§ 4 KCanG, VG Köln 2025",
  },
  {
    title: "Anbauvereinigungen",
    text: "Wer nicht selbst anbauen will, kann Mitglied einer Anbauvereinigung („Cannabis Social Club“) werden.",
    ref: "§§ 11 ff. KCanG",
  },
  {
    title: "Medizinisches Cannabis",
    text: "Cannabis als Medizin gibt es auf ärztliches Rezept in der Apotheke. Der private Eigenanbau ist kein medizinischer Anbau.",
    ref: "Medizinal-Cannabisgesetz",
  },
  {
    title: "Straßenverkehr",
    text: "Wer mit 3,5 ng/ml THC oder mehr im Blutserum ein Fahrzeug führt, begeht eine Ordnungswidrigkeit. Nach dem Konsum also nicht fahren.",
    ref: "§ 24a StVG",
  },
];

export const LEGAL_SOURCES: { label: string; url: string }[] = [
  { label: "Gesetzestext KCanG (Bundesministerium der Justiz)", url: "https://www.gesetze-im-internet.de/kcang/" },
  { label: "Fragen und Antworten zum Cannabisgesetz (Bundesministerium für Gesundheit)", url: "https://www.bundesgesundheitsministerium.de/themen/cannabis/faq-cannabisgesetz.html" },
];
