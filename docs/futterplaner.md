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
2. **Etikett per KI (Premium) (UMGESETZT):** Foto des Etiketts → analytische Bestandteile und
   Zusatzstoffe, der Nutzer bestätigt die Werte. Nicht lesbare Werte bleiben leer; die Tierart vom
   Etikett speist die Warnung bei artfremdem Futter; Kokzidiostatika (Monensin & Co.) außerhalb
   von Geflügel geben eine nicht wegklickbare Warnung (für Pferde tödlich).
3. **Fütterungsplan (UMGESETZT):** Anpassung nach Jahreszeit (Grünfutter im Sommer, Heu und
   Lagerfutter im Winter, Zusatzbedarf bei Kälte), Erinnerungen über die Stall-Aufgaben,
   Futterumstellung schrittweise über mehrere Tage. Umgesetzt als Ration „ganzjährig“, „Sommer“
   (April–Oktober) oder „Winter“ (November–März) je Tier oder Gruppe; die passende gilt. Wechsel
   der Futtermittel und der Übergang zur nächsten Jahreszeit laufen in vier Stufen (25/50/75/100 %)
   über 7 Tage (Geflügel, Schwein), 10 (Kaninchen, Meerschweinchen) oder 14 (Wiederkäuer, Pferd);
   der Saisonwechsel beginnt so, dass er am 1. April bzw. 1. November fertig ist. Feste Hinweise
   zur Jahreszeit (Frost, Wasser, Grünfutter, Weide und Hufrehe). „Erinnern“ legt tägliche
   Stall-Aufgaben „Füttern“ je Fütterungszeit an. Kälte wird über die Jahreszeit berücksichtigt;
   echte Frostwarnungen aus der Wettervorhersage kommen mit dem Wetter-Ausbau.
4. **Vorrat und Kosten (Premium) (UMGESETZT):** Sackgröße und Kaufdatum → wann nachkaufen;
   Wintervorrat-Rechner (Heu und Lagerfutter bis zum Frühjahr, an den Garten-Assistenten); Kosten
   pro Tier und Monat. Umgesetzt als Seite „Vorrat & Kosten“: Bestand je Futtermittel (gezählt
   oder gekauft), Rest heute = Bestand − Tagesverbrauch der geltenden Rationen seit dem Tag;
   „bald leer“ ab 14 Tagen, nachkaufen 7 Tage vor leer. Preis je kg aus dem letzten Einkauf.
   Wintervorrat 1. November bis 31. März mit den Winterrationen (sonst ganzjährig), abzüglich
   dessen, was bei Winterbeginn noch da ist; Heu auch in Kleinballen (15 kg). Möhren, Futterrüben
   und Kürbis aus den Winterrationen ersetzen im Garten-Assistenten den Faustwert fürs
   Lagerfutter. Push „Futter nachkaufen“ um 07:30 an Admins und Betreuer – je Futtermittel am
   Nachkauf-Tag und am Tag, bevor es leer ist (nicht täglich).
5. **Tipps und Rezepte (UMGESETZT):** geprüfte Rezepte mit Admin-Freigabe (z. B. fermentiertes
   Futter für Hühner mit Hygieneregeln), Keimfutter, Jahreskalender der Futterpflanzen aus dem
   Garten. Umgesetzt als Seite „Tipps & Rezepte“: vier mitgelieferte Rezepte (fermentiertes
   Hühnerfutter, Keimfutter für Hühner, Keimhafer für Kaninchen/Meerschweinchen, Wiesenkräuter),
   jeweils mit Hygieneregeln – wie die Richtwerte vor dem Start von einer Fachperson prüfen lassen.
   Eingereichte Rezepte sieht nur der Absender, bis der App-Inhaber sie in „Mehr“ freigibt; feste
   Regeln markieren ihm Küchenreste, tierische Produkte, Eier/Eierschalen und für Tiere giftige
   Zutaten (höchstens 5 offene je Person). Futterkalender: je Monat die Futterpflanzen der
   Tierarten auf dem Hof, die erntereif sind – was dieses Jahr in den Beeten steht zuerst, der
   Rest als Vorschlag; Möhren, Rote Bete und Kürbis im Winter aus dem Lager.

## Nachträge

- Meerschweinchen, Erhaltung: Rohfaser-Richtwert 15–28 % statt 12–20 % – Heu zur freien Aufnahme
  ist richtig und soll nicht als „zu viel“ erscheinen (wie beim Kaninchen, auch Blinddarmverdauer).
