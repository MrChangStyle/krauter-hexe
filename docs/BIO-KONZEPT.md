# Konzept: Bio und Nachhaltigkeit in Little Farming

Stand 30.10.2026. Wunsch eines Testers. Dazu kommt eine Beraterin, die Höfe zu biologischer und nachhaltiger Haltung und Bewirtschaftung berät: Sie will die App testen und gegebenenfalls Landwirten empfehlen.

Dieses Konzept beschreibt, wie das Thema **durchgehend** in die App kommt, statt als eigenes Modul daneben. Wir setzen es in Schritten um, ein Pull Request je Schritt (siehe „Umsetzung“).

## Leitidee

- **Bio ist eine Eigenschaft des Hofs, kein Modul.** Ein Hof legt einmal fest, wie er wirtschaftet. Danach richten sich die Module danach: Empfehlungen, Prüfungen, Wartezeiten, Dokumentation.
- **Niemand wird ausgeschlossen.** Die Stufen „naturnah“ und „Bio“ helfen auch Hobbyhaltern ohne Zertifikat. Wer konventionell wirtschaftet, sieht die App wie heute.
- **Bio ist eine Option, keine Pflicht.** Little Farming wird keine reine Bio-App. Wer kein Bio will, wirtschaftet „konventionell“ – das ist der Standard und lässt alle Empfehlungen wie heute, biologische und mineralische. Wer will, schaltet auf „naturnah“ oder „Bio“ um, und jederzeit wieder zurück. Erst dann nennt die App nur noch Mittel aus dem Ökolandbau.
- **Feste Regeln statt KI**, wo es Vorgaben gibt: Wartezeiten, Behandlungszahl, Platz je Tier, Futteranteile. Die KI bekommt die Stufe nur als Rahmen für ihre Tipps mit.
- **Richtwerte bleiben Richtwerte.** Alle Zahlen unten stammen aus der EU-Öko-Verordnung bzw. den Verbandsrichtlinien. Sie stehen unter „Offen“ zur fachlichen Prüfung, gern durch die Beraterin.

## Die Hof-Einstellung „Bewirtschaftung“

Unter Meine Farm → Hof-Einstellungen, auch im Hof-Einrichten-Assistenten:

| Stufe | Für wen | Was sich ändert |
|---|---|---|
| **Konventionell** (Standard für bestehende Höfe) | wie heute | nichts |
| **Naturnah** | Hobby- und Selbstversorger-Höfe ohne Zertifikat | Tipps nur biologisch, Hinweise zu Nachhaltigkeit und Tierwohl; keine Pflichtprüfungen |
| **Bio nach EU-Öko-Verordnung** | zertifizierte oder umstellende Betriebe | wie naturnah, dazu die Bio-Regeln als Prüfungen: doppelte Wartezeit, Behandlungszahl, Platz, Futter, Saatgut |
| **Bio-Verband** (Bioland, Demeter, Naturland, Biokreis, Gäa …) | Verbandsbetriebe | wie Bio; wo der Verband strenger ist, gilt sein Wert (zweiter Schritt) |

Zusätzlich gibt es diese Felder:

- **Kontrollstelle**, z. B. `DE-ÖKO-006`, und Kontrollnummer. Sie erscheinen in der Bio-Dokumentation.
- **Umstellung seit**: Datum. Die App zeigt das Ende der Umstellungszeit, Richtwert 2 Jahre für Flächen, je Tierart verschieden.

Pflanzen-Module, die am Konto hängen (Scans, Meine Pflanzen, Pflegeplan, Pflanzendoc), übernehmen die Stufe des gewählten Hofs. Wer keinen Hof hat, stellt sie in den Einstellungen ein („Nur biologische Empfehlungen“).

## Was sich je Modul ändert

### Pflanzen

| Modul | Naturnah und Bio | Zusätzlich bei Bio |
|---|---|---|
| **Pflanzendoc / Pflege-Guide** | Nur biologische Düngung und Hausmittel. Die Spalte „chemisch-mineralisch“ entfällt, die KI wird angewiesen, nur im Ökolandbau übliche Mittel zu nennen | Hinweis „im Ökolandbau zugelassen?“ bei jedem genannten Mittel |
| **Schädlinge & Nützlinge** | Nützlinge zuerst, biologische Bekämpfung; neu: Nützlinge **kaufen und ausbringen** (Schlupfwespen, Florfliegen, Nematoden) mit Zeitpunkt | Kupfer-Merker: Richtwert höchstens 4 kg je ha und Jahr im Mittel |
| **Beet-Architekt** | Fruchtfolge mit Leguminosen und Gründüngung bevorzugt, Mischkultur, Mulch; Düngung mit Kompost, Mist, Hornspänen. Neu: **Kreislauf**, d. h. Mist aus dem Stall als Dünger fürs Beet, mit Menge aus dem Tierbestand | Keine mineralischen Stickstoffdünger im Düngeplan |
| **Saatgut** | Feld „samenfest“; Hinweis auf Saatgut-Tausch | Feld **„Bio-Saatgut“**; Warnung bei konventionellem Saatgut (Richtwert: nur mit Ausnahmegenehmigung) |
| **Ernte / Vorratskammer** | – | Erzeugnisse als „Bio“ kennzeichnen (Hofladen, Ertrag) |

