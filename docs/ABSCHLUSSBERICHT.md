# Abschlussbericht: Little Farming vor dem öffentlichen Start

Stand 29.10.2026, Schritt 20 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Der Bericht fasst zusammen:

- was in den Schritten 1–19 geprüft, behoben und gebaut wurde,
- wie es getestet ist,
- was vor und nach dem Start noch offen ist.

Den Stand je Modul hält `docs/BESTANDSAUFNAHME.md`. Was nur der Betreiber erledigen kann, steht in `docs/TODO-CHANG.md`.

**Legende:** 🟢 startklar · 🟡 gebaut, wartet auf Betreiber oder fachliche Prüfung · 🔴 blockiert den Start

## Ampel

| Bereich | Ampel | Kurz |
|---|---|---|
| Konten und Anmeldung | 🟢 | Passwort vergessen und ändern; Mailversand über Resend vorbereitet, bis dahin Link vom Betreiber |
| Datentrennung | 🟢 | Tests über alle Hof- und Konto-Endpunkte, zwei Lücken behoben |
| KI-Kosten | 🟢 | Jede KI-Funktion zählt gegen ein Tageslimit je Paket, die Kameras haben Tagesgrenzen |
| Module Pflanzen | 🟢 | Alle nutzbar; Richtwerte in Schädlingen und Kräuter-Hexe fachlich zu prüfen |
| Module Tiere | 🟢 | 11 Tierarten, Krankenakte nach Standard, Tierarzt als Gast |
| Pflichten je Bundesland | 🟡 | 12 von 16 Ländern mit geprüfter Frist der Tierseuchenkasse; Berlin, Bremen, Hamburg und Schleswig-Holstein fehlen |
| Homepage, SEO, FAQ | 🟢 | Endstand, eine HTML-Datei je Seite, sitemap.xml, strukturierte Daten |
| Rechtstexte | 🔴 | Entwürfe vollständig, aber rechtlich nicht geprüft. Ohne Prüfung kein öffentlicher Start |
| Bezahlung | 🟡 | Gebaut und mit Testkasse geprüft; es fehlen das Stripe-Konto, die Schlüssel und die geprüften AGB und Widerrufsbelehrung |
| Qualität | 🟢 | Lighthouse Startseite 88 / 100 / 100 / 100, axe ohne Befund auf 23 Seiten |
| Analyse | 🟢 | Besucherzählung ohne Cookies, abschaltbar |
| Marketing | 🟡 | Plan fertig (`docs/MARKETING.md`); Konten, Startdatum und Zitat entscheidet der Betreiber |
| Store-Apps | 🟡 | Capacitor-Hülle vorbereitet; Store-Konten, Bauen auf Geräten und Push in der App fehlen. Für den Start nicht nötig, die Web-App ist installierbar |

**Fazit:** Die App ist technisch startklar. Vor dem öffentlichen Start muss nur noch der Betreiber handeln:

1. Rechtstexte prüfen lassen (🔴).
2. Die Start-Schalter umlegen (`TODO-CHANG.md` Punkt 4).

Die Bezahlung kann auch nach dem Start eingeschaltet werden. Bis dahin sind alle Konten im Basis-Paket bzw. in der Testphase.

## Was geprüft wurde

- **Alle 21 Module** gegen die Frage „Kann man damit seine Aufgabe erledigen?“, dazu die „Offen“-Abschnitte aller Moduldateien (`docs/BESTANDSAUFNAHME.md`).
- **Datentrennung:** Für jeden Endpunkt wurde geprüft:
  - Nicht-Mitglieder sehen nichts.
  - Gäste ändern nichts.
  - Mitarbeiter nutzen nur freigegebene Module.

  Ein Test erzwingt, dass jeder neue Endpunkt dort eingetragen wird (`docs/datentrennung.md`).
- **KI-Aufrufe:** Jeder Aufruf wurde darauf geprüft, ob er gegen ein Limit zählt (`docs/kostenschutz.md`).
- **Scannen:** alle Fehlerfälle von Kamera bis KI-Ausfall (`docs/scannen.md`).
- **Außenauftritt:** Namensreste, Titel, Beschreibungen, Link-Vorschau, Rechtstexte gegen die tatsächlich genutzten Dienste.
- **Qualität:**
  - Lighthouse (Mobil) auf Startseite und App.
  - axe-core auf 23 App-Seiten.
  - Kontraste, Tastatur, Zoomen.
  - Warnungen im Build (`docs/qualitaet.md`).

## Was behoben wurde

| Befund | Behoben in |
|---|---|
| Wartungs-Endpunkte ohne Betreiber-Prüfung, Archiv ohne Anmeldung bearbeitbar | #108 |
| Pflanzendoc, Pflege-Guide und erster Scan-Blick ohne KI-Limit; Kamera-Tagesgrenze wurde nie erreicht | #109 |
| Minutenlange Ladeanzeige bei einem KI-Fehler im Scan | #111 |
| Wartezeit bei mehrtägiger Behandlung zählte ab dem ersten Tag | #113 |
| Stichtage der Tierseuchenkasse in Brandenburg und Sachsen-Anhalt | #114 |
| Namensreste „Kräuterhexe“ in Meta, Manifest, Login, PDF | #115 |
| Datenschutzerklärung ohne Hof, Tiere und Wildkameras | #117 |
| Wackelnde Tests (Reihenfolge der Hof-Mitglieder, Premium-Reste, Zeitmessung in der KI-Kette) | #120, #121 |
| Hauptpaket 2,1 MB, Schriften von Google ohne Wirkung, Zoomen gesperrt, zu schwache Kontraste | #121 |
| Links mit `?ref=` oder `utm_…` öffneten die Anmeldung statt der Homepage | #122 |

