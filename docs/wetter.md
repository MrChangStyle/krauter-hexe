# Wetter für den Hof

Baustein von Little Farming (Ausbau des Wetters, nach dem Futterplaner). Die Frostwarnung
für Beete gibt es seit dem Beet-Architekten; hier kommt das Wetter für den ganzen Hof und
die Tiere dazu.

## Entscheidungen

- **Daten:** Vorhersage des Deutschen Wetterdienstes (DWD, offene Daten) über Bright Sky,
  wie bei den Frostterminen der Beete. Kostenlos, ohne Schlüssel; Quellenangabe in der App.
- **Standort des Hofs:** Postleitzahl (OpenStreetMap Nominatim) oder die Position des Handys,
  auf 0,1° gerundet (etwa 10 km) – keine Adresse. Ohne eigenen Standort gilt der eines Beets.
  Festlegen darf ihn ein Admin des Hofs.
- **Warnungen nach festen Regeln**, für heute und morgen, je nach Tierarten des Hofs:
  - Frost (≤ 0 °C): Tränken frostfrei, Einstreu; Meerschweinchen frostfrei unterbringen.
  - Strenger Frost (≤ −10 °C): Ställe zugfrei, Tränken oft wechseln, mehr Raufutter;
    Kaninchen-Außenställe isolieren, Meerschweinchen ins Haus.
  - Hitze (≥ 30 °C, mit Kaninchen oder Meerschweinchen ≥ 28 °C): Schatten, Wasser, Arbeit
    in die Morgenstunden; Weidetiere brauchen Schatten.
  - Sturm (Böen ≥ 75 km/h): Netze, Planen und Ausläufe sichern.
  - Starkregen (≥ 20 l/m² am Tag): trockene Unterstände, Staunässe.
  - Garten (wenn dieses Jahr etwas in den Beeten steht): heiß (≥ 28 °C) und zwei Tage kein
    Regen → morgens oder abends gießen.
- **Push** um 07:30 an Admins und Betreuer, einmal je Hof und Tag. Eine Warnung, die gestern
  schon kam, kommt nicht noch einmal – eine Frostperiode meldet sich einmal, ein strengerer
  Frost oder ein Sturm wieder. Bei Frost oder Sturm heißt der Push „Unwetter-Warnung“.

## Umgesetzt

Wetter-Streifen oben auf der Hof-Seite: heute und die nächsten zwei Tage, die erste Warnung. Ein Tipp klappt die Woche auf (sieben Tage mit Tiefst- und Höchstwert, Regen und Böen), dazu alle Warnungen und „Standort ändern“. Ohne Standort steht dort das Formular dafür. Push-Nachrichten öffnen die Hof-Seite. API: `GET /farms/:id/weather`,
`PUT /farms/:id/location`, Push über den Cron (`sendWeatherDigests`, Tabelle
`weather_digest_log`).

Später denkbar: amtliche DWD-Unwetterwarnungen (CAP) zusätzlich zur eigenen Regel, Hitze-
und Frostverlauf über mehrere Tage, Wetter im Futterplaner (Mehrbedarf bei Kälte).
