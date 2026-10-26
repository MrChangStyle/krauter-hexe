# Homepage, Vorschau-Schutz und Domain

## Homepage

Wer nicht angemeldet ist, sieht zuerst die Homepage. Sie stellt die App vor, mit eigenen Seiten und Menü (`components/site/`, Daten und Regeln in `lib/site.ts`):

| Seite | Adresse | Inhalt |
|---|---|---|
| Start | `/` | Hof-Illustration oder Foto, vier Stärken, die drei Bereiche, Hof-Startseite mit Screenshot, Pakete, drei Schritte |
| Pflanzen | `/funktionen/pflanzen` | Untermenü mit allen Pflanzen-Modulen; je Modul Text, Punkte, KI-Teil mit Paket, Foto oder Screenshot |
| Tiere | `/funktionen/tiere` | „Diese Tiere kennt die App“ (alle Tierarten, die neueste markiert, „Tierart wünschen“), dann dasselbe für alle Tiere-Module |
| Gemeinsam auf dem Hof | `/funktionen/hof` | Hof-Startseite, Team und Rollen, Urlaubsvertretung, Hilfe |
| Preise & Pakete | `/preise` | Basis, Lite, Premium monatlich/jährlich, Vergleichstabelle, Fragen |
| Modul-Finder | `/modul-finder` | Pflanzen, Tiere, Weide, Team, Ertrag und KI auswählen → empfohlene Module mit Grund und Paket |

- **Menü:** oben, auf dem Handy zum Ausklappen; die Unterseiten wechseln ohne Neuladen. Jede Seite setzt Titel und Beschreibung (für Suchmaschinen).
- **Anmelden/Registrieren:** Auf `/` öffnen die Knöpfe das Formular direkt. Von den Unterseiten führen sie zu `/?start=login` bzw. `/?start=register`. Ist Google eingerichtet, steht „Mit Google anmelden“ auf der Startseite. Wer schon angemeldet ist, sieht auf den Unterseiten „Zur App“.
- **Unterseiten für alle:** Sie werden vor der Anmeldung gewählt (`publicPageFor` in `App.tsx`), wie Impressum und Datenschutz.
- **Texte je Modul:** `LANDING_TEXT` (`lib/landing.ts`) und `MODULE_SITE` (`lib/site.ts`). Tests halten beide gleich mit `MODULES`, ein neues Modul fehlt dort also nicht.
- **Modul-Finder** (`recommend`, rein, `lib/site.test.ts`):
  - Er empfiehlt nur, was passt. Wer Hühner und einen Gemüsegarten hat, bekommt keine Bienen und keine Weide.
  - Das Paket folgt aus „KI nutzen?“: nein → Basis, ab und zu → Lite, oft → Premium, wenn ein Modul Hof-KI hat, sonst Lite. Grow mit KI → Premium.
  - „Mit dieser Auswahl starten“ merkt sich die Module auf dem Gerät (`lf-finder-modules`). Der Einrichtungsassistent bietet sie im Schritt „Module“ an: „Diese Auswahl übernehmen“ blendet alles andere aus, einen Bereich ohne gewähltes Modul auch (`hiddenForChoice`).
- **Tierarten** (`SITE_SPECIES` in `lib/site.ts`): Kacheln mit allen Tierarten der App und den Bienen. Die neueste Art (zurzeit Alpakas) trägt „Neu“ und ist daneben gezeichnet.
  - „Deine Tierart fehlt?“: Der Knopf „Tierart wünschen“ öffnet die Feedback-Blase als Idee mit dem Text „Bitte ergänzt die Tierart: “ (`openSiteFeedback`). Der Wunsch landet in Verwaltung → Feedback.
  - Ein Test prüft, dass jede Tierart der App genau einmal vorkommt. Eine neue Art fehlt dort also nicht.
- **Pakete und Preise:** vorläufig, siehe `docs/premium.md`.
- **Testphase:** Solange `TEST_PHASE` in `lib/site.ts` an ist, steht unter dem Kopf jeder Seite ein Streifen: „Testphase: alles offen und kostenlos …, wer jetzt testet, behält die App auch nach dem Start kostenlos“. Auf `/preise` stehen dieselbe Aussage und eine Frage dazu (siehe `docs/premium.md`).

### Bilder

