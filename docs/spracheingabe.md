# Spracheingabe für Notizen

Wer im Stall steht, hat oft keine Hand frei zum Tippen. Neben den längeren Notizfeldern sitzt deshalb ein kleiner Knopf **„Sprechen“** (`components/dictate-button.tsx`).

## Wo

| Feld | Seite | Länge |
|---|---|---|
| Behandlung, Notizen | Gesundheitsakte eines Tiers | je 2000 |
| Notiz zur Durchsicht | Bienenvolk | 1000 |
| Notiz | Vorratskammer | 500 |
| Notiz | Weide (Weidetagebuch) | 500 |
| Notiz | Stallaufgabe | 200 |

## Wie

- Es ist dieselbe Spracherkennung wie beim Feedback (`lib/speech.ts`, Deutsch, im Browser). Jeder erkannte Satz wird an den Text angehängt; danach lässt sich alles wie gewohnt verbessern.
- Was über die Länge des Feldes hinausgeht, wird abgeschnitten.
- Ein zweiter Tipp („Stopp“) beendet das Diktat; es endet auch, wenn das Formular schließt.
- Ohne Mikrofonfreigabe erscheint ein Hinweis, dass man auch tippen kann. Wo der Browser keine Spracherkennung hat (z. B. Firefox), fehlt der Knopf.
- Nichts davon geht an den Server der App; die Erkennung macht der Browser (bei Chrome über den Dienst von Google).
