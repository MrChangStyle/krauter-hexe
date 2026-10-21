# Landingpage, Vorschau-Schutz und Domain

## Landingpage

Wer nicht angemeldet ist, sieht zuerst die Landingpage (`components/landing-page.tsx`). Sie zeigt:

- Kopf mit „Dein Hof in einer App“, „Kostenlos registrieren“ und „Anmelden“
- vier Stärken der App
- den Hof (Dashboard)
- alle Pflanzen- und Tiere-Module mit je einem erklärenden Satz (`lib/landing.ts`; ein Test hält die Liste gleich mit `MODULES`)
- Team und Vertretung
- Kostenlos / Lite / Premium
- „So legst du los“ in drei Schritten
- Fußzeile mit den Rechtsseiten

„Anmelden“ und „Registrieren“ öffnen das bekannte Formular. „Zurück zur Startseite“ führt wieder zur Landingpage. Ein fehlgeschlagener Google-Login landet direkt im Formular.

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
- **Freischalten für alle:** `SITE_PASSWORD` in Render löschen. Dann ist der Schutz sofort weg.

Technik: `api-server/src/lib/siteGate.ts` (mit Test), eingehängt in `app.ts` vor allen Routen; im Client `lib/site-lock.ts`.

## Domain littlefarming.de als Hauptadresse

Die App leitet jede Adresse, die nicht `PUBLIC_BASE_URL` ist, über den Umzugshelfer zur Hauptadresse (replit.md, „Moving to a new domain“). Steht `PUBLIC_BASE_URL` noch auf `https://kraeuter-hexe.onrender.com`, landet littlefarming.de deshalb dort.

Umstellen in Render → Service → Environment:

1. `PUBLIC_BASE_URL` = `https://littlefarming.de`
2. `LEGACY_ORIGINS` = `https://kraeuter-hexe.onrender.com` (steht schon in render.yaml)
3. In der Google Cloud Console als „Autorisierte Weiterleitungs-URI“ ergänzen: `https://littlefarming.de/api/auth/google/callback`
4. Beim Cron-Dienst (cron-job.org) die Adresse auf `https://littlefarming.de/api/cron/trigger-notifications` ändern.
5. Wer littlefarming.de schützen will: `SITE_PASSWORD` setzen.

Danach leitet die alte onrender-Adresse zu littlefarming.de, nicht mehr umgekehrt.
