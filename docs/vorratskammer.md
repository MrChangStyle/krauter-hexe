# Vorratskammer

Das Modul „Vorratskammer“ (Bereich Pflanzen, Freigabe `pantry`) zeigt, was der Hof eingelagert hat und was bald weg muss. Man erreicht es über die Kachel auf der Pflanzen-Seite (`/vorrat`) oder über die Suche. Feste Regeln, keine KI (`lib/pantry.ts`).

## Vorräte

- **Ein Vorrat hat:**
  - Name und Art: eingekocht, eingefroren, getrocknet, eingelegt, fermentiert, Saft, Marmelade, Honig, Eier, Sonstiges,
  - Menge und Einheit (Glas, Beutel, Dose, Flasche, Stück, Portion, kg, g, l),
  - Lagerort (frei, mit Vorschlägen aus den eigenen Orten),
  - Herstellungstag, Mindesthaltbarkeit und Notiz.
- **Vorschlag für die Haltbarkeit**, je Art ab dem Herstellungstag. Sobald man selbst ein Datum einträgt, wird nichts mehr vorgeschlagen.

  | Art | Vorschlag |
  |---|---|
  | Eingekocht, getrocknet, eingelegt, Saft, Marmelade | 12 Monate |
  | Eingefroren | 9 Monate |
  | Fermentiert | 6 Monate |
  | Honig | 24 Monate |
  | Eier | 28 Tage |
  | Sonstiges | kein Vorschlag |

- **Aus der Ernte:** Beim Einlagern stehen die Ernten der letzten 120 Tage zur Wahl. Name, Kultur, passende Art und Einheit werden übernommen: Beeren und Bohnen eingefroren, Kräuter getrocknet, Gurken und Kohl eingelegt, sonst eingekocht. Der Vorrat merkt sich die Ernte (`harvest_id`, `crop_key`).
- **Entnehmen:** „1 Glas genommen“ ist ein Tipp. Mehr als da ist, geht nicht. Jede Entnahme wird gespeichert; die letzte lässt sich rückgängig machen, dann geht die Menge zurück. Beim Bearbeiten zählt die eingetragene Menge als jetziger Bestand.
- **Reihenfolge:** zuerst abgelaufen, dann „bald aufbrauchen“ (MHD in den nächsten 30 Tagen), dann der Rest nach Haltbarkeit. Aufgebrauchtes steht eingeklappt am Ende. Bei mehreren Lagerorten filtert eine Leiste nach Ort.

Schreiben dürfen Admins und Mitarbeiter, Gäste lesen.

## Push (Thema „Vorratskammer“)

Montags ab 7:30 Uhr: was in den nächsten 14 Tagen abläuft, das früheste zuerst. Höchstens fünf Vorräte werden genannt, dazu „und X weitere“. Es kommt einmal je Hof (`farm_push_log`, Thema `pantry`) an Admins und Mitarbeiter mit der Freigabe.

## Technik

- **Tabellen** (`lib/db/src/schema/pantry.ts`): `pantry_items` und `pantry_uses`. Die DDL steht in `pantrySchemaStatements.ts`.
- **API:** `GET/POST /api/farms/:farmId/pantry`, `PUT/DELETE /pantry/:itemId`, `POST /pantry/:itemId/take`, `DELETE /pantry/:itemId/uses/:useId`. Jede Änderung antwortet mit der ganzen Vorratskammer.
- **Suche:** Vorräte mit Bestand, nach Name und Lagerort.
- **Demo-Hof:** saure Bohnen, Kirschen (bald aufbrauchen) und Honig.
- **Tests:**
  - `pantry.test.ts`: Haltbarkeit, Status, Push-Text.
  - `pantry.integration.test.ts`: Routen, Entnehmen und Rückgängig, aus der Ernte, Rechte, Freigabe, Push.
  - `pantry-labels.test.ts`: dieselbe Haltbarkeit in der App, Art je Kultur.
