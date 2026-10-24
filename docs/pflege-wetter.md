# Wetterabhängige Pflege

Der Pflegeplan (`/aufgaben`) richtet sich nach Jahreszeit und Wetter. Die Regeln stehen in `lib/careWeather.ts`; es gibt keine KI.

## Standort der Pflanze

- Jede Pflegeaufgabe ist **drinnen** (Standard) oder **draußen** (Balkon, Garten), wählbar im Formular und gespeichert in `tasks.outdoor`. Draußen-Aufgaben tragen das Abzeichen „Draußen“.
- Das Wetter kommt vom Hof des Kontos: Gemeint ist der erste Hof mit Standort, Admin-Höfe zuerst; fehlt der Hof-Standort, gilt der eines Beets (`farmLocation`). Ohne Standort zeigt die Karte oben einen Link zum Wetter auf der Hof-Seite.

## Regeln

- **Winter (November bis Februar)**, wenn „Pflege nach Jahreszeit“ an ist (`user_settings.seasonal_care`, Standard an):
  - **Gießen:** Der Abstand wird um die Hälfte länger, aufgerundet. Aus „alle 4 Tage“ wird „alle 6 Tage“, aus 1 Woche werden 11 Tage.
  - **Düngen:** pausiert bis zum 1. März.
  - Besprühen und Drehen bleiben, wie sie sind.
  - Die Karte zeigt „Winter: seltener gießen …“ bzw. „Winterpause …“.
- **Regen:** Ist eine Gieß-Aufgabe **draußen** fällig und sagt die Vorhersage für heute mindestens 5 l/m² voraus, gilt sie als vom Regen erledigt. Es kommt kein Push, der nächste Termin rückt weiter, und die Karte zeigt „Heute hat der Regen gegossen.“ (`tasks.rain_skipped_on`). Ohne Standort oder Vorhersage wird ganz normal erinnert.
- **Frost in Sicht:** Wer aktive Draußen-Aufgaben hat, bekommt einen Push, sobald in den nächsten 3 Tagen eine Nacht ≤ 0 °C kommt. Er nennt die kälteste Nacht: „Frost in Sicht – … frostempfindliche Pflanzen reinholen oder abdecken“. Danach ruht der Hinweis 45 Tage (`user_settings.frost_notice_on`), damit er im Herbst und bei Spätfrost im Frühjahr je einmal kommt. Geprüft wird einmal am Tag ab 7:30 Uhr.
- Alle Pushes laufen unter dem Thema „Pflanzenpflege“ (`plant-care`) und lassen sich dort abschalten.

## Technik

- **Aufgaben-API:** `GET /tasks` (und die Antworten von Anlegen, Bearbeiten, Erledigen) liefern zusätzlich `outdoor`, `rainSkippedOn`, `nextDueDate` und `careNote`. Die App zeigt „Nächstes Mal“ und nutzt `nextDueDate` für die lokale Erinnerung. Anlegen und Bearbeiten nehmen `outdoor` an.
- **Wetter-Karte:** `GET /care/weather` liefert `hasLocation`, `today`, `rainWaters` und `frost`.
- **Einstellungen:** `/settings` hat jetzt auch `seasonalCare`.
- **Erinnerungen:** `triggerDueNotifications` prüft Pflegeaufgaben mit `careDue` (statt `isTaskDue`), lässt Regen gießen und ruft `sendFrostNotices` auf.
- **Tests:**
  - `careWeather.test.ts`: Regeln.
  - `careWeather.integration.test.ts`: Routen, Regen beim Erinnerungslauf, Frost einmal in 45 Tagen, kein Standort, Einstellung aus.
