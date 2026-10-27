# Little Farming – Master-Prompt (Version 8.4)

Entwickler-Prompt für einen KI-Programmier-Agenten (Claude Code), um die **Kräuter-Hexe**
Schritt für Schritt um das Modul **„Meine Farm“** zu erweitern: Verwaltung von Haus- und
Nutztieren, Krankenakte, Gewicht, Stall-Aufgaben, KI-Foto-Analyse und ein IoT-Wildtier-Radar.

## Grundsatz: Little Farming ist die App – Kräuterhexe und Meine Farm sind ihre Teile

**Little Farming** ist die Dach-App. Die bestehende **Kräuterhexe** (Pflanzen, Pilze, Insekten)
wird ein Teil von Little Farming, ebenso **Meine Farm** (Tiere). Nicht umgekehrt: Little Farming
ist nicht ein Teil der Kräuterhexe.

Technisch entsteht dafür keine neue App: Gebaut wird im bestehenden Code der Kräuterhexe
(dieses Repo, dieselbe Render-Instanz, dieselbe Datenbank, dieselben Konten). Name, Wording und
Domain werden in Phase B auf Little Farming umgestellt.

## Bisheriger Grundsatz (bleibt gültig): Wir bauen auf dem Bestehenden auf, keine neue App

Die Kräuter-Hexe bleibt, wo sie ist (dieses Repo, dieselbe Render-Instanz, dieselbe
Neon-Datenbank, dieselben Nutzerkonten). „Meine Farm“ ist **kein eigenständiges Projekt**,
sondern ein weiteres Modul in derselben App. Wir verbessern und ergänzen die Kräuter-Hexe
stetig weiter – die Farm-Funktionen sind der nächste Ausbau, nicht der letzte.

## Änderungen gegenüber Version 8.3

- **Little Farming ist die Dach-App.** Kräuterhexe und Meine Farm sind Module darin.
- **Neue Phase B „Umbenennung zu Little Farming“** zwischen Phase A und dem Farm-Modul.
  Der öffentliche Start soll unter dem endgültigen Namen und der endgültigen Domain laufen.
- **Neue Texte nutzen schon jetzt „Little Farming“ als App-Namen**, z. B. die Rechtsseiten
  aus A1. Die Kräuterhexe wird dort als Teil der App genannt.
- **A1 (freie Registrierung) ist umgesetzt.** Entscheidungen:
  - Neue Konten sind sofort nutzbar (Schalter `OPEN_REGISTRATION`).
  - **Testphase:** Auch ohne `OPEN_REGISTRATION` dürfen die ersten 20 Konten (ohne den Inhaber, die schon bestehenden zählen mit) sofort starten (`FREE_TESTER_SLOTS`, Standard 20, `0` = aus; `approveIfFreeTesterSlot` in `lib/accounts.ts`). Gezählt wird der Platz nach Anlegezeit; geprüft nur beim Anlegen (Passwort und Google), damit ein vom Inhaber gesperrtes Konto gesperrt bleibt. Ab Platz 21 wartet ein neues Konto wie bisher auf die Freischaltung. Gelöschte Konten machen ihren Platz frei. Die Zahl 20 ist eine Entscheidung des Inhabers, keine fachliche Grenze. Bei jeder neuen Anmeldung bekommt der Inhaber einen Push (Thema „Betreiber“): wer, und ob das Konto sofort startet oder wartet (`notifyOwnerOfNewAccount`).
  - Kein E-Mail-Versand.
  - Cloudflare Turnstile als Bot-Schutz.

## Änderungen gegenüber Version 8.2

- **Neue Phase A vor dem Farm-Modul: Grundlagen für die öffentliche App.**
  - Freie Registrierung
  - Konto-Löschung in der App
  - Moderation
  - Der Plan dazu stammt aus dem Claude-Chat. Erst danach kommt das Tier-Modul.