## Was gebaut wurde

| Schritt | PR | Ergebnis |
|---|---|---|
| 1 | #107 | Launch-Plan, Bestandsaufnahme, Entscheidungen, To-do für den Betreiber |
| 2 | #107 | Passwort vergessen und ändern, Abmelden anderer Geräte |
| 3 | #108 | Datentrennungs-Tests über alle Endpunkte |
| 4 | #109 | Kostenschutz für alle KI-Funktionen und Kameras |
| 5 | #110, #111 | Gänse, Enten, Puten, Wachteln, Nandus, Esel; „Tierart anfragen“ |
| 6 | #111 | Scan-Fehlerfälle |
| 7 | #112 | Aufgaben an Wochentagen, Push bei geteilten Notizlisten |
| 8 | #112 | „So rechnet der Assistent“ im Beet-Architekten |
| 9 | #113 | Krankenakte mit „Behandlung bis“, Tierarzt einladen (14 Tage, nur Arzneimittel und Export) |
| 10 | #114 | Fristen der Tierseuchenkasse in 6 weiteren Ländern |
| 11 | #115 | Überall „Little Farming“ |
| 12 | #116 | SEO: HTML je Seite, Vorschaubild, sitemap.xml, robots.txt |
| 13 | #117 | Rechtstexte als Entwürfe, AGB und Widerruf |
| 14 | #118 | Häufige Fragen auf der Startseite, Modultexte |
| 15 | #119 | Marketing-Plan |
| 16 | #120 | Pakete Basis/Lite/Premium, „Paket & Abo“, Stripe mit Webhook, Testkasse |
| 17 | #121 | gzip, Seiten einzeln geladen, eigene Schriften, Barrierefreiheit |
| 18 | #122 | Besucherzählung ohne Cookies |
| 19 | #123 | Capacitor-Hülle für Android und iOS |

## Tests

- **Server:**
  - 755 Tests, davon die Integrationstests gegen echtes Postgres.
  - Darin: Datentrennung über alle Endpunkte, Kostenschutz, Bezahlung mit Webhook-Signatur, Demo-Daten aller Module.
- **App:** 502 Tests, darunter Hilfe je Modul, Suche, Paket-Texte, App-Erkennung.
- **Typecheck:** beide Pakete fehlerfrei.
- **CI:** Jeder PR läuft gegen ein eigenes Postgres.
- **Browser in Handybreite (390 px):** In jedem Schritt wurden die geänderten Seiten durchgeklickt, unter anderem:
  - Abo-Bestellung mit Testkasse und Kündigen
  - Tierarzt-Einladung
  - Wochentag-Aufgaben
  - Homepage-FAQ
- **Lighthouse (Mobil):**

  | Seite | Leistung | Barrierefreiheit | Best Practices | SEO |
  |---|---|---|---|---|
  | Startseite | 88 (vorher 48) | 100 | 100 | 100 |

- **axe-core:** 23 App-Seiten ohne Befund.

## Restpunkte

### Vor dem Start (Betreiber, `docs/TODO-CHANG.md`)

1. Rechtstexte und Verträge zur Auftragsverarbeitung prüfen lassen (`docs/rechtstexte.md`).
2. Resend für den Mailversand einrichten (optional; ohne Resend schickt der Betreiber den Link).
3. Start-Schalter umlegen:
   - `SITE_PASSWORD` löschen.
   - `TEST_PHASE_END` setzen.
   - `SCAN_DAILY_BUDGET` prüfen.

### Vor dem Einschalten der Bezahlung

- Stripe-Konto, Produkte, Webhook und Schlüssel einrichten (`docs/bezahlung.md`).
- **Entscheidung:** Welche KI-Funktionen sind nur in Premium? Die Seite „Preise & Pakete“ nennt Hof-KI, Wildtier-Radar-KI und den Bienen-Standort-Check als Premium. Durchgesetzt sind heute nur:
  - das Tageslimit je Paket,
  - der Grow-KI-Check.

  Entweder die Seite oder die App angleichen.

### Fachliche Prüfung (Richtwerte unter „Offen“ der Moduldateien)

- Pflichten je Bundesland: Fristen für Berlin, Bremen, Hamburg und Schleswig-Holstein; Prüfung durch ein Veterinäramt oder eine Tierseuchenkasse.
- Zucht-Tage, Weide-Termine, Schädlings-Richtwerte, Saatgut-Jahre, Zuordnungen der Kräuter-Hexe.
- Boden, Düngung und Hochbeet-Aufbau im Beet-Architekten.
- Tageslimits der Pakete (Basis 3, Lite 15, Premium 40) nach den ersten Wochen an den echten Kosten prüfen.

### Nach dem Start

- Google-Anmeldung auf „In production“ stellen, Search Console und Bing einrichten.
- Store-Apps (`docs/app-stores.md`):
  - Konten anlegen, auf Geräten bauen.
  - Push in der App über Firebase und APNs.
  - Google-Anmeldung über den System-Browser.
  - Bezahlung in der App klären.
- Bewusst später: Tauschbörse für Saatgut, mehrere Notizlisten, Kosten je Kultur, Fotos an Aufgaben-Kommentaren.
