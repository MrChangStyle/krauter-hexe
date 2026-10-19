# Ertrag & Bilanz

Die Seite `/farm/ertrag` zeigt, was Tiere und Garten im Jahr bringen und was das im Laden kosten würde. Feste Regeln, keine KI (`lib/farmYields.ts`).

## Erfassen

- **Tierprodukte** (`farm_yields`): Eier (Stück), Milch (l), Fleisch (kg) und Wolle (kg), jeweils mit Datum und optional der Gruppe. Das Eintragen geht schnell oben auf der Seite.
- **Garten**: Die Ernten kommen aus `harvest_logs` und werden wie bisher am Beet eingetragen, als Küche oder als Futter.

## Wert

- Preise in € je Einheit (`DEFAULT_PRICES`), grob auf Bio- bzw. Hofladen-Niveau, zum Beispiel:
  - Ei 0,40 €
  - Milch 1,50 €/l
  - Fleisch 14 €/kg
  - Tomate 4 €/kg
  - Kartoffel 1,50 €/kg
  - Kräuter 20–30 €/kg
- Jeder Hof kann jeden Preis überschreiben (`farm_prices`, Schlüssel `product:eggs`, `crop:tomate`, `fodder`); ein leeres Feld setzt den Vorschlag zurück.
- Ernte als Futter zählt zum Preis von zugekauftem Futtergemüse (0,30 €/kg). Kulturen ohne eigenen Preis zählen 3 €/kg; Ringelblume und Tagetes zählen nicht.
- `summarize()` ist rein: Zeilen je Kultur und Produkt, Wert je Monat, Summe. Daneben steht die Summe des Vorjahrs zum Vergleich.

## Kennzahlen (nur im laufenden Jahr)

- **Legeleistung**: Eier der letzten 30 Tage geteilt durch Hennen (Geflügel weiblich oder unbekannt, nicht archiviert) und 30 Tage.
- **Futterkosten im Monat**: Schätzung des Futterplaners (`feedStock().costs`) aus den heutigen Rationen und den Preisen im Vorrat. Fehlen Preise, steht das dabei.

## Offen

- Weitere Ausgaben (Tierarzt, Einstreu, Saatgut) als eigene Kostenposten.
- Verkäufe und echte Einnahmen getrennt vom Eigenverbrauch.