### Tiere

| Modul | Naturnah | Bio |
|---|---|---|
| **Krankenakte / Arzneimittel** | Naturheilverfahren als eigene Art (Phytotherapie, Homöopathie, Hausmittel); Hinweis auf Vorbeugung | **Doppelte gesetzliche Wartezeit**, mindestens 48 Stunden, wenn keine angegeben ist. **Zähler** für chemisch-synthetische allopathische Behandlungen je Tier in 12 Monaten: Richtwert höchstens 3, bei Tieren mit weniger als einem Jahr Nutzungsdauer höchstens 1. Darüber verliert das Tier den Bio-Status; die App warnt vorher. Keine vorbeugenden Antibiotika |
| **Futterplaner** | Hinweis auf Weide und Raufutter | Futter mit **Bio-Kennzeichen** (bio / Umstellung / konventionell). Anteile je Tiergruppe: Bio-Anteil, eigenes Futter vom Hof (Richtwert ≥ 70 % bei Wiederkäuern, ≥ 30 % bei Schwein und Geflügel), Raufutter (≥ 60 % der Trockenmasse bei Wiederkäuern). Ampel je Tiergruppe |
| **Stall / Haltung** | Tierwohl-Hinweise je Art (Einstreu, Beschäftigung, Sandbad) | **Platz-Check**: Stallfläche und Auslauf je Tier gegen die Bio-Werte, z. B. Legehennen höchstens 6 je m² Stall und 4 m² Auslauf je Huhn (Richtwerte). Dafür bekommen Ställe ein Flächenfeld |
| **Weide** | Weidetage zählen | Weidegang als Nachweis (Tage im Jahr je Tiergruppe) |
| **Zucht** | Robuste, regionale Rassen als Tipp | Natursprung oder künstliche Besamung erlaubt, keine Hormone zur Brunstsynchronisation (Hinweis in der Brunst-Erfassung) |
| **Ertrag & Legeleistung** | – | Eier, Milch und Fleisch als „Bio“ verbuchen |

### Für alle Bereiche

- **Bio-Check auf dem Hof-Dashboard**: eine Ampel je Bereich (Futter, Platz, Behandlungen, Saatgut, Dünger). Ein Tipp öffnet, was fehlt. Das ist das Herzstück für die Beratung.
- **Bio-Dokumentation**, ein PDF für die Öko-Kontrolle: Tierbestand mit Zu- und Abgängen, Futterzukauf mit Bio-Status, Behandlungen mit doppelter Wartezeit, Auslauf und Weidegang, Saatgut, Dünger. Es baut auf dem vorhandenen Veterinäramt-Export auf.
- **Nachhaltigkeit**, für alle Stufen sichtbar: Nisthilfen, Blühstreifen, Hecken, Regenwasser, Kompost. Eine kleine Liste, abhakbar, als „Hof-Steckbrief“ für die Homepage des Hofs oder den Hofladen.
- **Hilfe & FAQ, Suche, Demo-Hof**: Der Demo-Hof wird ein naturnaher Hof, damit Tester das Thema sofort sehen.

## Die Beraterin: Zugang als „Beratung“ (zurückgestellt)

**Stand 30.10.2026: zurückgestellt.** Erst kommt Bio in die bestehenden Module; der Berater-Zugang folgt in einem zweiten Schritt.

Wie beim Tierarzt (Schritt 9), aber für die Beratung:

- Der Hof lädt per E-Mail ein, Rolle **Gast mit Ablaufdatum** (Richtwert: 30 Tage, verlängerbar).
- Freigegeben sind nur **lesend** Tiere, Futter, Stall, Weide, Arzneimittel, Garten und der Bio-Check. Notizen und Aufgaben bleiben privat.
- Die Beraterin kann **Kommentare/Empfehlungen** an den Bio-Check hängen (zweiter Schritt). Der Hof sieht sie als Aufgabe.
- **Später, für die Vermarktung:** ein Berater-Konto, das mehrere Höfe sieht, z. B. „Meine beratenen Höfe“. Das führt direkt zu einem eigenen Paket (siehe unten).

