# Benachrichtigungen

Unter Mehr → **Benachrichtigungen** schaltet man Push für das Gerät ein. Darunter legt jedes Konto fest, **welche** Benachrichtigungen kommen und **wann Ruhe** ist. Diese Einstellungen gelten für alle Geräte des Kontos.

## Themen

| Thema | Wofür |
|---|---|
| Pflanzenpflege (`plant-care`) | Pflegeplan, Pflege-Guides |
| Gartenkalender (`garden`) | Säen, pflanzen, ernten |
| Stall-Aufgaben (`farm-tasks`) | fällige Aufgaben im Stall |
| Futtervorrat (`feed`) | rechtzeitig nachkaufen |
| Arzneimittel (`medicines`) | Ablaufdaten |
| Zucht (`breeding`) | Schritte, Geburt, Schlupf |
| Pflichten (`duties`) | Meldungen und Fristen |
| Raubtier-Alarm (`wildlife`) | Kameras, kommt **auch in der Ruhezeit** |
| Wetterwarnungen (`weather`) | Frost, Hitze, Sturm, Starkregen |
| Grow (`grow`) | Schritte und Wetter fürs Zelt |
| Betreiber (`admin`) | neues Feedback, Fehler, neuer Tester angemeldet (mit „kann sofort loslegen“ oder „wartet auf deine Freischaltung“) (nur der Betreiber sieht den Schalter) |

Angezeigt werden nur die Themen von Modulen, die das Konto eingeblendet hat.

## Ruhezeit

- In der Ruhezeit (Standard 22:00–07:00 Uhr deutscher Zeit, auch über Mitternacht) kommt kein Push, außer dem Raubtier-Alarm.
- Erinnerungen, die in die Ruhezeit fallen, entfallen und werden nicht nachgeholt.

## Technik

- Spalten `user_settings.push_off` (jsonb), `quiet_start` und `quiet_end`.
- `GET/PUT /settings` liefert bzw. nimmt `pushOff` und `quietHours`.
- `sendPushToUser` prüft `payload.topic` zentral über `pushAllowed` (`lib/userSettings.ts`). Jeder Push trägt sein Thema, nur der Test-Push hat keins und kommt immer.
- **Regel:** Ein neuer Push bekommt ein Thema (`PushTopic` in der API, Liste in `lib/push-topics.ts`; ein Test hält beide gleich).
