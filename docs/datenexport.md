# Meine Daten herunterladen

Unter **Mehr → Konto** lädt „Meine Daten herunterladen“ eine JSON-Datei `little-farming-daten-JJJJ-MM-TT.json` herunter: alles, was Little Farming zu deinem Konto speichert (Recht auf Auskunft und Datenübertragbarkeit, Art. 15 und 20 DSGVO).

## Was drin ist

- **account:** dein Profil (E-Mail, Name, Benutzername, Zustimmung zu den Nutzungsbedingungen, …).
- **personal:** alle Tabellen, die zu deinem Konto gehören – genau die Liste, die auch beim Löschen des Kontos gilt (`PERSONAL_TABLES` in `accountDeletion.ts`): Favoriten, Aufgaben, Pflege-Guides, Scan-Verlauf, Einstellungen, Feedback, Grow-Tagebuch mit Pflanzen, Messungen und Kosten, …
- **scannedByYou:** Arten, die du dem gemeinsamen Archiv hinzugefügt hast.
- **memberships:** deine Farm-Mitgliedschaften mit Rolle und Freigaben.
- **farmsYouRun:** für jede Farm, die du als Admin leitest, alle Farm-Daten (jede Tabelle mit `farm_id`, aus dem Datenbankkatalog gelesen – neue Module sind automatisch dabei). Farmen, auf denen du nur Mitglied bist, gehören dem Admin; von dort steht nur deine Mitgliedschaft in der Datei.

## Was fehlt

- Geheimnisse: Passwort-Hash, Push-Schlüssel, Kamera-Geheimnisse und Relais-Adressen.
- Große Kopien: eingebettete Fotos (Fotos mit Adresse stehen als Link), Umzugspakete, Protokolle verschickter Erinnerungen.
- Fotos, die nur auf deinem Gerät liegen („Meine Scans“) – die nimmt die Umzugs-/Sicherungsdatei mit (`docs/datensicherung.md`).

## Technik

- `GET /api/auth/user/export` (`lib/dataExport.ts`, `routes/data-export.ts`), für jedes angemeldete Konto, höchstens 5-mal pro Stunde. Ein Datei-Download, deshalb nicht im generierten Client; die App holt die Datei per `fetch` und zeigt Ablehnungen als Meldung.
- Test: `dataExport.integration.test.ts` (eigene Daten drin, keine Geheimnisse, nichts von anderen).
- **Regel:** Neue Tabellen mit `user_id` kommen in `PERSONAL_TABLES` (dann sind sie automatisch im Export); Spalten mit Geheimnissen so benennen, dass `LEFT_OUT` in `lib/dataExport.ts` sie erkennt, oder sie dort ergänzen.
