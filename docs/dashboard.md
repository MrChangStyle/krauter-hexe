# Hof-Dashboard

Die Startseite „Hof“ zeigt einen kompakten Überblick über den Hof. Gescannt wird über den runden Knopf in der unteren Leiste; die Scan-Abläufe erscheinen weiter auf dieser Seite (`/?scan=…`). Solange ein Ablauf offen ist, ist das Dashboard ausgeblendet.

## Aufbau (`components/hof-dashboard.tsx`)

1. **Begrüßung**: „Hallo …“ und ein Satz. Gibt es einen offenen Pflege-Guide, ist es ein Hinweis darauf.
2. **Wetter** als schmaler Streifen. Ein Pfeil zeigt, dass er aufklappt: Ein Tipp öffnet die 7-Tage-Vorhersage mit Temperaturbalken, Regen und Böen sowie alle Warnungen und „Standort ändern“.
   - Heute mit Höchst- und Tiefstwert, Regen und Böen.
   - Die nächsten zwei Tage klein daneben.
   - Darunter die erste Warnung des Hofs (Frost, Hitze, Sturm …).
   - Ohne Standort steht hier direkt das Formular (Postleitzahl oder Gerätestandort, nur für Admins des Hofs).
3. **Pflanzenretter**: eine Zeile mit dem eigenen Platz und den Blättern. Aufgeklappt zeigt sie die ersten vier, dazu den eigenen Platz, falls er nicht darunter ist.
4. **Widgets**, gruppiert nach **Pflanzen** und **Tiere**:
   - Jedes Widget hat ein kleines Symbol, einen Namen, eine Kennzahl und eine Zeile Text.
   - Ein Punkt zeigt an, wenn etwas Aufmerksamkeit braucht.
   - Ein Tipp öffnet das Modul.

## Widgets (`lib/dashboard.ts`)

`WIDGETS` ist die einzige Liste aller Widgets, `DEFAULT_LAYOUT` die Auswahl, mit der jedes Konto startet.

| Widget | Bereich | Standard | Zeigt |
|---|---|---|---|
| Pflegeplan | Pflanzen | ja | heute fällige Pflegeaufgaben |
| Beete | Pflanzen | ja | Säen, Pflanzen und Ernten der nächsten 7 Tage |
| Saatgut | Pflanzen | – | Samen zum Prüfen oder Aufbrauchen |
| Grow | Pflanzen | – | Pflanzen im Grow, nächster Schritt (ab 18) |
| Stall-Aufgaben | Tiere | ja | heute Fälliges |
| Tiere | Tiere | ja | Bestand nach Tierart |
| Pflichten | Tiere | ja | offene Meldungen, überschrittene Fristen |
| Futtervorrat | Tiere | ja | Futter, das bald leer ist |
| Arzneimittel | Tiere | ja | abgelaufene und bald ablaufende Mittel |
| Zucht | Tiere | ja | laufende Trächtigkeiten und Bruten mit Termin |
| Ertrag | Tiere | – | Bilanz des Jahres |

Die Daten kommen aus den bestehenden Endpunkten der Module. Für das Dashboard gibt es keinen eigenen Server-Teil. Widgets, auf die ein Konto keinen Zugriff hat (zum Beispiel ein Gast), zeigen „–“.

## Selbst anpassen

- Unter den Widgets steht **„Dashboard anpassen“**. Dort sind alle Widgets nach Pflanzen und Tiere gruppiert, jeweils mit Name und Beschreibung.
  - Mit dem Schalter blendest du ein Widget ein oder aus. Ein neu eingeschaltetes kommt ans Ende seines Bereichs.
  - Mit den Pfeilen änderst du die Reihenfolge innerhalb des Bereichs.
  - „Standard wiederherstellen“ setzt das Dashboard zurück.
- **Gespeichert pro Konto** auf dem Server in der Tabelle `dashboard_layouts` (eine Zeile pro Konto). Sie steht in `PERSONAL_TABLES` und wird mit dem Konto gelöscht.
  - `GET /dashboard` liefert `{ widgets }`; `null` heißt Standard.
  - `PUT /dashboard` mit `{ widgets: [...] }` oder `{ widgets: null }`.
  - Erlaubt sind nur die Ids aus `DashboardWidgetId` in der API. Doppelte fallen weg, ebenso Widgets, die es nicht mehr gibt.
  - Auch eine leere Liste ist eine gültige Wahl.
- Grow erscheint nur in Builds mit dem Grow-Modul.
- **Neues Modul = neues Widget**:
  1. Die Id in `DashboardWidgetId` (openapi.yaml) eintragen.
  2. Einen Eintrag in `WIDGETS` und eine Komponente in `RENDER` ergänzen.
  3. Ein Test prüft, dass beide Listen gleich sind.
- **Später**: Premium-Widgets (`premium: true`), zum Beispiel ein KI-Widget, sind nur mit Premium auswählbar.
