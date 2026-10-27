# Am Stall (Schnell-Erfassen)

`/farm/stall` ist für den Gang in den Stall gemacht: große Knöpfe, ein Tipp pro Ei und ein Tipp pro Aufgabe. Es geht auch ohne Netz. Man erreicht die Seite so:

- über „Am Stall“ auf der Tiere-Seite (für Admins und Mitarbeiter, wenn Stall-Aufgaben oder Ertrag sichtbar sind),
- über die Suche,
- mit langem Druck aufs App-Symbol (PWA-Verknüpfung im Manifest).

## Was es gibt

- **Eier heute:** „+1 Ei“ zählt hoch, „−“ nimmt ein Ei zurück, solange es noch nicht gesendet ist. Die Zahl ist Server-Stand plus Wartendes. Braucht die Freigabe „Ertrag“.
- **Heute im Stall:** aktive Stall-Aufgaben aus dem Bereich Tiere (`docs/hof-aufgaben.md`), die heute fällig sind oder heute erledigt wurden (Füttern, Tränken, Eier sammeln …). Ein Tipp hakt sie ab. Braucht die Freigabe „Stall-Aufgaben“.
- Gäste sehen die Seite nur zum Nachsehen.

## Ohne Netz

- Jeder Tipp landet zuerst in einer Warteschlange auf dem Gerät (`lib/stall-queue.ts`, `localStorage` `lf-stall-queue`). Sie wird 1,5 Sekunden nach dem letzten Tipp gesendet, sobald das Gerät wieder online ist, und alle 30 Sekunden.
- Eier desselben Tages, die noch warten, werden zu einem Eintrag zusammengefasst. Ein Eintrag, der schon einmal gesendet wurde, wird nie mehr verändert (`tried`). Der Server hat ihn vielleicht schon, auch wenn die Antwort verloren ging.
- Eier tragen eine `clientId`. Der Server speichert dieselbe Kennung je Farm nur einmal (`farm_yields.client_id`, eindeutiger Teilindex). Doppelt gesendet heißt also nicht doppelt gezählt.
- Aufgaben schicken `doneAt`, also die Zeit des Tipps. Erlaubt sind höchstens 7 Tage zurück; eine Zeit in der Zukunft zählt als jetzt. Ein später gesendeter, älterer Tipp verschiebt eine neuere Erledigung nicht zurück (`GREATEST`).
- Ein Tipp verlässt die Warteschlange, wenn der Server ihn gespeichert hat oder ihn endgültig ablehnt (400, 403 oder 404, z. B. Aufgabe gelöscht oder Recht entzogen). Ohne Netz, bei 401 oder 429 und bei Serverfehlern bleibt er.
- Für den Start ohne Netz merkt sich die Seite die Farm, die Aufgaben und den Eier-Stand vom letzten Besuch (`lf-stall-*`).

## Technik

- `GET /api/farms/:farmId/yields/today` liefert die heutigen Eier (Berlin).
- `POST /farms/:farmId/yields` nimmt optional `clientId` an (`^[A-Za-z0-9-]{8,64}$`).
- `POST /farms/:farmId/tasks/:taskId/complete` nimmt optional `{ doneAt }` an.
- Tests:
  - `stall-queue.test.ts`: zusammenfassen, zurücknehmen, offline, Serverfehler, nichts ändern nach dem Senden, Eier, die während des Sendens dazukommen.
  - `farmYields.integration.test.ts`: `clientId` einmal, „Eier heute“.
  - `farmHealth.integration.test.ts`: `doneAt`.
