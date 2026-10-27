# Hof-Aufgaben

Eine gemeinsame Liste für alles, was auf dem Hof ansteht: Eier einsammeln, Meerschweinchen Gras geben, Gänse füttern, Teichpumpe kontrollieren, mit dem Kescher die Federn aus dem Teich holen. Wer im Team ist, sieht dieselbe Liste, hakt ab und schreibt dazu, wenn etwas fehlt („Wir brauchen neue Eierkartons“).

## Wo

- **Auf dem Hof** direkt unter „Pflanzenretter“ die quadratische Kachel **„Hof-Aufgaben“** mit orangem Rand, neben der Kachel „Alltagsnotizen“ (`docs/alltagsnotizen.md`). Sie zeigt, wie viel heute offen ist, einen Fortschrittsbalken (erledigt/gesamt) und die nächsten Aufgaben. Ein Tipp öffnet die Liste.
- **Seite** `/hof-aufgaben`, auch über die Suche („Aufgaben“, „Liste“, „Teich“ …).
- Die Aufgaben stehen zusätzlich in ihrem Bereich:
  - **Tiere**: Stall-Aufgaben (`/farm/aufgaben`), „Am Stall“, Widget „Stall-Aufgaben“.
  - **Garten**: im Pflegeplan (`/aufgaben`) unter „Garten-Aufgaben vom Hof“.
  - **Hof & Haus**: nur in der Hof-Liste.
  - Die Übergabe für die Vertretung zeigt alles, was heute fällig ist.

## KI-Aufgabenplan: einfach reinsprechen

Die Eingabekarte ist auf Hof-Aufgaben und Alltagsnotizen gleich aufgebaut (`components/tool-card.tsx`): oben die Überschrift, darunter das Textfeld, dann **„Halten & sprechen“** und **„Speichern“** gleich groß nebeneinander, zuletzt in kleiner Schrift eine Zeile mit Info-Symbol: **„Einfach reinsprechen“** und „So geht's“. Sie ist zu Beginn zugeklappt; ein Tipp öffnet die Erklärung mit Beispiel (`components/speak-hint.tsx`). Man hält „Halten & sprechen“ gedrückt, sagt frei, was zu tun ist, z. B. „Heute müssen die Eier eingesammelt werden, die Gänse jeden Tag gefüttert und morgen für Maria die Blumen gegossen.“, lässt los und tippt „Liste erstellen“.

- **Die KI** (Gemini, `api-server/src/lib/hofTaskPlanner.ts`) zerlegt den Text in einzelne Aufgaben mit kurzem Titel („Eier einsammeln“), Bereich, erstem Tag (heute, morgen, übermorgen, Wochentag), Wiederholung (jeden Tag, jeden Montag, alle 2 Wochen, einmalig), Uhrzeit (um 8, morgens 7:00, mittags 12:00, abends 18:00), Person aus dem Team und Tiergruppe. Was für alles gesagt wird („das Ganze ist für morgen“), gilt für jede Aufgabe.
- **Nichts wird ohne Prüfung gespeichert.** Die Vorschau zeigt jede Aufgabe mit Titel, Bereich, Tag, Wiederholung, Uhrzeit und Person – alles änderbar, einzelne entfernbar –, dann „Alle anlegen“.
- **Wo der Text nichts sagt**, gelten „Für …“ und „Täglich“ der Eingabe; „für alle“ und „einmalig“ im Gesagten haben Vorrang.
- **Eine einzelne, einfache Aufgabe** („Eier einsammeln“) geht ohne KI direkt auf die Liste (`needsPlan`): nur, wenn mehrere Aufgaben, ein Tag, eine Wiederholung, eine Uhrzeit, eine Person oder ein längerer Satz drin sind, fragt die App die KI.
- **Ohne KI** (offline, Tageslimit erreicht, KI nicht erreichbar oder nach 25 Sekunden ohne Antwort – `lib/ai-plan.ts`; der Server gibt nach 20 Sekunden auf) erkennt die App einfache Wörter selbst (`planLocally` in `lib/hof-tasks.ts`): Trennung wie bei der Liste, heute/morgen/übermorgen/Wochentag, jeden Tag/jede Woche/jeden Freitag/alle N Tage, um 7 Uhr/morgens/abends, für Maria/für alle; ein einmal gesagter Tag gilt auch für die folgenden Aufgaben. Die Vorschau ist dann als „ohne KI erkannt“ markiert.
- **Grenzen:** zählt gegen das tägliche KI-Limit „Farm“ (wie Artbestimmung und Futter-Foto); findet die KI nichts, wird der Versuch zurückgegeben. Text höchstens 2000 Zeichen, höchstens 20 Aufgaben. Gäste können nicht planen. Die KI sieht nur den Text, die Vornamen und Nachnamen des Teams und die Namen der Tiergruppen – keine E-Mail-Adressen.
- **Sicherheit:** Die Antwort der KI wird streng geprüft (`coercePlan`): Titel Pflicht und höchstens 80 Zeichen, doppelte fallen weg, ein Tag in der Vergangenheit oder mehr als ein Jahr voraus wird heute, falsche Uhrzeiten werden 8:00, Personen und Gruppen nur, wenn es sie auf dem Hof gibt.
- **Technik:** `POST /farms/:farmId/tasks/plan` mit `{ text, assigneeId?, repeats? }` → `{ tasks: PlannedFarmTask[] }`; angelegt wird danach über `POST /farms/:farmId/tasks`.

