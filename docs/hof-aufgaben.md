# Hof-Aufgaben

Eine gemeinsame Liste für alles, was auf dem Hof ansteht: Eier einsammeln, Meerschweinchen Gras geben, Gänse füttern, Teichpumpe kontrollieren, mit dem Kescher die Federn aus dem Teich holen. Wer im Team ist, sieht dieselbe Liste, hakt ab und schreibt dazu, wenn etwas fehlt („Wir brauchen neue Eierkartons“).

## Wo

- **Auf dem Hof** direkt unter „Pflanzenretter“ der Balken **„Hof-Aufgaben heute“**. Er zeigt, wie viel offen ist, einen Fortschrittsbalken (erledigt/gesamt) und die nächsten zwei Aufgaben. Ein Tipp öffnet die Liste.
- **Seite** `/hof-aufgaben`, auch über die Suche („Aufgaben“, „Liste“, „Teich“ …).
- Die Aufgaben stehen zusätzlich in ihrem Bereich:
  - **Tiere**: Stall-Aufgaben (`/farm/aufgaben`), „Am Stall“, Widget „Stall-Aufgaben“.
  - **Garten**: im Pflegeplan (`/aufgaben`) unter „Garten-Aufgaben vom Hof“.
  - **Hof & Haus**: nur in der Hof-Liste.
  - Die Übergabe für die Vertretung zeigt alles, was heute fällig ist.

## Die Seite

1. **Neue Aufgabe** oben, zum Tippen oder mit **„Sprechen“**:
   - Eine Aufgabe: eintippen, Enter oder „Hinzufügen“.
   - **Mehrere auf einmal:** jede Zeile, jedes Komma und jeder diktierte Satz wird eine Aufgabe. Beim Sprechen trennt eine kurze Pause oder ein Wort wie „dann“, „danach“, „außerdem“ oder „nächste Aufgabe“. Ein einfaches „und“ trennt nicht („Nassfutter und Trockenfutter geben“ bleibt eine Aufgabe). Die erkannte Liste erscheint zum Prüfen; einzelne lassen sich entfernen, dann „Alle anlegen“. Höchstens 20 auf einmal.
   - **„Für …“** wählt eine Person aus dem Team (sonst für alle), **„Täglich“** macht die Aufgaben wiederkehrend ab heute. Ohne „Täglich“ gelten sie einmalig für heute.
   - **„Mit Tag, Wiederholung, Uhrzeit oder Tier anlegen …“** öffnet das ganze Formular: Text (auch gesprochen), Bereich (automatisch, Tiere, Garten, Hof & Haus), bei Tiere welches Tier oder welche Gruppe, für wen, einmalig an einem Tag oder wiederkehrend ab einem Tag (alle N Tage, Wochen, Monate), Uhrzeit der Erinnerung, Notiz (auch gesprochen).
2. **Filter:** Alle, Für mich (meine und die für alle), Tiere, Garten, Hof & Haus.
3. **Heute zu tun:** fällig heute oder überfällig („seit gestern“, „seit 3 Tagen“), nach Tag und Uhrzeit.
4. **Heute erledigt:** mit „erledigt von Maria, 08:12“. Ein Tipp auf den Haken nimmt ihn zurück.
5. **In den nächsten Tagen:** was in den kommenden sieben Tagen fällig wird.
6. **Alle Aufgaben verwalten:** auch spätere und pausierte, zum Ändern oder Löschen.
7. **Pflanzenpflege:** die eigenen fälligen Pflegeaufgaben aus dem Pflegeplan, mit „Erledigt“. Sie sind persönlich und nur für einen selbst sichtbar.
8. **Im Garten:** Säen, Pflanzen, Ernten aus dem Beet-Architekten.
9. **Liste teilen** (nur Admins): führt zu Farm & Team.

Jede Aufgabe hat eine **Sprechblase** mit der Zahl der Kommentare. Darin stehen die Kommentare mit Name und Zeit, darunter ein Feld (auch mit „Sprechen“). Eigene Kommentare lassen sich löschen; Admins können jeden löschen.

## Teilen und Rechte

- Geteilt wird über **Farm & Team** (`docs/team.md`): ein Konto per E-Mail hinzufügen.
  - **Mitarbeiter** legen an, haken ab und kommentieren.
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
- Tests: `farmTaskRules.test.ts`, `hofTasks.integration.test.ts`, `lib/hof-tasks.test.ts`.

## Offen

- Die Wortlisten für Bereich und Art sind ein erster Wurf. Fehlt ein Tier oder ein Wort, landet die Aufgabe unter „Hof & Haus“ und lässt sich im Formular umstellen.
- Wiederkehrende Aufgaben an bestimmten Wochentagen (z. B. „montags und donnerstags“) gibt es noch nicht.
- Fotos an Kommentaren gibt es noch nicht.
