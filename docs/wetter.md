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

## Amtliche Warnungen des DWD

Zusätzlich zu den eigenen Regeln zeigt der Wetter-Streifen die amtlichen Warnungen des DWD für das Warngebiet des Hofs (Bright Sky `/alerts`, gleicher gerundeter Ort).

- **Welche:** Wetter- und Hitzewarnungen (Kategorie `met` und `health`), die gelten oder angekündigt sind. Testmeldungen, Entwarnungen und abgelaufene Warnungen fallen weg. Die schlimmste steht oben.
- **Anzeige:** über den eigenen Hinweisen, eingefärbt nach den Stufen des DWD: Wetterwarnung gelb, markantes Wetter orange, Unwetter rot, extremes Unwetter violett. Dazu Überschrift und Zeitraum („Heute 14:00 – 20:00“), mit einem Tipp der Text des DWD samt Handlungsempfehlung. Darüber steht das Warngebiet (z. B. „Berlin“). Weil der Ort auf etwa 10 km gerundet ist, kann das ein Nachbarort sein.
- **Push** (Thema „Wetter“) für **Unwetter und extremes Unwetter**: sofort beim nächsten Cron-Lauf, nicht erst morgens, an Admins und Betreuer von Höfen mit Tieren oder Beeten. Der DWD gibt eine Warnung bei jeder Änderung unter neuer Kennung neu heraus. Deshalb merkt sich die App Ereignis und ersten Tag (`weather_alert_log`) und schickt erst wieder, wenn die Warnung schlimmer wird. Ruhezeiten gelten wie bei jedem Push; eine Warnung in der Ruhezeit kommt danach nicht noch einmal.
- Die Warnungen werden je Ort 10 Minuten zwischengespeichert. Antwortet der Dienst nicht, fehlen sie einfach.
- API: `alerts` und `alertArea` in `GET /farms/:id/weather`. Push: `sendAlertPushes` im Cron.

## Frost- und Hitzeperioden

Ab **drei Tagen in Folge** mit Frost (Tiefstwert ≤ 0 °C) bzw. Hitze (Höchstwert ab der Hitzegrenze der Tiere), die heute oder morgen beginnen, kommt statt des einfachen Hinweises einer für die ganze Periode: „Frostperiode: 4 Tage in Folge Frost bis −6 °C (bis Fr 04.12.)“ mit Tipps für die Dauer (Vorrat an Heu, Einstreu und Futter, Wasserleitungen; bei Hitze Lüften, Fliegen und Madenbefall). Reicht sie bis ans Ende der Vorhersage, steht „und länger“ dabei. Strenger Frost kommt weiter einzeln. Auch der Push meldet eine Periode nur einmal (Arten `frostSpell`, `heatSpell`).

Mehrbedarf an Futter bei Kälte: siehe `docs/futterplaner.md`, „Wetter im Futterplaner“.
