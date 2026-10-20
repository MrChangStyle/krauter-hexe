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

## Abbuchen beim Säen

Wird im Gartenkalender ein Saattermin („vorziehen“ oder „direkt säen“) abgehakt, nimmt die App das Saatgut aus dem Vorrat (`takeSeedForSowing`).
- **Welche Tüte**: Saatgut derselben Kultur in Korn oder Gramm, nicht archiviert und nicht leer. Bevorzugt wird Saatgut, das noch gut keimt, darunter das älteste zuerst.
- **Wie viel**:
  - Pflanzen der Bepflanzung = Fläche (w × h Felder à 30 × 30 cm) ÷ (Pflanz- × Reihenabstand), mindestens 1.
  - Pro Pflanze 1,5 Samen beim Vorziehen und 2 beim Direktsäen.
  - In Gramm über das Tausendkorngewicht (`SEED_TKG`), mindestens 0,1 g.
  - Nie mehr, als da ist.
- Tüten bucht die App nicht ab, weil die Zahl der Samen darin unbekannt ist.
- Was abgebucht wurde, steht in `seed_uses`. Nimmt man den Haken zurück, kommt es zurück in die Tüte. Ein zweiter Haken bucht nichts mehr ab.
- Der Haken (`PUT …/checks/:kind`) antwortet jetzt mit `200 { seedUse }`; die App zeigt dann „Saatgut abgebucht: 24 Korn Radieschen – noch 176 Korn im Vorrat“.

## Offen

- Fachliche Prüfung der Jahre und Tausendkorngewichte.
- Tauschbörse zwischen Höfen.
