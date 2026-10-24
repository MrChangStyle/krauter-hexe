# Ernte-Auswertung

`/beete/ernte` zeigt, was eine Gartensaison gebracht hat: je Kultur und je Beet, mit dem Ladenwert und im Vergleich zu den Vorjahren. Man erreicht die Seite über die Kachel unter „Beete planen“, über „Je Beet und Sorte“ im Garten-Teil von Ertrag & Bilanz oder über die Suche. Feste Regeln, keine KI (`lib/harvestReport.ts`).

## Was gezählt wird

- **Grundlage:** die Ernten aus `harvest_logs`, eingetragen am Beet bei der Pflanzung. Eine Ernte zählt zur **Saison ihrer Pflanzung**, wie im Beet-Architekten. Ertrag & Bilanz zählt dagegen nach dem Kalenderjahr des Erntetags.
- **Wert:** Küchenernte zum Preis der Kultur, Futter zum Preis von zugekauftem Futtergemüse. Es gelten die Preise des Hofs unter Ertrag, sonst die Vorschläge (`priceOf`, `DEFAULT_PRICES`).
- **Fläche:** die Felder der Pflanzung beim Ernten, je 30 × 30 cm. Eine Pflanzung zählt einmal, auch wenn sie mehrmals beerntet wurde. Daraus folgen kg/m² und €/m².
- **Je Kultur:** kg (davon Futter), kg/m², Wert, Anzahl Ernten, die Beete, die Menge im Vorjahr.
- **Je Beet:** kg, Wert, €/m² der abgeernteten Fläche und die Kulturen nach Menge.
- **Hat sich gelohnt:** die bis zu drei Kulturen mit dem höchsten Ladenwert je m².
- **Diagramme:** kg je Erntemonat, und bis zu fünf Saisons im Vergleich.
- **Summe:** kg mit Veränderung zum Vorjahr, Ladenwert.
- Die Saisonwahl bietet alle Saisons mit Ernten.

## Technik

- `GET /api/farms/:farmId/garden/seasons/:season/harvest-report` liefert `HarvestReport`. Lesen dürfen alle Mitglieder mit der Freigabe „Garten“.
- Tests: `harvestReport.test.ts` (Werte, Fläche einmal je Pflanzung, Vorjahr, fünf Saisons, leere Saison) und `gardenHarvests.integration.test.ts` (Route, eigener Preis, Vorjahr, fremde Farm, ungültige Saison).