## Die Seite

0. **Wähle deine Farm** oben, wenn man zu mehr als einem Hof gehört: ein Knopf, der die Liste aufklappt – eigene Farmen, verknüpfte Höfe, Demo-Hof (`components/farm-switcher.tsx`).

1. **Neue Aufgabe** oben, zum Tippen oder mit **„Halten & sprechen“** (gedrückt halten, zum Beenden loslassen):
   - Eine Aufgabe: eintippen, Enter oder „Speichern“.
   - **Mehrere auf einmal:** jede Zeile, jedes Komma und jeder diktierte Satz wird eine Aufgabe. Beim Sprechen trennt eine kurze Pause oder ein Wort wie „dann“, „danach“, „außerdem“ oder „nächste Aufgabe“. Ein einfaches „und“ trennt nicht („Nassfutter und Trockenfutter geben“ bleibt eine Aufgabe). Die erkannte Liste erscheint zum Prüfen; einzelne lassen sich entfernen, dann „Alle anlegen“. Höchstens 20 auf einmal.
   - **„Für …“** wählt eine Person aus dem Team (sonst für alle), **„Täglich“** macht die Aufgaben wiederkehrend ab heute. Ohne „Täglich“ gelten sie einmalig für heute.
   - **„Mit Tag, Wiederholung, Uhrzeit oder Tier anlegen …“** öffnet das ganze Formular: Text (auch gesprochen), Bereich (automatisch, Tiere, Garten, Hof & Haus), bei Tiere welches Tier oder welche Gruppe, für wen, einmalig an einem Tag oder wiederkehrend ab einem Tag (alle N Tage, Wochen, Monate), Uhrzeit der Erinnerung, Notiz (auch gesprochen).
2. **Filter:** Alle, Für mich (meine und die für alle), Tiere, Garten, Hof & Haus.
3. **Heute zu tun:** fällig heute oder überfällig („seit gestern“, „seit 3 Tagen“), nach Tag und Uhrzeit.
4. **Heute erledigt:** zugeklappt, nur eine Zeile mit der Zahl („Heute erledigt (3)“); ein Tipp klappt die Liste auf – mit „erledigt von Maria, 08:12“. Ein Tipp auf den Haken nimmt ihn zurück.
5. **In den nächsten Tagen:** was in den kommenden sieben Tagen fällig wird.
6. **Alle Aufgaben verwalten:** auch spätere und pausierte, zum Ändern oder Löschen.
7. **Pflanzenpflege:** die eigenen fälligen Pflegeaufgaben aus dem Pflegeplan, mit „Erledigt“. Sie sind persönlich und nur für einen selbst sichtbar.
8. **Im Garten:** Säen, Pflanzen, Ernten aus dem Beet-Architekten.
9. **Liste teilen** (nur Admins): öffnet den Teilen-Dialog – Person aus dem Team oder per E-Mail, „Hof-Aufgaben“, „Alltagsnotizen“ oder beides (`docs/alltagsnotizen.md`).

Jede Aufgabe hat eine **Sprechblase** mit der Zahl der Kommentare. Darin stehen die Kommentare mit Name und Zeit, darunter ein Feld (auch mit „Sprechen“). Eigene Kommentare lassen sich löschen; Admins können jeden löschen.

## Teilen und Rechte

- Geteilt wird über **Farm & Team** (`docs/team.md`): ein Konto per E-Mail hinzufügen.
  - **Mitarbeiter** legen an, ändern, haken ab und kommentieren – **löschen dürfen nur Admins**, die Besitzer der Liste (`DELETE /farms/:farmId/tasks/:taskId` verlangt Admin; im Formular fehlt „Löschen“ sonst).
  - **Gäste** sehen die Liste nur.
- Die Liste gehört zur Modul-Freigabe **„Hof- & Stall-Aufgaben“** (früher „Stall-Aufgaben“). Wer sie nicht hat, sieht weder Balken noch Seite.
- „Für wen?“ zeigt das Team nur, wenn man auch „Farm & Team“ sehen darf (Admins immer).

## Erinnerungen