## Vermarktung

- **Botschaft:** „Little Farming – Garten, Hof und Tiere, natürlich und nachhaltig“. Bio wird zum Profil der App, nicht nur zu einer Funktion.
- **Homepage:** ein Abschnitt „Bio & nachhaltig“ mit Bio-Check, Kreislauf Stall → Beet und Bio-Dokumentation; dazu FAQ-Einträge.
- **Beraterinnen und Berater als Multiplikatoren:** Empfehlungs-Link mit `?ref=…`, den die Besucherzählung aus Schritt 18 schon auswertet. Später gibt es Rabatt für ihre Höfe.
- **Pakete:**
  - Die Grundregeln (Stufe, doppelte Wartezeit, biologische Tipps) gibt es in allen Paketen.
  - Ob Bio-Check, Bio-Dokumentation und später der Berater-Zugang nur in **Premium** kommen, ist noch offen. Bis dahin gibt es alles in allen Paketen.
  - Ein Paket für größere Betriebe („Big Farming“) mit mehreren Beratern, mehreren Höfen und Export für die Kontrollstelle merken wir für später vor (`docs/ENTSCHEIDUNGEN.md`). Jetzt konzentrieren wir uns auf Little Farming.

## Umsetzung in Schritten

Jeder Schritt ist für sich nutzbar und ein PR mit Definition of Done (Hilfe, Demo, Doku, Suche, Schema, Tests, Browser in Handybreite).

| Schritt | Inhalt | Nutzen für |
|---|---|---|
| **B1** ✅ (#127, `docs/bio.md`) | Hof-Einstellung „Bewirtschaftung“ (Stufe, Kontrollstelle, Umstellung); Pflanzendoc, Pflege-Guide und Schädlinge nur biologisch bei naturnah/Bio; Einstellung für Konten ohne Hof | alle |
| **B2** ✅ (#131) | Krankenakte und Arzneimittel: doppelte Wartezeit bei Bio, Behandlungszähler je Tier, Naturheilverfahren | Bio-Tierhalter |
| **B3** ✅ (#132) | Futterplaner: Bio-Kennzeichen am Futter, Anteile und Ampel je Tiergruppe | Bio-Tierhalter |
| **B4** ✅ (#133, Platz-Check; Weidegang folgt) | Stall und Weide: Flächen, Platz-Check, Weidegang | Bio-Tierhalter |
| **B5** | Bio-Check auf dem Dashboard und Bio-Dokumentation (PDF) | Kontrolle, Beratung |
| **B6** | Berater-Zugang (Gast mit Ablauf, lesend) – **zurückgestellt**, kommt nach den übrigen Schritten | Beraterin |
| **B7** | Beet-Architekt und Saatgut: Bio-Saatgut, Gründüngung, Kreislauf Mist → Beet; Erzeugnisse als „Bio“ | Garten |
| **B8** | Nachhaltigkeits-Liste, Demo-Hof naturnah, Homepage „Bio & nachhaltig“, FAQ, Marketing | Vermarktung |

**Reihenfolge:** B1 zuerst, weil alles darauf aufbaut, dann B2–B5, B7 und B8. B6 (Beraterin) ist zurückgestellt.

## Offen (fachlich zu prüfen)

Alle Werte sind **Richtwerte** und vor dem Einbau als Prüfung fachlich abzusichern, am besten durch die Beraterin bzw. eine Öko-Kontrollstelle:

- Doppelte Wartezeit, mindestens 48 Stunden (VO (EU) 2018/848, Anhang II Teil II).
- Behandlungen: höchstens 3 chemisch-synthetische allopathische Behandlungen in 12 Monaten, bzw. 1 bei Tieren mit weniger als einem Jahr Nutzungsdauer. Impfungen und Parasitenbehandlungen zählen nicht.
- Futter: Bio-Anteil, Umstellungsfutter, Anteil vom eigenen Hof bzw. aus der Region (Wiederkäuer 70 %, Schwein und Geflügel 30 %), Raufutter für Wiederkäuer 60 %; Ausnahmen für Eiweißfutter bei Jungtieren.
- Platz je Tierart, Stall und Auslauf: Legehennen, Masthühner, Enten, Gänse, Puten, Schweine, Rinder, Schafe, Ziegen, Pferde; dazu Verbandswerte (Bioland, Demeter, Naturland).
- Umstellungszeiten je Fläche und Tierart.
- Kupfer im Pflanzenschutz (4 kg je ha und Jahr im Mittel über 7 Jahre), zugelassene Pflanzenschutzmittel (Anhang I der VO (EU) 2021/1165).
- Bio-Saatgut: Ausnahmen über die Datenbank OrganicXseeds.
