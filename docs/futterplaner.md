# Futterplaner

Baustein von Little Farming (Bereich „Tiere“). Grundlage ist das Kapitel „Futterplaner“ der
**Little Farming – Spezifikation v1**. Der Futterplaner gleicht das tatsächliche Futter eines
Tieres oder einer Gruppe mit dem Bedarf der Art ab, zeigt Lücken und gibt einen Fütterungsplan
nach Jahreszeit und Lebensphase. Er nutzt das Tier-Modul, die Pflanzen-Datenbank und den
Beet-Architekten. Gebaut wird additiv in diesem Repo, jeder Schritt als eigener Pull Request.

## Entscheidungen

Aus der Spezifikation v1:
- **Berechnung nach festen Regeln**, die KI liest nur Etiketten und erklärt.
- **Bedarfswerte** je Art und Lebensphase (Wachstum, Legeperiode, Mauser, Trächtigkeit,
  Säugezeit, Erhaltung, Winter) als geprüfte Daten; Ampel pro Nährstoff (ausreichend, knapp,
  zu viel) mit Vorschlägen zum Ausgleich.
- **Nicht wegklickbare Warnungen:** giftige Pflanzen für die Art (Pflanzen-Datenbank),
  artfremdes Mineralfutter (z. B. Kupfer beim Schaf), laufende Wartezeit aus der Krankenakte.
- **Rechtlicher Hinweis:** Küchen- und Speiseabfälle dürfen nach VO (EG) 1069/2009 nicht an
  Nutztiere verfüttert werden; die App schlägt keine Küchenreste vor und weist darauf hin.
- Kostenlos: Futter manuell, Futtermittel-Liste, Bedarfsabgleich, Warnungen, Grundplan.
  Premium: Etikett per KI, KI-Erklärungen, Jahreskalender, Wintervorrat-Rechner, Kosten.

Für den Bau festgelegt:
- Nährwerte werden **auf die Trockenmasse** gerechnet (Futtermittel mit sehr verschiedenem
  Wassergehalt – Gras, Möhren, Körner – werden so vergleichbar). Etiketten geben Werte „wie
  gefüttert“ an; die App rechnet sie mit der Trockenmasse um (Standard 88 % bei Trockenfutter).
- Bedarfs- und Futterwerte sind **Richtwerte** aus der üblichen Fachliteratur (DLG-Futterwert-
  tabellen, GfE-Empfehlungen, Haltungsratgeber) für ein typisches Tier der Art. **Vor dem
  öffentlichen Start von einer Fachperson (Tierärztin/Tierernährung) prüfen lassen.** Die App
  zeigt sie als „Richtwerte“.
- Katzen und Hunde bekommen Alleinfutter nach Herstellerangabe – dafür keine Rationsrechnung.

## Schritte

1. **Fundament (UMGESETZT):** Futtermittel-Liste mit Durchschnittswerten, eigene Futtermittel (Werte vom
   Etikett), Ration je Tier oder Gruppe mit Lebensphase und Fütterungszeiten; Abgleich mit dem
   Bedarf (Menge, Rohprotein, Rohfaser, Calcium, Phosphor, Kupfer beim Schaf) mit Ampel und
   Ausgleichs-Tipps; feste Warnungen; Wasserbedarf; Hinweis zu Küchenabfällen.
2. **Etikett per KI (Premium):** Foto des Etiketts → analytische Bestandteile und Zusatzstoffe,
   der Nutzer bestätigt die Werte.
3. **Fütterungsplan:** Anpassung nach Jahreszeit (Grünfutter im Sommer, Heu und Lagerfutter im
   Winter, Zusatzbedarf bei Kälte), Erinnerungen über die Stall-Aufgaben, Futterumstellung
   schrittweise über mehrere Tage.
4. **Vorrat und Kosten (Premium):** Sackgröße und Kaufdatum → wann nachkaufen; Wintervorrat-
   Rechner (Heu und Lagerfutter bis zum Frühjahr, an den Garten-Assistenten); Kosten pro Tier
   und Monat.
5. **Tipps und Rezepte:** geprüfte Rezepte mit Admin-Freigabe (z. B. fermentiertes Futter für
   Hühner mit Hygieneregeln), Keimfutter, Jahreskalender der Futterpflanzen aus dem Garten.