- **Gezeichnet, im Stil der App:** Hinter jeder Seite steht der gezeichnete Hof (`components/site/farm-scene.tsx`: Scheune, Silo, Feld, Bienenstock, Hühner).
- **Szenen je Thema** (`components/site/scenes.tsx`, `SCENES`):

  | Szene | Wo |
  |---|---|
  | Pflanzen am Fenster mit scannendem Handy | Meine Pflanzen |
  | Hochbeet | Beet-Architekt, Start |
  | Kräuterbündel und Mörser | Kräuter-Hexe |
  | Vorratsregal | Vorratskammer |
  | Marienkäfer unter der Lupe | Schädlinge |
  | Hühner am Stall | Stall-Aufgaben, Start |
  | Ziegen an der Heuraufe | Futterplaner |
  | Glucke mit Küken | Zucht |
  | Schafe auf der Weide | Weide |
  | Alpakas mit Cria auf der Weide | Tiere: Tierarten |
  | Bienenstöcke auf der Blumenwiese | Bienen |
  | Fuchs nachts am Zaun, Kamera leuchtet | Wildtier-Radar |
  | Familie auf dem Hof | Team, Gemeinsam |
  | Erntekorb | Hilfe-Block |

  Module ohne eigene Szene zeigen einen Screenshot oder den Hof mit ihrem Symbol.
- **Bewegung:** Wolken ziehen, Bienen summen, Hühner, Ziegen und Schafe picken, Alpakas nicken, Blumen wiegen sich (`SCENE_STYLES`). Bei „Bewegung reduzieren“ im System steht alles still.
- **Screenshots:** echte Bilder der App vom Demo-Hof in `public/site/screens/*.jpg` (390 px breit, JPEG).
  - Neu erzeugen: Demo-Hof laden und die Seiten in Handybreite fotografieren.
  - Die Modul-Einführungen dabei zuklappen (`lf-intro-closed-<id>`).
- **Tests:** `site.test.ts` (Seiten, Module, Pakete, Finder, Übernahme).

## Offen

- Die Preise und die Zuordnung der KI-Funktionen zu Lite/Premium (`docs/premium.md`).
- Weitere Szenen für die Module, die noch einen Screenshot oder ihr Symbol zeigen (Pflegeplan, Pflanzendoc, Lexikon, Grow, Arzneimittel, Pflichten, Ertrag, Übergabe, Export).
- Kennzeichnung „Lite/Premium“ in der App an das Paket-Konzept angleichen.

## Homepage und App unter einer Adresse

littlefarming.de zeigt im Browser immer die **Homepage**, auch wenn man angemeldet ist. Die **App** öffnet sich unter **littlefarming.de/app** – oder über „Zur App“ oben auf der Homepage. Alles bleibt auf derselben Adresse, damit Anmeldung, Push, Fotos auf dem Gerät und installierte Apps weiter funktionieren (`lib/app-entry.ts`, `entryFor`).

| Was | Zeigt |
|---|---|
| `/` im Browser-Tab, abgemeldet | Homepage, „Anmelden“ öffnet das Formular; nach der Anmeldung geht es in die App |
| `/` im Browser-Tab, angemeldet | Homepage mit „Zur App“ |
| `/app` | App (Hof). Die Adresse wird danach zu `/`, damit alle Seiten der App gleich bleiben. Abgemeldet: das Anmeldeformular. |
| `/` in der installierten App (vom Startbildschirm, `display-mode: standalone`) | App – auch bei Installationen von vor der Umstellung |
| `/` in einem Tab, der schon in der App war (Neuladen) | App (`sessionStorage` `lf-app`) |
| `/` mit Parametern (`?start=login`, Fehler der Google-Anmeldung …) | App |
| jede Seite der App (`/farm`, `/aufgaben` …) | App, wie bisher |

- **Manifest:** `start_url` ist jetzt `/app`, `id` und `scope` bleiben `/` – installierte Apps bleiben dieselbe App.
- **Weitere Wege in die App:**
  - Die Google-Anmeldung von der Homepage kehrt nach `/app` zurück.
  - Push-Nachrichten ohne eigenes Ziel (Wetter, Unwetter) öffnen `/app`.
  - Der Umzugshelfer führt nach `/app`.
- **Der bekannte Haken:** In der App zeigt die Adresszeile `littlefarming.de`. Ein Lesezeichen von dort führt zur Homepage, von der „Zur App“ einen Tipp weiter ist. Für die App also besser `littlefarming.de/app` merken oder die App installieren.
- **Tests:** `app-entry.test.ts` und ein Browsertest aller Wege (abgemeldet, angemeldet, `/app`, Neuladen, installierte App, Anmeldung von der Homepage).

