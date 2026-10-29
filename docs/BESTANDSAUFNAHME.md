# Bestandsaufnahme (Stand 29.10.2026)

Ergebnis der Durchsicht von Code, Doku und den „Offen“-Abschnitten aller Module. Bewertet wird aus Sicht der Nutzer: Kann man mit dem Modul seine Aufgabe erledigen, und was fehlt dafür? Die Schritt-Nummern verweisen auf `docs/LAUNCH-PLAN.md`.

**Legende:** ✅ fertig · 🟡 nutzbar mit Lücken · 🔴 fehlt oder blockiert den Start

## Gesamtbild

- **Umfang:** 2 Bereiche, 21 Module, rund 60 Seiten in der App, 6 Seiten Homepage, über 680 Server- und 480 App-Tests, CI mit echtem Postgres.
- **Stärken:**
  - Sehr breite Fachlichkeit (Pflichten je Bundesland, Wartezeiten, Fruchtfolge, Futterbedarf).
  - Durchgehend Spracheingabe.
  - Offline-Scans.
  - Team mit Rollen und Vertretung.
  - Hilfe und Demo-Daten in jedem Modul.
- **Was den Start blockiert** (🔴):
  - Es gibt keine Bezahlung.
  - Die Rechtstexte sind nicht geprüft.
- **Größte fachliche Lücke:** Geflügel ist nur eine Art. Gänse, Enten und Puten lassen sich nicht getrennt führen.

## Plattform

| Bereich | Stand | Befund | Schritt |
|---|---|---|---|
| Registrierung, Login, Google | ✅ | Seitenpasswort, keine Einladungscodes, die ersten 20 Tester frei, Push an den Betreiber | – |
| Passwort vergessen, E-Mail-Bestätigung | ✅ | Seit Schritt 2: Link per Mail (Resend) oder vom Betreiber, Passwort ändern. E-Mail-Bestätigung folgt mit dem Mailversand | 2 |
| Konto löschen | ✅ | mit allen persönlichen Daten, Hof geht über oder wird gelöscht | – |
| Datentrennung | ✅ | Seit Schritt 3 prüfen Tests jeden Endpunkt (Hof, Konto, Betreiber, ohne Anmeldung); zwei Lücken bei Wartungs-Endpunkten behoben (`docs/datentrennung.md`) | 3 |
| KI-Kosten | ✅ | Seit Schritt 4 zählt jede KI-Funktion (vorher liefen Pflanzendoc, Pflege-Guide und der erste Scan-Blick ohne Limit), Kameras mit echten Tagesgrenzen. Ein Premium-Limit kommt mit Schritt 16 | 4, 16 |
| Bezahlung | 🔴 | Testphase und Tester-Status gebaut, kein Zahlungsanbieter | 16 |
| PWA, Offline, Updates | ✅ | installierbar, Scan-Warteschlange, Updates ohne Bestätigen, App-Stand | – |
| Fehlerüberwachung, Betrieb | ✅ | Fehlergruppen, Push an den Betreiber, Tageszahlen, Statusmeldung | – |
| Sicherung | ✅ | nächtlich verschlüsselt per GitHub Actions | – |
| Homepage | ✅ | Start, Pflanzen, Tiere, Hof, Preise, Modul-Finder, Szenen | 14 |
| Rechtstexte | 🟡 | Impressum, Datenschutz und Nutzungsbedingungen vorhanden, aber ungeprüft. AGB für Bezahlung und Widerruf fehlen | 13 |
| SEO | 🟡 | Titel und Beschreibung je Seite, robots.txt. Es fehlen sitemap.xml, OG-Bilder und strukturierte Daten | 12 |
| Namensreste „Kräuterhexe“ | 🟡 | Meta-Beschreibung, Manifest, Login-Untertitel, Scan-Überschrift, PDF-Fußzeile, Futter-KI-Texte | 11 |
| App-Stores | 🔴 | keine native Hülle | 19 |

## Pflanzen

