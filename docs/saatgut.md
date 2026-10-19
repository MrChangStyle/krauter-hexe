# Saatgut

Die Seite `/beete/saatgut` führt den Saatgut-Vorrat des Hofs: gekaufte Tüten, getauschte und selbst gewonnene Samen. Feste Regeln, keine KI (`lib/seeds.ts`).

## Keimfähigkeit (`SEED_LIFE`)

Für jede Kultur des Gartenkatalogs ist hinterlegt, wie viele Jahre nach der Ernte das Saatgut gut keimt. Das sind übliche Tabellenwerte für kühl, trocken und dunkel gelagertes Saatgut, zum Beispiel:

| Jahre | Kulturen |
|---|---|
| 1 | Zwiebel, Pastinake, Schnittlauch (Kartoffel und Knoblauch als Pflanzgut) |
| 2 | Petersilie, Lauch, Mais, Salbei, Rosmarin, Bohnenkraut |
| 3 | Möhre, Bohnen, Erbse, Salat, Spinat, Feldsalat, Paprika, Chili |
| 4 | Tomate, Kohl, Rote Bete, Mangold, Radieschen, Basilikum, Zucchini |
| 5–6 | Kürbis, Gurke |

Unbekannte Kulturen bekommen 3 Jahre (`DEFAULT_LIFE`).

## Status

- „verwendbar bis“ von der Tüte geht vor; sonst gilt das Erntejahr plus die Jahre der Kultur.
- **Keimt gut**: vor dem letzten guten Jahr.
- **Keimprobe empfohlen**: im letzten guten Jahr, oder Alter unbekannt.
- **Zu alt?**: danach. Saatgut keimt dann oft noch, aber schlechter – also Keimprobe machen oder dichter säen.
- Eine **Keimprobe** aus den letzten 365 Tagen geht vor:
  - ab 70 % keimt das Saatgut gut,
  - ab 50 % ist eine Probe empfohlen,
  - darunter „Keimt schlecht“.
- Aufgebrauchte (Menge 0) und archivierte Tüten werden extra gezeigt.

## Beetplan

Die Bepflanzungen der Beete ab der laufenden Saison werden mit dem Vorrat verglichen. Daraus entstehen zwei Listen:
- **Fehlt noch**: Kulturen ohne Saatgut im Vorrat. Ein Tipp darauf legt die Tüte gleich an; Kartoffel, Knoblauch, Erdbeere, Rhabarber und Minze sind als „Pflanzgut“ markiert.
- **Nur altes Saatgut**: Kulturen, die nur alte oder schlecht keimende Tüten haben.

## Samen gewinnen

Jede Kultur hat eine Art der Vermehrung. Die Karte zeigt dazu einen Satz, außer bei F1-Hybriden, die nicht sortenecht nachkommen:
- **Selbstbefruchter** (`easy`): z. B. Tomate, Bohne, Erbse, Salat.
- **Kreuzt sich, Abstand nötig** (`isolate`): z. B. Kürbisgewächse, Mais, Kohl in Blüte, Kräuter.
- **Zweijährig** (`biennial`): z. B. Möhre, Rote Bete, Zwiebel, Lauch.
- **Vegetativ** (`vegetative`): Knollen, Zehen, Ausläufer oder Teilung.

## Offen

- Fachliche Prüfung der Jahre.
- Saatgut beim Säen automatisch abbuchen.
- Tauschbörse zwischen Höfen.
