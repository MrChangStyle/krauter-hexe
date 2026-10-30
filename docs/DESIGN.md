# Design: einheitliches Bild in allen Modulen

Vorbild sind die Übersichten **Hof, Pflanzen und Tiere**: Kacheln mit farbigem Symbol, Name und kurzer Zeile darunter. Jedes Modul und jedes Untermenü soll so aussehen, damit die App ordentlich und professionell wirkt (Wunsch des Betreibers vom 30.10.2026).

## Regeln

- **Eine Quelle für das Aussehen eines Moduls:** `src/lib/module-look.ts` (`MODULE_LOOK`) legt je Modul Adresse, Symbol, Farbe, Name, Kurztext und übergeordneten Bereich fest. Die Kacheln der Übersichten (`tileOf`) und der Seitenkopf lesen beide daraus. Ein Modul sieht damit auf der Übersicht und auf seiner eigenen Seite gleich aus.
- **Seitenkopf** (`components/page-header.tsx`) auf jeder Modulseite:
  - oben der Zurück-Link zum Bereich (Hof, Pflanzen, Tiere, Mehr) oder zum Modul, zu dem eine Unterseite gehört;
  - die farbige Symbol-Kachel wie auf der Übersicht;
  - Titel = Name der Kachel;
  - darunter eine Zeile, wofür die Seite da ist;
  - rechts Platz für eine Aktion („Neue Aufgabe“, „Teilen“).
- **Untermenüs** eines Moduls als Kacheln im selben Raster (`HubGrid`, `HubTile`), nicht als Textlinks oder Listenzeilen.
- **Karten** mit `rounded-2xl border bg-card p-4`, Überschrift mit kleinem Symbol in der Modulfarbe.

## Schritte

| Schritt | Inhalt | Stand |
|---|---|---|
| **D1** | Modul-Aussehen an einer Stelle, Seitenkopf für alle Modulseiten (32 Seiten), Übersichten Pflanzen und Tiere lesen daraus | ✅ (#139) |
| **D2** | Untermenüs als Kacheln: Futterplaner, Beet-Architekt, Ertrag, Grow, Lexikon | offen |
| **D3** | Karten und Abstände vereinheitlichen (Ecken, Innenabstand, Überschriften) | offen |

## Gefunden bei der Prüfung (30.10.2026)

- Vier verschiedene Seitenköpfe: mit Überzeile „Meine Farm“, mit Symbol-Kachel, mittig mit großem Kreis (Pflanzendoc), mit Maskottchen (Kräuter-Hexe). Einige ohne Zurück-Link.
- Zurück-Links mit unterschiedlichen Namen für dasselbe Ziel („Tiere“, „Meine Farm“).
- Titel weichen von den Kachelnamen ab („Beete planen“ statt „Beet-Architekt“, „Arzneimittel-Vorrat“ statt „Arzneimittel“).
- Untermenüs teils als Listenzeilen (Futterplaner), teils als Textlinks (Beet-Architekt), teils als Karten.
- Karten mal `rounded-xl` (179-mal), mal `rounded-2xl` (82-mal).
