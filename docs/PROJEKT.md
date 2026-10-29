# Little Farming – Projektbeschreibung

Diese Datei beschreibt die ganze App auf einen Blick: Zweck, Aufbau, Module, Technik, Betrieb und Arbeitsweise. Die Einzelheiten stehen in den Moduldateien unter `docs/` und in `replit.md` (Architektur-Entscheidungen, englisch). **Diese Datei wird bei jeder Änderung an der App mitgepflegt** (siehe „Pflege dieser Datei“ ganz unten).

Stand: 28.10.2026

---

## 1. Was ist Little Farming?

Little Farming ist eine deutschsprachige Web-App (PWA, „mobile first“) für Menschen mit Garten, Hof und Tieren – vom Balkon bis zum kleinen Hof mit Hühnern, Ziegen und Bienen. Sie verbindet zwei Bereiche:

- **Pflanzen**: Pflanzen, Pilze und Insekten per Foto bestimmen (KI), Sammlung, Pflegeplan, Pflanzendoc, Schädlinge, Beete planen, Saatgut, Ernte, Vorrat.
- **Tiere** („Meine Farm“): Tierbestand, Gesundheit, Futter, Zucht, Arzneimittel, Pflichten, Ertrag, Weide, Bienen, Team und Vertretung.

Der **Hof** ist die Startseite und führt beides zusammen: Wetter, Hof-Aufgaben, Alltagsnotizen und Widgets.

- **Adresse:** littlefarming.de (Homepage unter `/`, die App unter `/app`).
- **Betreiber:** Little Farming, Kontakt info@littlefarming.de.
- **Phase:** Testphase. Die Seite ist mit einem Seitenpasswort geschützt, nur eingeladene Tester kommen hinein. Alles ist kostenlos.
- **Herkunft:** Die App hieß früher „Kräuterhexe“ (Pflanzenscanner). Paket-, Datenbank- und Dienstnamen tragen den alten Namen noch absichtlich (`replit.md`). „Kräuter-Hexe“ heißt heute nur noch der Heilkräuter-Ratgeber.

## 2. Bedienung und Navigation

Untere Leiste: **Hof – Pflanzen – Scannen (Mitte) – Tiere – Mehr**.

| Reiter | Inhalt |
|---|---|
| **Hof** (`/`) | Begrüßung, „Wähle deine Farm“, Wetter, Pflanzenretter-Rangliste, Kacheln Hof-Aufgaben und Alltagsnotizen, Widgets (`docs/dashboard.md`) |
| **Pflanzen** (`/pflanzen`) | Meine Pflanzen, Pflegeplan, Pflanzendoc, Schädlinge & Nützlinge, Lexikon, Kräuter-Hexe, Beet-Architekt, Vorratskammer, Grow |
| **Scannen** (Mitte) | Pflanze, Pilz (2 Fotos), Insekt; Fotos warten offline in einer Warteschlange |
| **Tiere** (`/farm`) | Meine Tiere und alle Tier-Module als Kacheln |
| **Mehr** (`/mehr`) | Konto, Meine Module, Hilfe, Benachrichtigungen, Darstellung, Datenexport, Verwaltung (nur Betreiber), App-Stand |

Jedes Konto blendet Bereiche und Module unter Mehr → „Meine Module“ selbst ein und aus (`docs/module.md`). Beim ersten Start helfen ein Einrichtungsassistent und eine App-Tour (`docs/onboarding.md`).

## 3. Module

### Pflanzen