- Zur eingestellten Uhrzeit am fälligen Tag, einmal je Tag (wie bisher bei den Stall-Aufgaben).
- **Aufgabe für eine Person:** nur sie bekommt die Push-Nachricht, solange sie im Team ist. Sonst alle Admins und Mitarbeiter mit der Freigabe.
- **Kommentar:** alle anderen im Team mit der Freigabe bekommen eine Push-Nachricht „Maria zu „Eier einsammeln““ mit dem Text.
- Beides unter dem Thema „Hof- & Stall-Aufgaben“ in Mehr → Benachrichtigungen abschaltbar.

## Regeln (`api-server/src/lib/farmTaskRules.ts`)

- **Fällig:**
  - Einmalig: am eingestellten Tag; nach dem Abhaken erledigt für immer. Sie steht bis zum Abend unter „Heute erledigt“ und verschwindet dann.
  - Wiederkehrend mit erstem Tag: zuerst an diesem Tag, danach ein Abstand nach dem letzten Abhaken, nie vor dem ersten Tag.
  - Ohne ersten Tag (alte Stall-Aufgaben): wie bisher ein Abstand nach dem Anlegen bzw. dem letzten Abhaken.
- **Bereich ohne Angabe:** aus dem Text. Wörter zu Tieren, Stall und Futter (Huhn, Eier, Gans, Meerschweinchen, Ziege, Heu, ausmisten …) → Tiere; Garten, Beet, gießen, ernten, Rasen … → Garten; alles andere (Teich, Pumpe, Holz …) → Hof & Haus. Ganze Wörter, damit „Wirtschaft“ kein Schaf und „Computer“ keine Pute ist.
- **Art der Aufgabe** (für „Am Stall“ und die bisherigen Auswertungen) ebenfalls aus dem Text: Eier → Eier sammeln, Wasser/tränken → Tränken, ausmisten → Ausmisten, Futter/Gras/Heu → Füttern, sonst Sonstiges.
- **Haken zurücknehmen:** nur am selben Tag. Die Erledigung davor wird wiederhergestellt (`prev_completed_at`), damit eine wiederkehrende Aufgabe nicht falsch springt.
- Ein später gesendeter, älterer Tipp aus der Offline-Warteschlange von „Am Stall“ ändert weder die Zeit noch „erledigt von“.
- Längen: Aufgabe 80 Zeichen, Notiz 200, Kommentar 300; höchstens 200 Kommentare je Aufgabe; an die App gehen die neuesten 20.
- Verlässt jemand das Team, gilt eine Aufgabe für ihn wieder für alle; seine Kommentare bleiben mit seinem Namen, solange das Konto besteht. Beim Löschen des Kontos werden seine Kommentare gelöscht und sein Name von den Aufgaben genommen.

## Technik

- Tabelle `farm_tasks` (die Stall-Aufgaben) mit neuen Spalten: `title`, `area` (`tiere` | `garten` | `hof`, Standard `tiere`), `starts_on`, `repeats`, `assignee_id`, `last_completed_by`, `prev_completed_at`. Neue Tabelle `farm_task_comments`. DDL in `schemaUpgrade.ts`.
- API:
  - `GET /farms/:farmId/tasks` liefert zusätzlich `assigneeName`, `lastCompletedByName`, `isDone`, `doneToday`, `commentCount` und `comments`.
  - `POST /farms/:farmId/tasks` und `PATCH …/:taskId` nehmen `title`, `area`, `startsOn`, `repeats`, `assigneeId`; `actionType` ist optional.
  - `POST …/:taskId/uncomplete`, `POST …/:taskId/comments`, `DELETE …/:taskId/comments/:commentId`.
- Server: `lib/farmTasks.ts`, `lib/farmTaskRules.ts`, Erinnerung in `lib/pushScheduler.ts`.
- App: `pages/hof-aufgaben.tsx`, `components/hof-tasks.tsx` (Balken, Zeile, Dialog, Garten-Abschnitt), `lib/hof-tasks.ts` (Liste für heute, Aufteilen einer Liste).
- Tests: `farmTaskRules.test.ts`, `hofTaskPlanner.test.ts`, `hofTasks.integration.test.ts` (auch KI-Plan mit ersetzter KI), `lib/hof-tasks.test.ts` (auch Plan ohne KI).

## Offen

- Der Auftrag an die KI (`planPrompt`) und die Wortlisten der Erkennung ohne KI sind ein erster Wurf; mit echten Sprachaufnahmen der Tester prüfen.

- Die Wortlisten für Bereich und Art sind ein erster Wurf. Fehlt ein Tier oder ein Wort, landet die Aufgabe unter „Hof & Haus“ und lässt sich im Formular umstellen.
- Wiederkehrende Aufgaben an bestimmten Wochentagen (z. B. „montags und donnerstags“) gibt es noch nicht.
- Fotos an Kommentaren gibt es noch nicht.
