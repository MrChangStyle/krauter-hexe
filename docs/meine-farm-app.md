# Meine Farm App – Master-Prompt (Version 8.1)

Entwickler-Prompt für einen KI-Programmier-Agenten (z. B. Replit Agent), um die SaaS-App
„Meine Farm“ (Haus- und Nutztierverwaltung, B2C/B2B, IoT-ready) Schritt für Schritt aufzubauen.

## Änderungen gegenüber Version 8.0

- **Bilder nur in Cloudinary.** `public/uploads` fällt weg: Next.js liefert dort nach dem Build
  hochgeladene Dateien nicht aus, und auf Replit/Render sind die Dateien nach jedem Redeploy weg.
- **Direkt-Upload aus dem Browser**, weil Server Actions standardmäßig nur 1 MB annehmen.
- **Kamera-Webhook abgesichert**: geheimer Schlüssel pro Kamera, Mindestsicherheit der
  KI-Erkennung, Sperrzeit fürs Relais, eigene Modelle `Camera` und `CameraEvent`.
- **Neue Modelle**:
  - `Membership` (ein User kann zu mehreren Farmen gehören, die Rolle hängt an der Mitgliedschaft),
  - `Herd` (Herde als eigenes Modell),
  - die Auth.js-Tabellen (`Account`, `Session`, `VerificationToken`).
- **Zentrale Zugriffsprüfung** über `requireOrg()` plus einen Test, der beweist, dass keine
  Farm die Daten einer anderen sieht.
- **Gemini** über `@google/genai` statt des veralteten `@google/generative-ai`. Übernommen aus
  der Kräuter-Hexe: `thinkingBudget: 0`, Ersatzmodell, automatische Wiederholung,
  Prüfung der Antworten mit Zod.
- **Neon**: gepoolte `DATABASE_URL` für den Betrieb und direkte `DIRECT_URL` für Migrationen.
- **Klarere Vorgaben**:
  - 6 statt 4 Schritte,
  - ein „fertig, wenn …“ pro Schritt,
  - eine Liste, was ausdrücklich nicht gebaut wird,
  - eine feste Schwelle für die Gewichtswarnung,
  - ein KI-Hinweis „ersetzt keinen Tierarzt“.

## Prompt

