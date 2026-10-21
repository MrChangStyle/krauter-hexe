# Hof-Dashboard

Die Startseite „Hof“ zeigt einen kompakten Überblick über den Hof. Gescannt wird über den runden Knopf in der unteren Leiste; die Scan-Abläufe erscheinen weiter auf dieser Seite (`/?scan=…`). Solange ein Ablauf offen ist, ist das Dashboard ausgeblendet.

## Aufbau (`components/hof-dashboard.tsx`)

1. **Begrüßung**: „Hallo …“ und ein Satz. Gibt es einen offenen Pflege-Guide, ist es ein Hinweis darauf.
2. **Wetter** als schmaler Streifen:
   - Heute mit Höchst- und Tiefstwert, Regen und Böen.
   - Die nächsten zwei Tage klein daneben.
   - Darunter die erste Warnung des Hofs (Frost, Hitze, Sturm …).
   - Ohne Standort ein Hinweis, ihn auf der Tiere-Seite festzulegen.
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

## Nächster Schritt: selbst anpassen

- **Dashboard anpassen**: eine Liste aller `WIDGETS` mit Name und Beschreibung. Dort kann man ein- und ausschalten und die Reihenfolge ändern.
- **Speichern** pro Konto auf dem Server, damit es auf allen Geräten gleich aussieht. Die Hof-Seite liest dann dieses Layout statt `DEFAULT_LAYOUT`.
- **Premium-Widgets** (`premium: true`), zum Beispiel ein KI-Widget, sind nur mit Premium auswählbar.
- **Neues Modul = neues Widget**: einen Eintrag in `WIDGETS` und eine Komponente in `RENDER` ergänzen.