| Modul | Zweck | Doku |
|---|---|---|
| Scannen & Meine Pflanzen | KI bestimmt Pflanze, Pilz, Insekt; Sammlung mit Steckbrief, Giftigkeit, Standort | `replit.md`, `docs/kraeuter-hexe.md` |
| Pflegeplan | Gieß- und Düngeaufgaben mit Erinnerung, wetterabhängig | `docs/pflege-wetter.md` |
| Pflanzendoc | Diagnose kranker Pflanzen, Pflege-Guide | `docs/schaedlinge.md` |
| Schädlinge & Nützlinge | Hilfe bio und chemisch, Nützlinge | `docs/schaedlinge.md` |
| Lexikon | alle Arten, auch Pilze | – |
| Kräuter-Hexe | Heilkräuter-Ratgeber (KI) | `docs/kraeuter-hexe.md` |
| Beet-Architekt | Beete im 30-cm-Raster, Mischkultur, Fruchtfolge, Gartenkalender, Frostwarnung, KI-Beet-Vorschlag mit Anteil Küche/Tierfutter, Garten-Assistent, Hochbeet-Begleiter | `docs/beet-architekt.md` |
| Saatgut | Saatgut-Vorrat, Keimfähigkeit | `docs/saatgut.md` |
| Ernte & Wirtschaftlichkeit | Ernten, Ladenwert, Kosten, Stundenlohn des Gartens | `docs/ernte-auswertung.md`, `docs/garten-wirtschaftlichkeit.md` |
| Vorratskammer | Eingekochtes, Eingefrorenes, Honig mit Haltbarkeit | `docs/vorratskammer.md` |
| Grow | Eigenanbau ab 18, KI-Check (Premium) | `docs/grow.md` |

### Tiere

| Modul | Zweck | Doku |
|---|---|---|
| Meine Tiere | Bestand, Tiergruppen, Gesundheitsakte, Gewicht | `docs/meine-farm-app.md`, `docs/gesundheit-erinnerung.md` |
| Hof- & Stall-Aufgaben | gemeinsame Aufgabenliste, wiederkehrend, Kommentare, KI-Aufgabenplan aus Sprache | `docs/hof-aufgaben.md`, `docs/stall.md` |
| Futterplaner | Rationen, Bedarf, Futtervorrat, Futter-Tipps | `docs/futterplaner.md` |
| Zucht | Trächtigkeit, Brut, Brunstzyklus, Jungtiere | `docs/zucht.md` |
| Arzneimittel | Vorrat, Charge, Wartezeit | `docs/meine-farm-app.md` |
| Pflichten & Tierseuchen | Anmeldung, Tierseuchenkasse, Stallpflicht je Bundesland | `docs/pflichten.md` |
| Ertrag & Bilanz, Legeleistung | Eier, Milch, Ernte, Kosten, Preise | `docs/ertrag.md`, `docs/legeleistung.md` |
| Weide | Flächen auf der Karte, Weidetagebuch, Ruhezeit, Mähtermine | `docs/weide.md` |
| Bienen | Stockkarte, Durchsicht, Varroa, Honig, Standort-Check | `docs/bienen.md` |
| Alpaka | Besonderheiten der Alpakahaltung | `docs/alpaka.md` |
| Gänse, Enten, Puten, Wachteln | eigene Geflügelarten mit Futter, Brut, Pflichten, Wetter; „Tierart anfragen“ | `docs/gefluegel.md` |
| Wildtier-Radar | Wildkameras, Raubtier-Alarm | `docs/meine-farm-app.md` |
| Übergabe | Vertretung für ein paar Tage | `docs/team.md` |
| Farm & Team | Mitglieder, Rollen, Modul-Freigaben, Kontakte | `docs/team.md` |
| Veterinäramt-Export | Bestandsliste und Medizin als PDF | `docs/datenexport.md` |

### Für alle Bereiche

| Funktion | Zweck | Doku |
|---|---|---|
| Hof-Dashboard | Startseite mit Widgets, „Wähle deine Farm“ | `docs/dashboard.md` |
| Alltagsnotizen | Einkaufsliste und Merkzettel, teilbar, KI sortiert Gesprochenes | `docs/alltagsnotizen.md` |
| Spracheingabe | Halten & sprechen in allen Textfeldern, gesprochene Satzzeichen | `docs/spracheingabe.md` |
| Wetter & Unwetter | DWD-Vorhersage und -Warnungen je Hof | `docs/wetter.md` |
| Benachrichtigungen | Push nach Themen, Ruhezeit; Betreiber-Push (Feedback, Fehler, neue Tester) | `docs/benachrichtigungen.md` |
| Suche | Seiten und Inhalte durchsuchen | `docs/suche.md` |
| Hilfe & FAQ | Einführung je Modul, `/hilfe` | `docs/hilfe.md` |
| Feedback | Feedback-Blase in der App, Formular auf der Homepage | `docs/feedback.md` |
| Demo-Daten | Beispiel-Hof zum Ausprobieren | `docs/demo.md` |
| Datenexport & -sicherung | Daten herunterladen, nächtliche DB-Sicherung | `docs/datenexport.md`, `docs/datensicherung.md` |
| Homepage | Landingpage, Preise, Rechtstexte, Seitenpasswort | `docs/landingpage.md` |