```text
PROJEKTBESCHREIBUNG
Erstelle eine kommerzielle Full-Stack-Web-App (SaaS) "Meine Farm" zur Verwaltung von Haus- und
Nutztieren für private (B2C) und gewerbliche Nutzer (B2B): Mehrbenutzer/Mandanten, digitale
Krankenakte, Gewichts-Tracking, Stall-Aufgaben, KI-Foto-Analyse (Gemini) und ein IoT-Wildtier-Radar.
UI-Sprache: Deutsch. Mobile-First.

TECH-STACK (verbindlich, nichts eigenmächtig ersetzen)
- Next.js (aktuelle stabile Version), App Router, TypeScript strict, Server Actions für Mutationen.
- Tailwind CSS.
- Datenbank: Neon PostgreSQL (Region Frankfurt) via Prisma ORM.
  - DATABASE_URL = gepoolte Neon-URL (Runtime), DIRECT_URL = direkte URL (nur für Migrationen).
- Bilder: AUSSCHLIESSLICH Cloudinary (CLOUDINARY_URL). KEINE lokale Speicherung, KEIN public/uploads,
  KEIN Base64 in der Datenbank. In Neon werden nur secure_url + public_id gespeichert.
  - Fotos werden im Browser auf max. 1600 px / JPEG ~80 % verkleinert und per signiertem
    Direkt-Upload zu Cloudinary geschickt (Signatur kommt von einer Server Action). Nie ganze
    Bilder durch Server Actions schicken (1-MB-Limit).
- Auth: Auth.js (NextAuth v5) mit Prisma-Adapter, Google-Login + E-Mail/Passwort (bcrypt).
  Session-Strategie: JWT (Pflicht wegen Credentials-Provider).
- KI: Google Gemini über das SDK @google/genai (NICHT das veraltete @google/generative-ai).
  - Modellname aus ENV (GEMINI_MODEL, GEMINI_FALLBACK_MODEL), nicht hart codieren.
  - thinkingConfig.thinkingBudget = 0 setzen (sonst wird die JSON-Antwort abgeschnitten).
  - responseMimeType "application/json" + Zod-Validierung jeder Antwort; JSON defensiv parsen.
  - Bei 429/503: Retry mit Backoff, dann Fallback-Modell. Modelle immer mit einer echten
    Bildanfrage testen, nicht nur mit Text.
- Alle Secrets nur über Umgebungsvariablen; lege eine vollständige .env.example an.

MULTI-TENANCY & SICHERHEIT
- Prisma-Modelle (genau diese Namen):
  User, Account, Session, VerificationToken (Auth.js),
  Organization, Membership (userId, organizationId, role; unique [userId, organizationId]),
  Herd, Pet (optional herdId), MedicalRecord, FoodLog, WeightLog, Task,
  Camera (organizationId, name, secretHash, relayUrl, cooldownSeconds), CameraEvent.
- Enum Role { ADMIN, CARETAKER, GUEST }  (UI-Labels: Admin, Tierpfleger, Gast).
  ADMIN: alles inkl. Mitglieder/Kameras. CARETAKER: Tiere/Medizin/Logs schreiben. GUEST: nur lesen.
- Ein User kann Mitglied mehrerer Organisationen sein; die aktive Organisation wird in der
  Session gespeichert und ist umschaltbar.
- Jede fachliche Tabelle hat organizationId (indexiert). Zugriff NUR über eine zentrale
  Funktion requireOrg(minRole) in lib/auth, die Session + Membership prüft und
  { userId, organizationId, role } zurückgibt. Keine Prisma-Abfrage auf Fachdaten ohne
  organizationId im where. Schreibe einen Test, der beweist, dass Org A keine Daten von Org B
  lesen oder ändern kann.
- Eingaben aller Server Actions mit Zod validieren.

KERNFUNKTIONEN
1. Tiere: Anlage als Einzeltier oder Herde. Pflichtfelder: Foto, Name, Geburtsdatum,
   Registriernummer (Ring/Ohrmarke, eindeutig pro Organisation), Geschlecht (manuell), Tierart.
2. Medizin: Krankenakte je Tier (Datum, Diagnose, Behandlung, Medikament, Wartezeit, Tierarzt),
   verknüpft mit der Registriernummer. Button "Veterinäramt-Export": CSV und PDF mit
   Bestandsliste + Medizin-Historie, filterbar nach Zeitraum.
3. Tracking: Gewichtsdiagramm je Tier; Warnung (rot) bei Abnahme > 5 % innerhalb von 14 Tagen
   (Schwellwerte als Konstanten). To-do-Kalender für Stall-Aufgaben (einmalig/wiederkehrend,
   zuweisbar an Mitglieder).
4. KI-Features (Gemini): Rasse-/Arterkennung beim Foto-Upload (Vorschlag, vom Nutzer
   bestätigbar); daraus ein "Haltungs-Wiki" (Ernährung, Haltung, Lebenserwartung), gecacht pro
   Tierart statt pro Tier; Futter-Foto-Analyse (Nährstoffe) mit Abgleich gegen die Krankenakte.
   Alle KI-Hinweise tragen den Vermerk "KI-Einschätzung – ersetzt keinen Tierarzt".
5. Wildtier-Radar (IoT): POST /api/webhooks/camera
   - Auth: Header "Authorization: Bearer <camera-secret>"; Kamera wird über den Hash des Secrets
     gefunden → daraus organizationId. Ohne gültiges Secret: 401, keine Gemini-Anfrage.
   - Body: Bild (multipart oder Bild-URL, max. 5 MB).
   - Gemini-Antwort als JSON: { predatorDetected: boolean, species: string|null, confidence: 0..1 }.
   - Relais nur auslösen, wenn predatorDetected && confidence >= 0.7 und der Cooldown der
     Kamera abgelaufen ist. Relais-Aufruf mit Timeout (5 s); jedes Ereignis als CameraEvent
     speichern (Bild in Cloudinary) und im Dashboard anzeigen.

AUSSER SCOPE (nicht bauen, nur Platz im Design lassen): Bezahlung/Abos, native Apps, E-Mail-Versand.

VORGEHENSWEISE (streng sequenziell; nach JEDEM Schritt anhalten, kurz berichten und auf mein OK warten)
- Schritt 1 – Fundament: Next.js + Tailwind + Prisma, komplettes schema.prisma (alle Modelle oben),
  erste Migration zu Neon, Seed-Skript (2 Organisationen, je 3 Nutzer mit unterschiedlichen
  Rollen, einige Tiere).
- Schritt 2 – Auth & Gerüst: Auth.js, Registrierung/Login, Organisation anlegen/wechseln,
  requireOrg() + Isolationstest, Navigation (Dashboard, Tiere, Aufgaben, Einstellungen).
- Schritt 3 – Tiere & Bilder: CRUD für Tiere/Herden inkl. Cloudinary-Direkt-Upload.
- Schritt 4 – Medizin, Gewicht, Aufgaben: CRUD, Gewichtsdiagramm mit Warnlogik, Kalender,
  Veterinäramt-Export (CSV + PDF).
- Schritt 5 – KI: Gemini-Client (Retry/Fallback/Zod), Arterkennung, Haltungs-Wiki, Futteranalyse.
- Schritt 6 – IoT: Camera-Verwaltung (Secret einmalig anzeigen), Webhook, Relais, Ereignisliste.

DEFINITION OF DONE pro Schritt: `tsc --noEmit` fehlerfrei, `next build` erfolgreich, Lint sauber,
Funktion im Browser selbst geprüft, keine TODO-Platzhalter im gelieferten Code.
```
