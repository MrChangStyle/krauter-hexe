# Meine Farm – Master-Prompt (Version 8.2)

Entwickler-Prompt für einen KI-Programmier-Agenten (Claude Code), um die **Kräuter-Hexe**
Schritt für Schritt um das Modul **„Meine Farm“** zu erweitern: Verwaltung von Haus- und
Nutztieren, Krankenakte, Gewicht, Stall-Aufgaben, KI-Foto-Analyse und ein IoT-Wildtier-Radar.

## Grundsatz: Wir bauen die Kräuter-Hexe aus, keine neue App

Die Kräuter-Hexe bleibt, wo sie ist (dieses Repo, dieselbe Render-Instanz, dieselbe
Neon-Datenbank, dieselben Nutzerkonten). „Meine Farm“ ist **kein eigenständiges Projekt**,
sondern ein weiteres Modul in derselben App. Wir verbessern und ergänzen die Kräuter-Hexe
stetig weiter – die Farm-Funktionen sind der nächste Ausbau, nicht der letzte.

## Änderungen gegenüber Version 8.1

- **Kein Neubau mehr:**
  - Next.js, Prisma und Auth.js entfallen.
  - Es wird der vorhandene Stack der Kräuter-Hexe genutzt (siehe unten).
  - Der Abschnitt „Tech-Stack“ beschreibt jetzt, was schon da ist und wiederverwendet werden muss.
- **Bestehende Bausteine werden wiederverwendet statt neu gebaut:**
  - Login (JWT-Cookie + Google)
  - Cloudinary-Upload
  - Gemini-Client mit Retry/Fallback
  - Push-Erinnerungen über den Cron-Endpunkt
  - Aufgaben-Seite
  - PDF-Export mit jsPDF
  - Bildverkleinerung beim Aufnehmen
- **Verknüpfung mit dem Pflanzenwissen:**
  - Die Kräuter-Hexe kennt schon die Giftigkeit jeder Pflanze für Geflügel, Hase,
    Meerschweinchen, Katze und Pferd.
  - Futter-Analyse und Tierakte nutzen dieses Wissen.
- **Mandanten:** Das bisherige Modell (Inhaber + freigeschaltete Familienmitglieder) bleibt.
  Darüber kommt eine Farm-Ebene mit Rollen, damit später auch gewerbliche Höfe möglich sind.
- **Neue Pflicht-Regeln:**
  - Datenbank nur additiv ändern.
  - Nichts Bestehendes darf kaputtgehen.
  - `replit.md` nach jedem Schritt pflegen.
- **IoT-Hinweis:** Der kostenlose Render-Tarif schläft nach 15 Minuten ein. Ein Raubtier-Alarm
  käme dann bis zu einer Minute zu spät (siehe Schritt 6).

## Prompt