## 4. Konten, Zugang und Rollen

- **Seitenpasswort** (`SITE_PASSWORD`): Solange es gesetzt ist, zeigt die ganze Seite (Homepage, App, API) erst nach Eingabe des Passworts etwas. Das Passwort ist die Einladung für Tester. Zum öffentlichen Start wird es gelöscht.
- **Registrierung:** E-Mail und Passwort oder Google, dazu die Zustimmung zu Datenschutz und Nutzungsbedingungen. **Es gibt keinen Einladungscode.**
- **Freischaltung:** Die ersten `FREE_TESTER_SLOTS` Konten (Standard 20, der Betreiber zählt nicht, bestehende Konten zählen mit) starten sofort. Danach wartet ein neues Konto auf die Freischaltung unter Verwaltung → Benutzer. Der Betreiber bekommt bei jeder Anmeldung einen Push.
- **Betreiber:** Das erste Konto wird Betreiber (Owner). Es sieht die Verwaltung (Betrieb, Feedback, Moderation, Entwürfe, Premium, Benutzer, Aufräumen) und hat kein KI-Limit.
- **Höfe und Rollen:** Jedes Konto bekommt einen eigenen Hof („Meine Farm“) und kann weitere anlegen. Auf einem Hof gibt es die Rollen Admin, Mitarbeiter (caretaker) und Gast, dazu Modul-Freigaben und Vertretungen mit Enddatum (`docs/team.md`). Geteilte Höfe stehen unter „Wähle deine Farm“.
- **Passwort vergessen und ändern** (`docs/konto.md`):
  - „Passwort vergessen?“ auf der Anmeldeseite schickt einen Einmal-Link per Mail, sobald `RESEND_API_KEY` gesetzt ist.
  - Bis dahin bekommt der Betreiber einen Push und gibt einen „Passwort-Link“ aus Verwaltung → Benutzer weiter.
  - Passwort ändern geht unter Mehr → Konto.
  - Ein neues Passwort meldet alle anderen Geräte ab.
- **Datentrennung** (`docs/datentrennung.md`): Automatische Tests gehen jeden Endpunkt durch und zeigen:
  - Fremde sehen keinen Hof und kein fremdes Konto.
  - Gäste ändern nichts.
  - Ohne Freigabe kommt man an kein Modul.
  - Ohne Anmeldung antworten nur die öffentlichen Endpunkte.
- **Konto löschen:** in der App, mit allen persönlichen Daten. Ein Hof geht an ein anderes Mitglied über oder wird gelöscht.
- **Bremsen:** Konten je Anschluss (5 pro Stunde), Konten je Tag (`REGISTRATION_DAILY_CAP`, nur bei offener Registrierung), optional Cloudflare Turnstile, Login-Sperre nach 10 Fehlversuchen.

## 5. KI

- **Anbieter:** Google Gemini über die Generative Language API (`@google/genai`), mit dem Schlüssel des Betreibers (`GEMINI_API_KEY`).
- **Modelle:**
  - Fotos: zuerst `gemini-flash-lite-latest`, dann `gemini-flash-latest`.
  - Text: zuerst `gemini-flash-latest`, dann `gemini-flash-lite-latest`.
  - Die Modelle werden in einer Kette mit Wiederholung nacheinander versucht (`runModelChain` in `lib/plantIdentification.ts`).