| Modul | Stand | Befund | Schritt |
|---|---|---|---|
| Scannen (Pflanze, Pilz, Insekt) | ✅ | Warteschlange offline, Pilze nur mit 2 Fotos essbar. Die Galerie zeigt das bessere Foto, Doppelte werden nach botanischem Namen zusammengeführt. Fehlerfälle sind in einem Durchgang zu prüfen | 6 |
| Meine Pflanzen | 🟡 | Sammlung je Konto mit Ort. Bei erneutem Scan fehlt die Wahl zwischen altem und neuem Foto | 6 |
| Pflegeplan | ✅ | Aufgaben, Erinnerungen, wetterabhängig | – |
| Pflanzendoc | ✅ | Diagnose und Pflege-Guide | – |
| Schädlinge & Nützlinge | 🟡 | bio und chemisch. Richtwerte noch fachlich zu prüfen, seltene Arten werden nicht erkannt | 10 |
| Lexikon | ✅ | alle Arten mit Pilzen | – |
| Kräuter-Hexe | 🟡 | Ratgeber vorhanden, Zuordnungen fachlich zu prüfen | 10 |
| Beet-Architekt | ✅ | Raster, Mischkultur, Fruchtfolge, Kalender, Frost, KI-Vorschlag mit Küche/Futter, Assistent, Hochbeet. Die Rechnung des Planers soll nachvollziehbarer werden | 8 |
| Saatgut | ✅ | Vorrat, Keimfähigkeit. Tauschbörse offen (später) | – |
| Ernte & Wirtschaftlichkeit | ✅ | Ladenwert, Kosten, Stundenlohn. Kosten je Kultur fehlen (später) | – |
| Vorratskammer | ✅ | Haltbarkeit, aus der Ernte übernehmen | – |
| Grow | ✅ | ab 18, KI-Check Premium, Recht | – |

## Tiere

| Modul | Stand | Befund | Schritt |
|---|---|---|---|
| Meine Tiere | 🟡 | Tiergruppen, Einzeltiere, Gewicht, Gesundheitsakte. **Geflügel ist eine einzige Art**. Gänse, Enten, Puten und Wachteln brauchen eigene Werte (Futter, Brutdauer, Wetter). Nandus und Esel fehlen. Wer eine Art wünscht, kann das nur als Feedback schicken | 5 |
| Gesundheitsakte | 🟡 | Einträge, Erinnerungen, Arzneimittel mit Wartezeit. Zu prüfen ist, ob Diagnose, Verordnung, Dosis und Zeitraum vollständig sind, dazu eine Freigabe an den Tierarzt | 9 |
| Hof- & Stall-Aufgaben | 🟡 | gemeinsame Liste, KI-Plan aus Sprache. Es fehlen Wochentage („montags und donnerstags“) und Fotos an Kommentaren | 7 |
| Futterplaner | ✅ | Rationen, Bedarf, Vorrat, Wetter | – |
| Zucht | ✅ | Trächtigkeit, Brut, Brunst. Tage fachlich zu prüfen | 10 |
| Arzneimittel | ✅ | Charge, Wartezeit, Ablauf | – |
| Pflichten | 🟡 | je Bundesland. Fehlende Fristen in 7 Ländern, fachliche Prüfung durch ein Veterinäramt empfohlen | 10 |
| Ertrag & Legeleistung | ✅ | Eier, Milch, Kosten, Preise | – |
| Weide | ✅ | Karte, Tagebuch, Ruhezeit, Mähtermine | – |
| Bienen | ✅ | Stockkarte, Varroa, Honig, Standort-Check | – |
| Wildtier-Radar | ✅ | Kameras, Alarm | – |
| Übergabe, Farm & Team | ✅ | Rollen, Freigaben, Vertretung, „Wähle deine Farm“ | – |
| Veterinäramt-Export | ✅ | PDF | – |

## Für alle Bereiche

| Funktion | Stand | Befund | Schritt |
|---|---|---|---|
| Hof-Dashboard | ✅ | Wetter, Kacheln, Widgets, Hof wählen | – |
| Alltagsnotizen | 🟡 | KI-Liste jetzt mit Zeitgrenze und minimalem Nachdenken, im Betrieb zu bestätigen. Es fehlen ein Push bei geteilten Listen und mehrere Listen | 7 |
| Spracheingabe | ✅ | Halten zum Sprechen, Fließtext, gesprochene Satzzeichen | – |
| Benachrichtigungen | ✅ | Themen, Ruhezeit | – |
| Suche, Hilfe, Demo, Onboarding, Feedback | ✅ | – | – |

## Was bewusst nicht vor dem Start kommt

- Tauschbörse für Saatgut, mehrere Notizlisten, Kosten je Kultur. Das sind gute Ideen, für den Start aber nicht nötig.
- Native Apps in den Stores: Die Web-App ist installierbar. Die Store-Fassung folgt nach dem Web-Start (Schritt 19 bereitet sie vor).