- **Datenbank-Änderungen laufen über `schemaUpgrade.ts`** beim Serverstart (eingeführt mit
  der Bildlogik, PR #7) und nicht mehr über `drizzle-kit push` gegen die Produktion.
- **Eine zentrale Konto-Löschfunktion, die jedes Modul erweitert.** Damit bleiben beim
  Löschen keine Datenreste zurück. Heute ist das der Fall: Die Nutzer-Tabellen haben keine
  Fremdschlüssel, und das Löschen durch den Inhaber entfernt nur die `users`-Zeile.
- **Farm-Daten sind privat.** Anders als das gemeinsame Pflanzenarchiv sehen sie nur die
  Mitglieder der jeweiligen Farm.

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
Die App heißt "Little Farming". Die bestehende App "Kräuter-Hexe" (dieses Repo) wird zu ihrem
Modul für Pflanzen, Pilze und Insekten; "Meine Farm" wird ihr Modul für Tiere. Neue Texte
nennen die App "Little Farming" und die Module beim Namen.
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
   bestehenden Tabellen. Die Produktions-Datenbank wird über
   artifacts/api-server/src/lib/schemaUpgrade.ts beim Serverstart angepasst: nur
   idempotente Anweisungen (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
   neue Enum-Werte mit IF NOT EXISTS). Das Drizzle-Schema in lib/db/src/schema wird
   identisch nachgezogen. `drizzle-kit push` nur lokal, niemals `push-force`.
4. Vorhandene Bausteine wiederverwenden statt duplizieren (siehe TECH-STACK).
5. Konto-Löschung zentral: Es gibt genau eine Funktion deleteAccount(userId) (Phase A).
   Jede neue Tabelle mit Nutzerbezug wird dort eingetragen, im selben PR, inklusive Test.
6. Nach jedem Schritt replit.md ergänzen: neue Tabellen/Routen unter "Where things live",
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
  - Enum farm_role { admin, caretaker, guest }  (UI: Admin, Mitarbeiter, Gast)
    admin: alles inkl. Mitglieder/Kameras · caretaker: Tiere/Medizin/Logs schreiben ·
    guest: nur lesen.
- Farm-Daten sind privat: nur Mitglieder der Farm sehen sie (anders als das gemeinsame
  Pflanzen-/Insektenarchiv). Der App-Inhaber/Moderator sieht sie NICHT automatisch.
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
1. Tierbestand: Einzeltier oder Herde anlegen. Pflichtfelder: Geburtsdatum, Geschlecht (manuell),
   Tierart. Optional (später nachzutragen): Foto, Name (ohne Namen vergibt die App „Ziege 1“,
   „Huhn 2“ …) und Registriernummer (Ring/Ohrmarke; wenn angegeben, eindeutig je Farm; für Rind,
   Schaf, Ziege, Schwein und Pferd zeigt das Formular einen Hinweis zur Kennzeichnungspflicht).
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

AUSSER SCOPE (nicht bauen): Bezahlung/Abos, native Apps, Newsletter/Marketing-E-Mails,
Umzug auf ein anderes Framework oder einen anderen Hoster. (Konto-E-Mails wie
Passwort-Zurücksetzen nur, wenn in Phase A ausdrücklich entschieden.)

PHASE A – GRUNDLAGEN FÜR DIE ÖFFENTLICHE APP (vor dem Farm-Modul)
Ausgangslage: privates Familienmodell (erstes Konto = Inhaber, alle anderen starten
unfreigeschaltet; optionaler REGISTRATION_CODE; Inhaber verwaltet unter /benutzer).
- A1 Freie Registrierung (UMGESETZT – Entscheidungen: sofort nutzbar per OPEN_REGISTRATION,
  kein E-Mail-Versand, Cloudflare Turnstile; Details in replit.md):
  - Neue Konten sind ohne Einladung sofort nutzbar; der Schalter dafür ist eine ENV-Variable
    (z. B. OPEN_REGISTRATION=true), damit der Familienbetrieb jederzeit zurück kann.
  - Der Schutz vor Konto-Übernahme alter, passwortloser Konten bleibt unverändert.
  - Missbrauchs- und Kostenschutz:
    - Das Scan-Tageslimit pro Nutzer bleibt.
    - Neu: ein globales Tagesbudget für Gemini-Aufrufe.
    - Neu: Registrierungs-Limit pro IP.
    - Bot-Schutz (z. B. Cloudflare Turnstile), sofern entschieden.
  - Zustimmung zu Datenschutzerklärung/Nutzungsbedingungen beim Registrieren speichern
    (Zeitpunkt + Version).
  - Seiten Impressum und Datenschutz in der App, ohne Login erreichbar.
- A2 Konto-Löschung in der App (UMGESETZT – "Meine Scans"-Fotos liegen nur auf dem Gerät,
  daher gibt es auf Cloudinary nichts, das allein einem Konto gehört; Details in replit.md):
  - Unter Profil "Konto löschen" mit Passwort-Bestätigung (Google-Konten: Bestätigung per
    Eingabe der E-Mail).
  - Zentrale Funktion deleteAccount(userId) in einer Transaktion:
    - löscht favorites, tasks, care_guides, push_subscriptions, plant_scans,
      insect_scans und scan_attempts des Nutzers;
    - anonymisiert scanned_by_user_id in plants/insects auf NULL, denn das gemeinsame
      Archiv bleibt erhalten;
    - entfernt Fotos, die nur diesem Nutzer gehören, aus Cloudinary (nicht fatal,
      Fehler werden protokolliert);
    - löscht zuletzt die users-Zeile.
  - Das Inhaber-Konto kann sich nicht selbst löschen.
  - Das Löschen durch den Inhaber unter /benutzer nutzt dieselbe Funktion.
  - Test: Nach dem Löschen gibt es keine Zeile mit der userId mehr.
  - Farm-Daten (UMGESETZT): Eine Farm, deren letztes Mitglied geht, wird mitgelöscht; verliert sie
    ihren letzten Admin, wird das am längsten dabei gebliebene Mitglied Admin.
- A3 Moderation (UMGESETZT – Details in replit.md):
  - "Melden" an allen öffentlich sichtbaren Inhalten: Archiv-Fotos von Pflanzen/Insekten,
    Benutzernamen in der Rangliste.
  - Neue Tabelle reports (Meldender, Inhaltstyp, Inhalts-ID, Grund, Status, Zeitpunkt).
  - Moderationsseite für den Inhaber, aufgebaut auf vorhandenen Werkzeugen:
    - Bildsperre (image_locked),
    - Foto entfernen,
    - Benutzername zurücksetzen,
    - Konto sperren (approved=false).
  - Einfacher Wortfilter für Benutzernamen.
  - Gesperrte Konten sehen beim Login eine klare deutsche Meldung.

PHASE B – UMBENENNUNG ZU LITTLE FARMING (nach A3, vor dem öffentlichen Start)
Entschieden: Name "Little Farming" (auch als Kurzname auf dem Handy), Domain littlefarming.de
(vorhanden), App-Symbol (Blatt) vorerst unverändert.
- B1 Name & Wording (UMGESETZT): siehe replit.md, Kopfabschnitt.
- B2 Umzug auf littlefarming.de (Umzugshelfer UMGESETZT; Domain in Render verifiziert, Hauptadresse
  https://littlefarming.de, www leitet weiter; Umstellung über PUBLIC_BASE_URL – Details in replit.md): Domain in Render hinzufügen + DNS; PUBLIC_BASE_URL,
  Google-Callback und Cron-URL umstellen. Umzugshelfer: Die alte Adresse öffnet
  littlefarming.de als eigenes Fenster und übergibt Warteschlange und "Meine Scans"-Fotos per
  postMessage (nur an die neue Herkunft, mit Bestätigung des Empfangs); erst danach leitet die
  alte Adresse dauerhaft weiter. Hinweis zur Neuinstallation der PWA.
- Sichtbarer Name überall "Little Farming":
  - Kopfzeile und Anmeldemaske
  - PWA-Manifest (name, short_name, Icons)
  - Seitentitel
  - Push-Texte
  - Rechtsseiten
- "Kräuterhexe" bleibt als Name des Pflanzen-Moduls sichtbar (z. B. Bereich/Navigation
  "Kräuterhexe"), so wie später "Meine Farm" für die Tiere.
- Startseite/Navigation so ordnen, dass Little Farming der Rahmen ist und die Module darunter
  liegen. Bestehende Routen bleiben erreichbar; wo sich Pfade ändern, gibt es Weiterleitungen.
- Domain: neue Domain für Little Farming auf den Render-Dienst legen; die alte Adresse leitet
  dauerhaft weiter. Google-Login-Callback, PUBLIC_BASE_URL und Cron-Job-URL auf die neue Domain
  umstellen.
- Installierte PWAs: Hinweis bzw. sanfter Übergang, damit niemand seine Offline-Warteschlange
  verliert (IndexedDB ist an die Domain gebunden – vor dem Umzug leeren lassen oder die alte
  Domain so lange parallel bedienen, bis die Warteschlangen leer sind).
- NICHT umbenennen: Repo, Paketnamen, Datenbank (Tabellen/Spalten), Cloudinary-Ordner,
  Render-Dienstname – das bringt nur Risiko und keinen Nutzen für die Nutzer.

VORGEHENSWEISE (zuerst Phase A1 → A2 → A3, dann Phase B, dann das Farm-Modul; streng sequenziell; nach JEDEM Schritt anhalten, kurz berichten und auf mein
OK warten; jeder Schritt auf einem eigenen Branch mit Pull Request gegen main)
- Schritt 1 – Fundament (UMGESETZT; Stall-Aufgaben kamen mit Schritt 4): Drizzle-Schemas (Farm-Ebene + Datenmodell), OpenAPI-Spec,
  Codegen, requireFarm() + Isolationstest. Keine UI.
- Schritt 2 – Farm & Rollen (UMGESETZT): automatische eigene Farm, Mitglieder verwalten, Farm wechseln,
  Navigationspunkt "Meine Farm" mit leerem Dashboard.
- Schritt 3 – Tierbestand (UMGESETZT): CRUD für Tiere/Herden inkl. Foto (Cloudinary, downscaleFile);
  Archivieren statt Löschen, Ring-/Ohrmarke eindeutig je Farm, Gäste nur lesen. Details in replit.md.
- Schritt 4 – Medizin, Gewicht, Aufgaben (UMGESETZT): CRUD, Gewichtsdiagramm mit Warnlogik,
  Stall-Aufgaben mit Push, Veterinäramt-Export (CSV + PDF). Entscheidung: eigene Tabelle
  farm_tasks statt tasks zu erweitern (Begründung in replit.md), derselbe Cron.
- Schritt 5 – KI (UMGESETZT): Arterkennung, Haltungs-Wiki, Futteranalyse inkl. Abgleich mit dem
  Pflanzenarchiv. Details in replit.md.
- Schritt 6 – IoT (UMGESETZT): Kamera-Verwaltung (Secret nur einmal anzeigen), Webhook, Relais,
  Ereignisliste, Push. Der kostenlose Render-Tarif schläft nach ~15 Minuten ein (30–60 s
  Aufwachzeit). ENTSCHEIDUNG: vorerst ohne Echtzeit-Anspruch gebaut (Hinweis in der App);
  bezahlter Tarif oder lokale Auslösung am Relais später. Details in replit.md.

DEFINITION OF DONE pro Schritt: `pnpm run typecheck` fehlerfrei, `pnpm run build` erfolgreich,
alle Tests grün (alte und neue), bestehende Funktionen stichprobenartig im Browser geprüft,
replit.md aktualisiert, keine TODO-Platzhalter im gelieferten Code.
```