- **Listen aus Sprache** (Alltagsnotizen, Hof-Aufgabenplan):
  - Antwort mit minimalem Nachdenken (`quick`).
  - Zeitgrenzen: höchstens 25 s insgesamt, 12 s je Modell; die App wartet höchstens 30 s.
  - Ohne KI teilt die App den Text selbst auf und zeigt den Grund.
- **Grundsatz:** Die KI berät, feste Regeln entscheiden.
  - Giftigkeit geht im Zweifel auf „giftig“.
  - Pilze gelten nur mit zwei Fotos und sicherer Bestimmung als essbar.
  - Beet-Vorschläge laufen durch die Mischkultur- und Fruchtfolgeregeln.
- **Kosten:**
  - Tageslimit je Konto (15 Scans; Farm, Garten und Grow mit eigenen Zählern).
  - App-weites Tagesbudget (`SCAN_DAILY_BUDGET`).
  - Pflanzendoc, Pflege-Guide und der erste Blick des Universal-Scans zählen mit. Wildkameras haben Tagesgrenzen je Kamera und je Hof (`docs/kostenschutz.md`).
  - Ein fehlgeschlagener Versuch wird zurückgebucht.
  - Für den Betreiber zeigt die App bei einem KI-Fehler die technische Ursache.

## 6. Premium und Testphase

Premium sind die Funktionen, die im Betrieb Geld kosten, vor allem KI (`docs/premium.md`).

- **Testphase:** Alle haben alles. Konten, die bis zum Ende der Testphase angelegt werden, bleiben dauerhaft kostenlos („Tester“).
- **Ende der Testphase:** Env `TEST_PHASE_END`.
- **Bezahlung:** noch nicht angebunden.

## 7. Technik

**Monorepo** (pnpm workspaces, Node.js 24, TypeScript 5.9):

| Ordner | Inhalt |
|---|---|
| `artifacts/pflanzenscanner` | App und Homepage: React, Vite, wouter, TanStack Query, Tailwind, PWA (vite-plugin-pwa, Service Worker mit Push) |
| `artifacts/api-server` | API: Express 5, als `dist/index.mjs` gebaut (esbuild); liefert im Betrieb auch die App aus (`SERVE_WEB_CLIENT`) |
| `artifacts/mockup-sandbox` | Spielwiese für Entwürfe |
| `lib/db` | Drizzle-Schema (Postgres) |
| `lib/api-spec` | `openapi.yaml`, die Schnittstelle |
| `lib/api-client-react`, `lib/api-zod` | aus OpenAPI erzeugt (Orval): React-Hooks und Zod-Schemas |

- **Schnittstelle:**
  1. Neue Endpunkte zuerst in `openapi.yaml` eintragen.
  2. Dann `pnpm --filter @workspace/api-spec run codegen`.
  3. Der Server prüft jede Anfrage mit den erzeugten Zod-Schemas.
- **Datenbank:**
  - PostgreSQL, im Betrieb bei Neon (`NEON_DATABASE_URL`).
  - Schemaänderungen kommen ins Drizzle-Schema und zusätzlich als idempotentes SQL in `*SchemaStatements.ts` bzw. `schemaUpgrade.ts`. Das läuft beim Start und hebt auch bestehende Datenbanken an.
- **Anmeldung:**
  - E-Mail und Passwort (scrypt), JWT im HttpOnly-Cookie.
  - Google per OAuth mit PKCE.
- **Bilder:** Scan-Fotos liegen bei Cloudinary (`CLOUDINARY_URL`).
- **Push und Cron:**
  - Web-Push. Den VAPID-Schlüssel erzeugt der Server beim ersten Start und legt ihn in der Datenbank ab.
  - Ein externer Cron ruft jede Minute `POST /api/cron/trigger-notifications` auf. Er schickt Erinnerungen, die Frostwarnung und Wetter-Pushes.
- **Offline:**
  - Scans warten in IndexedDB und werden später gesendet.
  - Stall-Aufgaben und Eier gehen auch offline.
  - Der Service Worker hält die App vor.
