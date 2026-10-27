# Spracheingabe für Notizen

Wer im Stall steht, hat oft keine Hand frei zum Tippen. Neben den längeren Notizfeldern sitzt deshalb ein kleiner Knopf **„Halten & sprechen“** (`components/dictate-button.tsx`).

**Gedrückt halten zum Sprechen – überall in der App:** Man hält den Knopf gedrückt, solange man spricht, und lässt los, wenn man fertig ist (`hooks/use-push-to-talk.ts`). Während der Aufnahme ist der Knopf rot, pulsiert und zeigt „Loslassen = fertig“. Die Aufnahme endet nur durch Loslassen: Browser beenden die Spracherkennung von sich aus nach einer Pause oder nach etwa einer Minute – solange der Knopf gehalten wird, startet sie sofort wieder. Nur wenn das Mikrofon verboten ist oder die Erkennung dreimal hintereinander gleich wieder abbricht, hört sie auf. Das gilt für alle Spracheingaben: Notizfelder, Hof-Aufgaben, Alltagsnotizen, Kommentare und die Feedback-Blase.

## Wo

| Feld | Seite | Länge |
|---|---|---|
| Behandlung, Notizen | Gesundheitsakte eines Tiers | je 2000 |
| Notiz zur Durchsicht | Bienenvolk | 1000 |
| Notiz | Vorratskammer | 500 |
| Notiz | Weide (Weidetagebuch) | 500 |
| Notiz | Stallaufgabe | 200 |
| Neue Aufgaben, frei gesprochen (KI-Aufgabenplan) | Hof-Aufgaben | 2000 |
| Aufgabe, Notiz | Hof-Aufgabe bearbeiten | 80 / 200 |
| Kommentar | Hof-Aufgabe | 300 |
| Neue Notizen, frei gesprochen (KI-Liste) | Alltagsnotizen | 2000 |

## Wie

- Es ist dieselbe Spracherkennung wie beim Feedback (`lib/speech.ts`, Deutsch, im Browser). Jeder erkannte Satz wird an den Text angehängt; danach lässt sich alles wie gewohnt verbessern.
- Was über die Länge des Feldes hinausgeht, wird abgeschnitten.
- Loslassen beendet das Diktat; was bis dahin gesagt wurde, kommt noch an. Es endet auch, wenn das Formular schließt oder der Finger vom Knopf rutscht.
- **Listen als Fließtext:** Der große Knopf von Hof-Aufgaben und Alltagsnotizen hängt jede Pause als Fortsetzung an – ohne Punkt und ohne neuen Satzanfang (`appendPhrase` mit `flow`). Die Spracherkennung beendet eine Phrase bei jeder Denkpause; die KI liest die Liste nach dem Sinn. Bei den übrigen Feldern beginnt nach einer Pause ein neuer Satz.
- **Gesprochene Satzzeichen** werden zu Zeichen (`spokenPunctuation` in `lib/speech.ts`): „Komma“ → „,“, „Punkt“ → „.“, „Doppelpunkt“, „Fragezeichen“, „Ausrufezeichen“, „neue Zeile“/„Absatz“ → Zeilenumbruch. Nur ganze Wörter – „Treffpunkt“ bleibt. Gilt für alle Spracheingaben.
- Ein kurzer Tipp (unter 0,6 Sekunden, nichts gehört) zeigt nur den Hinweis „Gedrückt halten“.
- Langes Drücken öffnet auf dem Handy kein Menü und markiert keinen Text (`touch-action`, kein Kontextmenü).
- Mit der Tastatur: Leertaste oder Enter gedrückt halten.
- Ohne Mikrofonfreigabe erscheint ein Hinweis, dass man auch tippen kann. Wo der Browser keine Spracherkennung hat (z. B. Firefox), fehlt der Knopf.
- Nichts davon geht an den Server der App; die Erkennung macht der Browser (bei Chrome über den Dienst von Google).