## Vorschau-Schutz (Passwort vor der ganzen Seite)

Solange die Umgebungsvariable **`SITE_PASSWORD`** gesetzt ist, zeigt die ganze Seite nur ein Passwortfeld: Landingpage, App und API.

- Nach dem richtigen Passwort bleibt das Gerät 180 Tage freigeschaltet (Cookie `lf_site`, ein HMAC des Passworts).
- **Ein neues Passwort sperrt alle Geräte wieder aus.**
- Nach 10 Fehlversuchen in 15 Minuten wird eine Adresse für eine Viertelstunde gesperrt.
- Ohne Passwortschutz laufen weiter:
  - `/api/healthz` (Render-Healthcheck)
  - `/api/cron/*` (Erinnerungen)
  - `/api/webhooks/*` (Kameras)
  - `robots.txt`

  Sie haben eigene Geheimnisse.
- Eine installierte App (aus dem Offline-Speicher) bekommt von der API 401 mit `X-Site-Locked`. Sie springt dann einmal zur Passwortseite (`/api/site-access`) und danach zurück.
- **Umzug über das Konto** (empfohlen, auch für installierte Apps auf Android und iPhone):
  - Die alte Adresse lädt Fotos, Scan-Warteschlange und Pilz-Entwurf in kleinen Paketen hoch (`POST /api/move/parcels`, Tabelle `move_parcels`).
  - Nach dem Anmelden auf der neuen Adresse holt `components/move-pickup.tsx` sie mit Fortschrittsbalken ab und löscht sie auf dem Server.
  - Reste verschwinden nach 14 Tagen. Höchstens 150 MB je Konto.
  - Die Tabelle steht in `PERSONAL_TABLES`.
  - Code: `lib/moveParcels.ts`, `routes/move.ts`, im Client `lib/move-account.ts`.
- Die Umzugsseiten (`MoveScreen`, `/umzug`) spielen neue App-Versionen sofort ein (`components/auto-update.tsx`). Das Popup „Neue Version“ erscheint dort nicht, und eine installierte App hing sonst auf einem alten Umzugshelfer fest.
- Gesperrte API-Aufrufe sagen, was zu tun ist: im Browser öffnen und das Seitenpasswort eingeben. Ältere App-Versionen zeigen diesen Text direkt an.
- Umzug: Beide Fenster zeigen einen Fortschrittsbalken („37 % · 7 von 19“). Hört das neue Fenster 15 Sekunden lang nichts von der alten Adresse, sagt es, was zu tun ist.
- Umzug mit Passwortschutz: Das neue Fenster des Umzugshelfers fragt zuerst nach dem Seitenpasswort. Es sagt danach so lange alle 2 Sekunden „bereit“, bis die alte Adresse antwortet. Die alte Adresse wartet bis zu 10 Minuten (`lib/move-channel.ts`).
- **Freischalten für alle:** `SITE_PASSWORD` in Render löschen. Dann ist der Schutz sofort weg.

Technik: `api-server/src/lib/siteGate.ts` (mit Test), eingehängt in `app.ts` vor allen Routen; im Client `lib/site-lock.ts`.

## Domain littlefarming.de als Hauptadresse

Die App leitet jede Adresse, die nicht `PUBLIC_BASE_URL` ist, über den Umzugshelfer zur Hauptadresse (replit.md, „Moving to a new domain“). Steht `PUBLIC_BASE_URL` noch auf `https://kraeuter-hexe.onrender.com`, landet littlefarming.de deshalb dort.

Umstellen in Render → Service → Environment:

1. `PUBLIC_BASE_URL` = `https://littlefarming.de`
2. `LEGACY_ORIGINS` = `https://kraeuter-hexe.onrender.com` (steht schon in render.yaml)
3. In der Google Cloud Console als „Autorisierte Weiterleitungs-URI“ ergänzen: `https://littlefarming.de/api/auth/google/callback`. Den Google-Knopf gibt es nur, wenn in Render **beide** Variablen `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` gesetzt sind.
4. Beim Cron-Dienst (cron-job.org) die Adresse auf `https://littlefarming.de/api/cron/trigger-notifications` ändern.
5. Wer littlefarming.de schützen will: `SITE_PASSWORD` setzen.

Danach leitet die alte onrender-Adresse zu littlefarming.de, nicht mehr umgekehrt.