- **App-Updates:**
  - Die App sucht beim Zurückkommen, wenn das Gerät wieder online ist, und alle 15 Minuten nach einer neuen Version.
  - Sie installiert die neue Version selbst, aber nie, während jemand tippt.
  - Danach meldet sie „App aktualisiert“. Den Stand zeigt Mehr → „App-Stand“.
- **Fehlerüberwachung:** Server- und App-Fehler landen gruppiert in der eigenen Datenbank, zu sehen unter Verwaltung → Betrieb. Der Betreiber bekommt dazu einen Push.

## 8. Betrieb

- **Hosting:** Render, Dienst „Little Farming“ (`render.yaml`).
  - Jeder Merge nach `main` wird automatisch ausgespielt.
  - Ob ein Deploy durchlief, zeigt GitHub unter „Deployments“.
- **Domain:** littlefarming.de, Render-Adresse `kraeuter-hexe.onrender.com`. Alte Adressen leitet der Umzugshelfer weiter (`LEGACY_ORIGINS`).
- **Sicherung:** GitHub Actions sichert die Datenbank jede Nacht verschlüsselt (`db-backup.yml`, `docs/datensicherung.md`).
- **CI:** GitHub Actions für Typecheck, Tests (Integrationstests gegen ein eigenes Postgres im Job, seit #108), Build und Codegen-Prüfung (`ci.yml`, `codegen.yml`).

**Umgebungsvariablen** (Werte nur in Render, nie im Repo):

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `NEON_DATABASE_URL` / `DATABASE_URL` | ja | Datenbank |
| `JWT_SECRET` | ja | Schlüssel für das Login-Cookie |
| `GEMINI_API_KEY` | ja | KI |
| `CLOUDINARY_URL` | ja | Foto-Speicher |
| `CRON_SECRET` | ja | Schutz des Cron-Aufrufs |
| `DELETE_PASSWORD` | für Wartung | Löschen und Wartung von Pflanzen-Einträgen; ohne ihn sind diese Endpunkte gesperrt |
| `SITE_PASSWORD` | Testphase | Seitenpasswort |
| `FREE_TESTER_SLOTS` | nein | freie Tester-Plätze (Standard 20) |
| `OPEN_REGISTRATION` | nein | `true` = jedes neue Konto sofort frei |
| `REGISTRATION_DAILY_CAP` | nein | neue Konten je Tag bei offener Registrierung |
| `SCAN_DAILY_BUDGET` | nein | KI-Anfragen je Tag für die ganze App |
| `TEST_PHASE_END` | nein | letzter Tag der Testphase |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | nein | „Mit Google anmelden“ |
| `PUBLIC_BASE_URL` | bei Google und Mail | öffentliche Adresse |
| `RESEND_API_KEY` / `MAIL_FROM` | nein | Mailversand (Passwort vergessen); ohne Schlüssel gibt der Betreiber den Link weiter |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | nein | Bot-Schutz bei der Registrierung |
| `LEGACY_ORIGINS` | nein | alte Adressen für den Umzug |
| `TRUST_PROXY_HOPS` | nein | Proxys vor dem Server (Standard 1) |
| `CLOUDINARY_FOLDER` | nein | Ordner bei Cloudinary |

## 9. Entwicklung

- **Befehle:**
  - `pnpm run typecheck` prüft alle Pakete.
  - `pnpm --filter @workspace/api-server run dev` startet die API.
  - `pnpm --filter @workspace/pflanzenscanner run dev` startet die App.
  - `BASE_PATH=/ NODE_ENV=production pnpm run build:server` baut App und Server für einen Gesamttest.
- **Tests:**
  - Unit-Tests mit Vitest in beiden Paketen.
  - Integrationstests gegen echtes Postgres: nur wenn `TEST_DATABASE_URL` gleich `DATABASE_URL` ist, sie leeren Tabellen.
  - Browser-Tests mit Playwright in Handybreite (390 px).
- **Definition of Done** (`CLAUDE.md`): Zu jedem neuen Modul und Feld gehören
  - Hilfe und FAQ,
  - Demo-Daten,
  - Doku (Moduldatei, `replit.md` und **diese Datei**),
  - Suche,
  - Schema, DDL und OpenAPI,
  - Tests.
- **Arbeitsweise:**
  - Ein Pull Request je Schritt gegen `main`.
  - Texte in App und Doku auf Deutsch, Code-Kommentare englisch.
  - Fachliche Richtwerte als solche kennzeichnen und unter „Offen“ zur Prüfung vermerken.

## 10. Offen und als Nächstes

Der Weg zum öffentlichen Start steht Schritt für Schritt in `docs/LAUNCH-PLAN.md`. Den Stand je Modul hält `docs/BESTANDSAUFNAHME.md` fest, größere Entscheidungen stehen in `docs/ENTSCHEIDUNGEN.md`. Was nur der Betreiber erledigen kann, sammelt `docs/TODO-CHANG.md`.

- **Öffentlicher Start:**
  - Seitenpasswort löschen.
  - Testphase beenden (`TEST_PHASE_END`).
  - Rechtstexte rechtlich prüfen lassen.
  - Bezahlung anbinden.
- **KI-Listen:** mit echten Sprachaufnahmen der Tester nachschärfen (`docs/alltagsnotizen.md`, `docs/hof-aufgaben.md`).
- **Pro Modul:** die „Offen“-Abschnitte in den Moduldateien, Phasenplan in `docs/meine-farm-app.md`.

---

## Pflege dieser Datei

- Bei **jeder** Änderung, die Nutzer sehen oder die den Betrieb betrifft, passt du die passende Stelle hier an. Beispiele: neues Modul oder Feld, neue Umgebungsvariable, geänderter Ablauf bei Anmeldung, KI oder Deploy.
- Ins Änderungsprotokoll kommt eine Zeile mit Datum, Pull Request und dem Kern der Änderung.
- Einzelheiten gehören in die Moduldatei. Hier steht nur, was man für den Überblick braucht.

### Änderungsprotokoll

| Datum | PR | Änderung |
|---|---|---|
| 29.10.2026 | #110 | Gänse, Enten, Puten und Wachteln als eigene Tierarten in allen Tier-Modulen; „Geflügel“ heißt jetzt „Huhn“; „Tierart anfragen“ unter der Tierart-Auswahl |
| 29.10.2026 | #109 | Kostenschutz: Pflanzendoc, Pflege-Guide und erster Blick des Universal-Scans zählen gegen das Tageslimit; Kamera-Tagesgrenze zählt jetzt wirklich (vorher nie erreicht), dazu eine Grenze je Hof |
| 29.10.2026 | #108 | Datentrennung: Tests über alle Hof- und Konto-Endpunkte; Wartungs-Endpunkte nur noch für den angemeldeten Betreiber, Archiv bearbeiten nur angemeldet; CI startet ein eigenes Postgres, die Integrationstests liefen dort vorher gar nicht |
| 29.10.2026 | #107 | Passwort vergessen (Mail über Resend oder Link vom Betreiber), Passwort ändern, neues Passwort meldet andere Geräte ab; Resend in der Datenschutzerklärung |
| 29.10.2026 | #107 | Launch-Plan, Bestandsaufnahme, Entscheidungen und To-do-Liste für den Betreiber |
| 28.10.2026 | #106 | Beet-Vorschlag: Schieberegler Küche/Tierfutter für die KI; diese Projektbeschreibung angelegt |
| 27.10.2026 | #105 | Kein Einladungscode mehr, Seitenpasswort reicht |
| 27.10.2026 | #101–#104 | App-Updates von selbst, App-Stand; KI-Listen mit Zeitgrenzen und minimalem Nachdenken, Grund für „ohne KI“ sichtbar |
| 27.10.2026 | #98 | Erste 20 Tester ohne Freischaltung, Push bei neuer Anmeldung |
| 27.10.2026 | #95–#97 | Hof wählen, Sprechen bis zum Loslassen, gleiche Kacheln, „Heute erledigt“ zugeklappt |