```text
PROJEKTBESCHREIBUNG
Erweitere die bestehende App "Kräuter-Hexe" (dieses Repo) um das Modul "Meine Farm" zur
Verwaltung von Haus- und Nutztieren: Tierbestand (Einzeltier/Herde), digitale Krankenakte,
Gewichts-Tracking, Stall-Aufgaben, KI-Foto-Analyse (Gemini) und ein IoT-Wildtier-Radar.
UI-Sprache: Deutsch. Mobile-First. Die Kräuter-Hexe wird damit stetig weiter verbessert und
ergänzt – sie wird NICHT neu aufgesetzt, NICHT in ein neues Repo verschoben und NICHT auf ein
anderes Framework umgestellt.

GOLDENE REGELN FÜR DEN AUSBAU
1. Erst lesen, dann bauen: replit.md (Architekturentscheidungen + Gotchas) und den betroffenen
   Code lesen, bevor du etwas änderst. replit.md ist die verbindliche Projekt-Doku.
2. Nichts Bestehendes kaputtmachen: Scan, Pilz-Scan, Insekten, Archiv, Kategorien, PDF-Export,
   Pflege-Guides, Aufgaben, Push, Offline-Warteschlange und Login müssen danach genauso
   funktionieren. Bestehende Tests müssen grün bleiben.
3. Datenbank nur ADDITIV ändern: neue Tabellen, neue nullable Spalten, neue Enum-Werte.
   Keine Spalten/Tabellen umbenennen oder löschen, keine Pflichtspalten ohne Default an
   bestehenden Tabellen. Die Produktions-Datenbank wird mit `drizzle-kit push` aktualisiert –
   jede Änderung muss ohne Datenverlust durchlaufen (niemals `push-force`).
4. Vorhandene Bausteine wiederverwenden statt duplizieren (siehe TECH-STACK).
5. Nach jedem Schritt replit.md ergänzen: neue Tabellen/Routen unter "Where things live",
   jede Grundsatzentscheidung mit Begründung unter "Architecture decisions".

TECH-STACK (vorhanden – verbindlich, nichts eigenmächtig ersetzen)
- pnpm-Monorepo, Node.js 24, TypeScript 5.9.
- Backend: Express 5 in artifacts/api-server (Routen in src/routes, Logik in src/lib).
- Datenbank: Neon PostgreSQL (eu-central-1) via Drizzle ORM, Schema in lib/db/src/schema
  (eine Datei pro Bereich, in index.ts exportieren). Feste Wertelisten als native pg-Enums.
- API-Vertrag: lib/api-spec/openapi.yaml → Orval-Codegen
  (`pnpm --filter @workspace/api-spec run codegen`) für React-Hooks + Zod-Schemas.
  Jede neue Route ZUERST im OpenAPI-Spec anlegen, dann generieren, dann implementieren.
- Frontend: React + Vite in artifacts/pflanzenscanner, Routing mit wouter (src/App.tsx),
  vorhandene Schriften/Farbpalette (Outfit, Playfair Display, erdig/waldgrün) beibehalten.
- Login: vorhandenes System (E-Mail/Passwort mit scrypt + "Mit Google anmelden", JWT im
  HttpOnly-Cookie `auth`, Freischaltung durch den Inhaber, Middleware requireApproved).
  KEIN zweites Auth-System einführen.
- Bilder: vorhandener Cloudinary-Upload (src/lib/imageStorage.ts) und Bildverkleinerung beim
  Aufnehmen (downscaleFile in src/lib/image.ts). In der DB nur die Cloudinary-URL, niemals
  Base64. Uploads bleiben "nicht fatal" wie bei den Scans.
- KI: vorhandener Gemini-Client (src/lib/geminiClient.ts, @google/genai) mit
  thinkingBudget 0, Retry/Backoff, Fallback-Modell und defensivem JSON-Parsing.
  Jede KI-Antwort zusätzlich mit Zod prüfen; fehlende/unklare Werte fallen auf die
  vorsichtige Seite (wie "Safety-first fallback" bei den Pflanzen).
- Erinnerungen: vorhandene Web-Push-Infrastruktur + externer Cron
  (POST /api/cron/trigger-notifications). Keine setInterval-Timer im Server.
- PDF: clientseitig mit jsPDF wie der Kategorien-Export (src/lib/pdf-export.ts als Vorbild).
- Hosting: ein einziger Render-Web-Service (render.yaml, Frankfurt), API unter /api/*,
  PWA unter allen anderen Pfaden. Neue Secrets in render.yaml (sync: false) und in
  replit.md dokumentieren.
- Tests: vorhandenes Test-Setup (Vitest) – neue Logik bekommt Tests nach dem Muster der
  bestehenden *.test.ts-Dateien.

FARM-EBENE, ROLLEN & SICHERHEIT
- Das bestehende Modell bleibt: Inhaber (isOwner) + freigeschaltete Nutzer (approved).
- Neu darüber (additiv):
  - farms (id, name, createdAt)
  - farm_memberships (userId → users.id, farmId, role; unique [userId, farmId])
  - Enum farm_role { admin, caretaker, guest }  (UI: Admin, Tierpfleger, Gast)
    admin: alles inkl. Mitglieder/Kameras · caretaker: Tiere/Medizin/Logs schreiben ·
    guest: nur lesen.
- Beim ersten Öffnen von "Meine Farm" bekommt ein freigeschalteter Nutzer automatisch eine
  eigene Farm als admin. Mitglieder werden per E-Mail eines bestehenden, freigeschalteten
  Kontos hinzugefügt. Ein Nutzer kann mehreren Farmen angehören; die aktive Farm ist umschaltbar.
- Jede Farm-Tabelle hat farmId (indexiert). Zugriff NUR über eine zentrale Middleware
  requireFarm(minRole), die requireApproved + Mitgliedschaft prüft und { userId, farmId, role }
  liefert. Keine Drizzle-Abfrage auf Farm-Daten ohne farmId im where.
  Test: Farm A kann Daten von Farm B weder lesen noch ändern.
- Alle Request-Bodies mit den generierten Zod-Schemas validieren.

DATENMODELL (neue Tabellen, Dateien in lib/db/src/schema)
- herds (farmId, name, species, notes)
- farm_animals (farmId, herdId nullable, name, species, breed, birthDate, sex,
  registrationNumber – eindeutig pro Farm, imageUrl, notes, archivedAt nullable)
  → Tierart als Enum, das die vorhandenen Schlüssel aus src/lib/animals.ts enthält
    (poultry, rabbit, guineaPig, cat, horse) und um Nutztiere ergänzt wird (z. B. goat,
    sheep, cattle, pig, dog, other).
- medical_records (farmId, animalId, date, diagnosis, treatment, medication,
  withdrawalPeriodDays, vet, notes)
- weight_logs (farmId, animalId, date, weightKg)
- food_logs (farmId, animalId nullable, herdId nullable, date, imageUrl, analysis jsonb)
- cameras (farmId, name, secretHash, relayUrl, cooldownSeconds, lastTriggeredAt)
- camera_events (farmId, cameraId, createdAt, imageUrl, predatorDetected, species,
  confidence, relayTriggered)
- Aufgaben: die vorhandene Tabelle tasks additiv erweitern (plantId nullable machen,
  neue nullable Spalte animalId/herdId, neue Enum-Werte wie "Füttern", "Ausmisten",
  "Entwurmen", "Impfen"), damit Push-Erinnerungen und die Seite /aufgaben weiter
  funktionieren. Falls plantId-nullable bestehende Abfragen gefährdet: separate Tabelle
  farm_tasks und dieselbe Cron-Logik mitbenutzen – Entscheidung in replit.md begründen.

KERNFUNKTIONEN
1. Tierbestand: Einzeltier oder Herde anlegen. Pflichtfelder: Foto, Name, Geburtsdatum,
   Registriernummer (Ring/Ohrmarke), Geschlecht (manuell), Tierart.
2. Medizin: Krankenakte je Tier, verknüpft mit der Registriernummer. Button
   "Veterinäramt-Export": CSV und PDF (Bestandsliste + Medizin-Historie, nach Zeitraum).
3. Tracking: Gewichtsdiagramm je Tier; rote Warnung bei Abnahme > 5 % in 14 Tagen
   (Schwellwerte als Konstanten). Stall-Aufgaben mit Push-Erinnerung über den bestehenden Cron.
4. KI-Features (Gemini):
   - Rasse-/Arterkennung beim Foto-Upload (Vorschlag, vom Nutzer bestätigbar).
   - "Haltungs-Wiki" je Tierart (Ernährung, Haltung, Lebenserwartung), gecacht pro Tierart.
   - Futter-Foto-Analyse (Nährstoffe) mit Abgleich gegen die Krankenakte.
   - NEU – Brücke zur Kräuter-Hexe: erkannte Pflanzen im Futter werden gegen das
     vorhandene Pflanzenarchiv und dessen Tier-Status (giftig/genießbar je Tierart)
     geprüft; auf der Tierseite ein Abschnitt "Giftige Pflanzen für diese Tierart" aus dem
     Archiv. Giftig schlägt immer genießbar (Safety-first).
   Alle KI-Hinweise tragen den Vermerk "KI-Einschätzung – ersetzt keinen Tierarzt".
5. Wildtier-Radar (IoT): POST /api/webhooks/camera
   - Auth: Header "Authorization: Bearer <camera-secret>"; Kamera über sha256-Hash des
     Secrets gefunden (Vergleich mit timingSafeEqual) → farmId. Ohne gültiges Secret: 401,
     keine Gemini-Anfrage.
   - Body: Bild (max. 5 MB). Gemini-Antwort als JSON:
     { predatorDetected: boolean, species: string|null, confidence: 0..1 }.
   - Relais nur, wenn predatorDetected && confidence >= 0.7 und Cooldown abgelaufen.
     Relais-Aufruf mit 5 s Timeout; jedes Ereignis als camera_event speichern (Bild in
     Cloudinary) und in "Meine Farm" anzeigen; zusätzlich Push an die Farm-Mitglieder.

NAVIGATION
- Neuer Bereich "Meine Farm" in der bestehenden Navigation (wouter-Routen, z. B. /farm,
  /farm/tier/:id, /farm/kameras), gleiches Design wie der Rest der App.
- Bestehende Routen und Weiterleitungen bleiben unverändert.

AUSSER SCOPE (nicht bauen): Bezahlung/Abos, native Apps, E-Mail-Versand, Umzug auf ein
anderes Framework oder einen anderen Hoster.

VORGEHENSWEISE (streng sequenziell; nach JEDEM Schritt anhalten, kurz berichten und auf mein
OK warten; jeder Schritt auf einem eigenen Branch mit Pull Request gegen main)
- Schritt 1 – Fundament: Drizzle-Schemas (Farm-Ebene + Datenmodell), OpenAPI-Spec,
  Codegen, requireFarm() + Isolationstest. Keine UI.
- Schritt 2 – Farm & Rollen: automatische eigene Farm, Mitglieder verwalten, Farm wechseln,
  Navigationspunkt "Meine Farm" mit leerem Dashboard.
- Schritt 3 – Tierbestand: CRUD für Tiere/Herden inkl. Foto (Cloudinary, downscaleFile).
- Schritt 4 – Medizin, Gewicht, Aufgaben: CRUD, Gewichtsdiagramm mit Warnlogik,
  Stall-Aufgaben mit Push, Veterinäramt-Export (CSV + PDF).
- Schritt 5 – KI: Arterkennung, Haltungs-Wiki, Futteranalyse inkl. Abgleich mit dem
  Pflanzenarchiv.
- Schritt 6 – IoT: Kamera-Verwaltung (Secret nur einmal anzeigen), Webhook, Relais,
  Ereignisliste, Push. VOR dem Bau klären: Der kostenlose Render-Tarif schläft nach
  ~15 Minuten ein (30–60 s Aufwachzeit) – für einen echten Raubtier-Alarm braucht es einen
  durchgehend laufenden Dienst (bezahlter Tarif) oder eine lokale Auslösung am Relais.

DEFINITION OF DONE pro Schritt: `pnpm run typecheck` fehlerfrei, `pnpm run build` erfolgreich,
alle Tests grün (alte und neue), bestehende Funktionen stichprobenartig im Browser geprüft,
replit.md aktualisiert, keine TODO-Platzhalter im gelieferten Code.
```
