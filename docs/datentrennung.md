# Datentrennung

Schritt 3 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Ziel ist, dass niemand Daten eines fremden Hofs oder fremden Kontos sieht oder ändert. Das wird nicht für einzelne Stellen gezeigt, sondern automatisch für **jeden** Endpunkt der App.

## Wie die App die Daten trennt

- **Hofdaten:**
  - Jeder Hof-Endpunkt hat `:farmId` und läuft über `requireFarm(minRole)` (`middlewares/requireFarm.ts`). Das Konto muss freigeschaltet und Mitglied genau dieses Hofs sein. Sonst kommt 404, so erfährt ein Fremder nicht einmal, ob es den Hof gibt.
  - Die Rolle muss reichen (Gast < Mitarbeiter < Admin), sonst 403.
  - Das Modul muss freigegeben sein (Modul-Freigaben), sonst 403.
  - Danach filtert jede Abfrage nach `req.farm.farmId`. So erreicht auch eine Tier- oder Beet-ID eines anderen Hofs nichts.
- **Persönliche Daten:** Pflegeplan, Pflege-Guides, Alltagsnotizen, Grow, Scans, Einstellungen und Favoriten hängen am Konto (`user_id`). Jede Abfrage filtert nach dem angemeldeten Konto.
- **Betreiber-Funktionen:** Die Verwaltung (Benutzer, Moderation, Entwürfe, Fehler, Premium) läuft über `requireOwner`.
- **Ohne Anmeldung:** Nur eine feste Liste von Endpunkten antwortet. Alle anderen geben 401 zurück.

## Wie das geprüft wird

Die Tests gehen den echten Router durch. Ein neuer Endpunkt ist damit automatisch dabei, ohne dass man den Test anpassen muss.

**`lib/farmIsolation.integration.test.ts`** (rund 165 Hof-Endpunkte): Es gibt zwei Höfe voller Demo-Daten, und für jeden Endpunkt gilt:

1. Ein Fremder bekommt bei Hof A immer 404.
2. Das Konto von Hof B verwendet auf seinem eigenen Hof die IDs der Datensätze von Hof A (Tier, Beet, Volk, Vorrat …). Dabei liest es nichts von A und ändert nichts an A.
3. Ein Gast von Hof A bekommt bei jedem Schreibzugriff 403. Ausgenommen ist nur das Verlassen des Hofs.
4. Ein Mitarbeiter ohne freigegebene Module bekommt bei jedem Modul-Endpunkt 403.

Nach jedem Durchgang muss jede Zeile von Hof A in allen Tabellen mit `farm_id` genau so sein wie vorher.

**`lib/accountIsolation.integration.test.ts`** (alle rund 320 Endpunkte):

1. Ohne Anmeldung antworten nur die öffentlichen Endpunkte (Liste `PUBLIC` im Test, jeder mit Grund). Alle anderen geben 401 zurück.
2. Jeder Betreiber-Endpunkt (`requireOwner`) weist ein normales Konto mit 403 ab.
3. Ein anderes Konto erreicht über keinen Endpunkt die Aufgaben, Pflege-Guides, Notizen oder Grow-Einträge eines Kontos, weder lesend noch schreibend.

Zur Probe habe ich eine Lücke eingebaut: Ein Gast durfte Vorräte löschen. Der Test hat das sofort gemeldet.

## Bei der Prüfung behoben (29.10.2026)

- **Wartungs-Endpunkte:** `POST /tasks/backfill-leaves`, `/care-guides/backfill-leaves`, `/care-guides/award-leaves` und `/leaderboard/recount-leaves` waren nur durch das Wartungspasswort geschützt. Eine Sperre nach Fehlversuchen gab es nicht. Jetzt muss zusätzlich der Betreiber angemeldet sein.
- **Archiv bearbeiten:** `PATCH /plants/:id` (Bearbeiten eines Archiv-Eintrags mit Wartungspasswort) ging ohne Anmeldung. Jetzt braucht es ein freigeschaltetes Konto, wie beim Löschen.

## Offen

- Fotos liegen bei Cloudinary unter nicht erratbaren Adressen, aber ohne Anmeldung abrufbar (übliches Vorgehen für Bild-CDNs). Für Tierfotos und Beetfotos ist das vertretbar. Signierte Adressen wären möglich, wenn es gewünscht ist.
