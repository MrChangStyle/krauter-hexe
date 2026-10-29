# Launch-Plan: Little Farming marktreif machen

Dieser Plan ersetzt den allgemeinen „Audit-Prompt“ und ist auf unsere App zugeschnitten: Render statt Vercel, Neon-Postgres mit eigener Anmeldung statt Supabase, ein Pull Request je Schritt statt eines großen Branches.

**Ziel:**
- Die App einmal komplett prüfen.
- In jedem Modul das ergänzen, was Nutzer erwarten.
- Alles für den öffentlichen Start vorbereiten (Konten, Sicherheit, Homepage, Rechtliches, Bezahlung, Marketing).

Was nur der Betreiber erledigen kann, steht in `docs/TODO-CHANG.md`, größere Entscheidungen in `docs/ENTSCHEIDUNGEN.md`. Den Stand je Modul hält `docs/BESTANDSAUFNAHME.md` fest.

## Arbeitsweise

- Ein Pull Request je Schritt gegen `main`, mit grünem CI. Jeder Schritt ist für sich nutzbar und kann sofort live gehen.
- Definition of Done aus `CLAUDE.md` bei jedem Schritt:
  - Hilfe, Demo-Daten, Doku inklusive `docs/PROJEKT.md`, Suche, Schema, Tests.
  - Ein Browser-Test in Handybreite.
- Keine Secrets im Repo, keine echten Zahlungen. Bestehende Nutzerdaten werden nie gelöscht oder überschrieben. Datenbankänderungen sind nur additiv und idempotent (`schemaUpgrade.ts`).
- Ist ein Weg blockiert, z. B. weil ein Schlüssel fehlt, wird vorgebaut (Schalter per Umgebungsvariable, Fallback), auf `TODO-CHANG.md` gesetzt und weitergearbeitet.

## Reihenfolge

Die Schritte sind nach Wichtigkeit für den Start sortiert. Jeder Schritt ist ein PR. Stand: siehe Häkchen.

### A – Grundlage
1. [x] Bestandsaufnahme, Launch-Plan, Entscheidungen, To-do-Liste für den Betreiber (dieser Schritt)

### B – Konten und Sicherheit (vor dem Start Pflicht)
2. [x] **Passwort vergessen**: Link per E-Mail. Vorbereitet für einen E-Mail-Dienst (Resend), solange kein Schlüssel da ist, setzt der Betreiber das Passwort in der Verwaltung zurück. Dazu Passwort ändern. Die E-Mail-Bestätigung folgt, sobald der Mailversand läuft (`docs/konto.md`).
3. [x] **Datentrennung prüfen**: Ein Test geht automatisch über alle Hof-Endpunkte und zeigt, dass Nicht-Mitglieder nichts sehen, Gäste nichts ändern und Mitarbeiter nur freigegebene Module nutzen. Persönliche Daten (Scans, Notizen, Einstellungen) bleiben beim Konto. Gefundene Lücken werden behoben.
4. [x] **Kostenschutz**: Jede KI-Funktion zählt gegen ein Limit, die Kameras haben echte Tagesgrenzen (`docs/kostenschutz.md`). Ein höheres Premium-Limit kommt mit der Bezahlung (Schritt 16).

### C – Module vervollständigen
5. [x] **Tierarten**:
   - [x] 5a: Gänse, Enten, Puten, Wachteln als eigene Geflügelarten, dazu „Tierart anfragen“ mit Eingang in der Verwaltung (`docs/gefluegel.md`).
   - [x] 5b: Nandus, Esel (`docs/nandu-esel.md`).
6. [x] **Scannen**: Ablauf mit allen Fehlerfällen prüfen. „Meine Scans“ mit Wahl zwischen altem und neuem Foto. Galerie mit einem Bild je Art (bei Pilzen zwei). Ergebnis: Fotowahl und Galerie gab es schon, behoben wurde die Ladeanzeige bei einem KI-Fehler (`docs/scannen.md`).
7. [x] **Hof-Aufgaben und Notizen**: Wochentage („montags und donnerstags“) und Push bei Einträgen auf geteilten Listen sind gebaut. Mehrere Listen kommen bewusst nach dem Start.
8. [x] **Beet-Architekt**: Ergebnis der Planer nachvollziehbar („So rechnet der Assistent“). Boden, Düngung und Hochbeet-Aufbau sind feste Regeln mit Tests, ihre Werte stehen zur fachlichen Prüfung unter „Offen“.
9. [x] **Tiere**: Krankenakte nach Standard (Diagnose, Behandlung, Tierarzt, Wartezeit), Freigabe an den Tierarzt als Gast-Rolle mit Ablaufdatum.
10. [x] Restliche Module nach der Bestandsaufnahme (Lücken aus den „Offen“-Abschnitten, die Nutzer wirklich brauchen). Erledigt: Fristen der Tierseuchenkassen in 6 weiteren Ländern. Was bleibt, ist fachliche Prüfung (Richtwerte in Zucht, Schädlingen, Kräuter-Hexe, Pflichten) und steht in den „Offen“-Abschnitten.

### D – Außenauftritt und Rechtliches
11. [ ] **Namensreste** „Kräuterhexe“ auf „Little Farming“ umstellen: Meta-Tags, Manifest, Login, Scan-Seite, PDF. Nur der Heilkräuter-Ratgeber heißt weiter „Kräuter-Hexe“.
12. [ ] **SEO**: sitemap.xml, Open-Graph-Bilder, strukturierte Daten, Titel und Beschreibungen prüfen.
13. [ ] **Rechtstexte als Entwürfe**: Impressum, Datenschutz (Render, Neon, Cloudinary, Google Gemini, Google-Login, Zahlungsanbieter), AGB, Widerrufsbelehrung, jeweils als „rechtlich zu prüfen“ markiert. Haftungshinweise bei Pilzen, Giftpflanzen und Tierarzneimitteln.
14. [ ] **Homepage und FAQ** an den Endstand angleichen, „Kostenlos starten“.
15. [ ] **Marketing-Plan** (`docs/MARKETING.md`): Zielgruppen, Botschaften, Kanäle, Startfahrplan, Pressetext, Social-Media-Ideen, Messgrößen.

### E – Technik und Bezahlung
16. [ ] **Premium und Bezahlung**: Abo-Status, Upgrade, Kündigung, Webhook. Mit Testdaten und Mock gebaut, es fehlen nur Konto und Schlüssel.
17. [ ] **Qualität**: Lighthouse (Mobil), Bildgrößen, Barrierefreiheit (Kontraste, Beschriftungen, Tastatur), Fehler und Warnungen im Build.
18. [ ] **Analyse**: datenschutzfreundliche Zählung ohne Cookies (eigene Tageszahlen gibt es schon), vorbereitet und abschaltbar.
19. [ ] **App-Stores**: Capacitor-Hülle für Android und iOS vorbereiten, so weit es ohne Store-Konten geht.

### F – Abschluss
20. [ ] `docs/ABSCHLUSSBERICHT.md`: Ampel, was geprüft, behoben und gebaut wurde, Tests, Restpunkte.
