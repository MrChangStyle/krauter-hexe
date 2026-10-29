# Entscheidungen

Größere Entscheidungen auf dem Weg zum Start: Was, warum, welche Alternativen. Neueste oben.

## 29.10.2026 – Audit-Auftrag an unseren Aufbau angepasst

- **Was:** Der allgemeine Auftrag „Little Farming eigenständig prüfen und fertigstellen“ wird zu `docs/LAUNCH-PLAN.md`.
  - Render statt Vercel.
  - Eigene Anmeldung und Neon-Postgres statt Supabase.
  - Ein Pull Request je Schritt statt eines Branches `launch/fertigstellung` mit Merge am Ende.
- **Warum:**
  - Die App läuft auf diesem Aufbau. Ein Umzug auf Supabase oder Vercel brächte vor dem Start nur Risiko.
  - Kleine PRs gehen sofort live und lassen sich einzeln prüfen. Das hat sich bewährt.
- **Übersetzung der Supabase-Punkte:**
  - „RLS auf allen Tabellen“ wird zu „jeder Endpunkt prüft Hof-Mitgliedschaft und Rolle“, abgesichert durch einen systematischen Test (Schritt 3).
  - „Storage-Buckets“ wird zu Cloudinary-Uploads nur über den Server.
  - „Advisors“ wird zu CI, Typecheck und Fehlerüberwachung.
- **Alternativen:**
  - Den Auftrag wörtlich umsetzen: verworfen, siehe oben.
  - Nur die offenen Punkte der Moduldateien abarbeiten: zu eng, der Start braucht auch Konten, Recht und Marketing.

## 29.10.2026 – E-Mail-Versand über einen Dienst, mit Rückfallweg

- **Was:** „Passwort vergessen“ und Bestätigungsmails laufen über einen E-Mail-Dienst (vorgesehen: Resend, Umgebungsvariable `RESEND_API_KEY`). Ohne Schlüssel setzt der Betreiber das Passwort in der Verwaltung zurück und gibt einen Einmal-Link weiter.
- **Warum:**
  - Render kann keine Mails selbst verschicken.
  - Resend ist einfach, hat eine EU-Region und einen kostenlosen Einstieg (3.000 Mails im Monat).
  - Der Rückfallweg macht die App ab sofort startfähig.
- **Alternativen:** SMTP eines Webhosters (geht über dieselbe Schnittstelle, falls gewünscht), Brevo, Postmark.

## 29.10.2026 – Geflügel aufteilen statt Unterart-Feld

- **Was:** Gänse, Enten, Puten und Wachteln werden eigene Tierarten neben „Geflügel (Hühner)“. Dazu kommen Nandus und Esel.
- **Warum:** Futterbedarf, Brutdauer, Wetter, Pflichten und Futterpflanzen unterscheiden sich deutlich. Ein Freitext-Unterfeld könnte die Regeln nicht nutzen.
- **Alternativen:**
  - Unterart-Feld bei Geflügel: einfacher, aber ohne fachlichen Nutzen.
  - Frei anlegbare Arten durch den Admin: Neue Arten brauchen Fachwerte (Futter, Wetter, Pflichten). Deshalb gibt es stattdessen „Tierart anfragen“ mit Eingang in der Verwaltung, und eine Art wird mit ihren Werten eingebaut.
