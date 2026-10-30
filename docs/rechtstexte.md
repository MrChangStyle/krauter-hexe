# Rechtstexte

Schritt 13 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Hier steht, welche Texte es gibt, was davon live ist und was vor dem Start oder vor der Bezahlung noch geprüft werden muss.

**Alle Texte sind Entwürfe und rechtlich zu prüfen** – von einer Anwältin, einem Anwalt oder einem Dienst für Rechtstexte (z. B. IT-Recht Kanzlei, Händlerbund, eRecht24). Diese Doku ist keine Rechtsberatung.

## Live in der App (`pages/rechtliches.tsx`, ohne Anmeldung erreichbar)

| Seite | Pfad | Stand |
|---|---|---|
| Impressum | `/impressum` | Angaben des Betreibers aus `lib/legal.ts` (`OPERATOR`), Kleinunternehmer, Verbraucherstreitbeilegung |
| Datenschutzerklärung | `/datenschutz` | Konto, Fotos, **Hof und Tiere (neu)**, **Wildkameras (neu)**, Region, Push, Meldungen, Feedback, Alltagsnotizen, Technik, Fehler. Dienstleister: Render, Neon, Cloudinary, Google Gemini, Google-Login, Resend, Cloudflare Turnstile, Nominatim, Bright Sky/DWD, OpenStreetMap. Rechte, Aufsichtsbehörde BayLDA |
| Nutzungsbedingungen | `/nutzungsbedingungen` | Angebot, keine Gewähr für KI, **Hinweise zu Gesundheit, Tieren und Pflichten (neu)**, Inhalte, Sperrung, Konto beenden |

Stand der Texte: `LEGAL_VERSION` in `lib/legal.ts` und im Server (`registrationPolicy.ts`). Er wird mit jeder Registrierung gespeichert.

### Am 30.10.2026 geändert (Stand `2026-10-30`)

Abgleich der Datenschutzerklärung mit dem, was die App heute tatsächlich verarbeitet (nach den neuen Modulen seit dem 29.10.):

- **Konto:** Einstellungen ergänzt (Meine Module, Meine Tierarten, Benachrichtigungen, Bio-Empfehlungen).
- **Neu: Rangliste.** Der gewählte Benutzername ist für alle angemeldeten Nutzer sichtbar; ohne Benutzernamen erscheint man nicht.
- **Hof und Tiere:** Weiden mit Umriss auf der Karte, Saatgut, Vorräte, Hof-Aufgaben mit Kommentaren, Bewirtschaftung.
- **Standort statt „Region“:** Der alte Satz „nie die Koordinaten“ war zu eng. Hof, Beet und Grow speichern Postleitzahl oder einen auf etwa 10 km gerundeten Ort (`roundCoord`), die Region nur den Stadtnamen.
- **Neu: Grow.** Altersbestätigung mit Zeitpunkt und Anbau-Daten; Fotos für den KI-Check werden nicht gespeichert.
- **Neu: Spracheingabe.** Die Spracherkennung läuft im Browser, je nach Gerät beim Browser-Anbieter (Google, Apple); die App bekommt nur Text.
- **Neu: Futter-Rezepte.** Nach Freigabe für alle sichtbar, ohne Namen.
- **Push:** Die Nachricht läuft über den Push-Dienst des Browsers; als Dienstleister ergänzt.
- **Gemini:** Liste auf alle KI-Funktionen erweitert (Pflanzendoc, Pflege-Guide, Grow-Diagnose, Futteretiketten, Futter- und Arten-Vorschläge, Garten-Assistent …).
- **Nutzungsbedingungen** (schon in #146): neuer Punkt „Bio“ – Richtwerte, kein Zertifikat, keine Gewähr.
- `LEGAL_VERSION` auf `2026-10-30` (App `lib/legal.ts`, Server `registrationPolicy.ts`).

Nicht aufgenommen, weil noch nicht live: Bezahlung mit Stripe (Entwurf in `docs/recht/datenschutz-zahlung-entwurf.md`; vor dem Einschalten einfügen).

### Am 29.10.2026 geändert

- **Datenschutz:**
  - Neu ist der Punkt **Hof und Tiere**: Was zum Hof gehört, sehen Team, Vertretung und eingeladener Tierarzt je nach Rolle und Freigabe, Vertretung und Tierarzt nur bis zum eingetragenen Tag.
  - Neu ist der Punkt **Wildkameras**: Die Fotos werden gespeichert, ausgewertet und auf Wunsch weitergeleitet. Dazu kommt der Hinweis, keine Menschen zu erfassen.
  - Gemini wertet auch Kamerabilder aus.
  - Die Menüpfade heißen jetzt „Mehr → Konto“ statt „Home → Dein Konto“.
- **Nutzungsbedingungen:** Der neue Abschnitt 3 enthält die Haftungshinweise:
  - Pilze nie allein nach der App essen; Pilzsachverständige, Giftnotruf.
  - Giftpflanzen- und Futterangaben sind Richtwerte.
  - Der Heilkräuter-Ratgeber ist keine Behandlung.
  - Bei Wartezeiten zählen Beipackzettel und Tierarzt.
  - Pflichten und Fristen sind keine Rechtsberatung.

## Entwürfe für die Bezahlung (Schritt 16, nicht live)

- `docs/recht/agb-entwurf.md`: AGB für Lite und Premium. Darin stehen Leistungen, Vertragsschluss, Preise, Laufzeit und Kündigung (Kündigungsbutton § 312k BGB), die Zusage der Testphase, Haftung, Änderungen und Schlussbestimmungen.
- `docs/recht/widerruf-entwurf.md`: Widerrufsbelehrung nach dem gesetzlichen Muster mit Muster-Formular. Offen ist, ob das Abo als digitaler Inhalt (§ 356 Abs. 5 BGB) oder als digitale Dienstleistung gilt.
- `docs/recht/datenschutz-zahlung-entwurf.md`: der Abschnitt Bezahlung für die Datenschutzerklärung, je nach Anbieter (Stripe oder PayPal), mit den Aufbewahrungsfristen.

## Offen

- **Prüfung aller Texte** vor dem öffentlichen Start (Seitenpasswort gelöscht) durch eine Fachperson, danach bei jedem neuen Dienstleister.
- **Monatliche Prüfung** (seit 30.10.2026, geplante Aufgabe am 1. jedes Monats): Datenschutzerklärung gegen den Code, Nutzungsbedingungen, Tierarzneimittel und Wartezeiten, Tierseuchen und Pflichten (Tierseuchenkassen, Meldefristen, Stallpflicht), Bio-Richtwerte (EU-Öko-Verordnung) und KCanG beim Grow. Ergebnis als Pull Request mit klaren Korrekturen, offene Fragen im Bericht. Ersetzt keine anwaltliche Prüfung.
- **Auftragsverarbeitung:** Verträge nach Art. 28 DSGVO mit Render, Neon, Cloudinary, Google, Resend und Cloudflare abschließen bzw. die Online-Bedingungen akzeptieren und ablegen.
- **Verzeichnis der Verarbeitungstätigkeiten** (Art. 30 DSGVO) anlegen.
- **Gemini:** Prüfen, ob die genutzte API-Stufe Eingaben zum Training verwendet. Nur die bezahlte Stufe schließt das aus. Danach den Text anpassen.
- **Bezahlung:** Anbieter wählen, AGB und Widerruf fertigstellen und den Bestellablauf bauen (Button „Zahlungspflichtig bestellen“, Häkchen zum Widerruf, Kündigungsbutton).
- **Umsatzsteuer:** Kleinunternehmerregelung prüfen, sobald Umsätze kommen.
