# Suche

Das Lupen-Symbol oben in der Kopfzeile öffnet `/suche`. Ein Feld durchsucht alles auf einmal, die Ergebnisse kommen schon beim Tippen, sortiert nach Bereich:

- **In der App:** Seiten und Module nach Namen und Alltagswörtern, zum Beispiel „Wurmkur“ → Arzneimittel oder „gießen“ → Pflegeplan (`lib/search-pages.ts`, ohne Server). Ausgeblendete Module fehlen.
- **Pflanzen & Pilze**, **Insekten:** das gemeinsame Lexikon, nach deutschem und wissenschaftlichem Namen. Namen, die mit dem Suchwort beginnen, stehen oben.
- **Auf der aktiven Farm:**
  - für alle Mitglieder: Tiere (Name, Ohrmarke/Ring), Gruppen, Kontakte
  - nur mit der jeweiligen Freigabe (Modul-Freigaben): Beete und Saatgut, Arzneimittel, eigene Futtermittel
  - Nicht-Mitglieder sehen von einer Farm nichts.

Jedes Ergebnis führt direkt zur passenden Seite. Der Suchbegriff steht in der Adresse (`/suche?q=…`), damit „Zurück“ zur Ergebnisliste führt.

## Technik

- `GET /api/search?q=…&farmId=…` (`lib/search.ts`, `routes/search.ts`).
  - Ab 2 Zeichen, höchstens 6 Treffer je Gruppe.
  - `%` und `_` im Suchwort werden wörtlich genommen.
- Test: `search.integration.test.ts`. **Regel:** Neue Farm-Daten, die man suchen können soll, kommen in `lib/search.ts`, mit der passenden Freigabe-Prüfung.
