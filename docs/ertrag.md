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

## Ausgaben und Bilanz

- Ausgaben werden mit Datum, Betrag und Kategorie eingetragen (`farm_expenses`), optional mit einer Notiz. Kategorien: Futter, Tierarzt & Medizin, Einstreu, Saatgut & Pflanzen, Tierkauf, Geräte & Material, Sonstiges.
- `summarizeExpenses()` ist rein und summiert je Kategorie in fester Reihenfolge und je Monat.
- **Bilanz** = Wert der Erträge minus eingetragene Ausgaben.
- Die Futterkosten-Schätzung des Futterplaners wird **nicht** abgezogen. Echte Futterkäufe trägt man als Ausgabe „Futter“ ein, sonst würden sie doppelt zählen.

## Verkäufe

- Ein Verkauf hat einen Erlös in €, ein Datum und optional eine Menge (`farm_sales`). Er betrifft eines der eigenen Produkte (`product:eggs` …), eine geerntete Kultur (`crop:tomate`) oder etwas anderes mit Namen, z. B. „Eierlikör“.
- `summarizeSales()` ist rein und liefert:
  - den Erlös je Produkt,
  - den **Ladenwert des Verkauften**: Menge × Preis, nur für eigene Produkte mit Menge.
- **Selbst verbraucht** = Wert aller Erträge − Ladenwert des Verkauften (nie unter 0). Er zeigt, was die Familie im Laden gespart hat.
- **Bilanz** = selbst verbraucht + Erlöse − Ausgaben. Ohne Verkäufe ist das wie bisher Wert − Ausgaben.
