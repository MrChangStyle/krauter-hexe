# Alltagsnotizen

Eine Einkaufsliste und ein Merkzettel für alles, was nicht direkt den Hof betrifft: „Zahnbürsten kaufen“, „Fleisch holen“, „Oma anrufen“. Getrennt von den Hof-Aufgaben, aber genauso schnell: einfach reinsprechen.

## Wo

- **Auf dem Hof** direkt unter „Pflanzenretter“ stehen zwei quadratische Kacheln mit orangem Rand nebeneinander (`HofTools` in `components/hof-tasks.tsx`):
  - **Hof-Aufgaben** (nur mit der Freigabe „Hof- & Stall-Aufgaben“): offen heute, Fortschrittsbalken, die nächsten Aufgaben.
  - **Alltagsnotizen**: wie viel auf der Einkaufsliste steht, die ersten Dinge, wie viel zum Merken.
  - Beide tragen den Hinweis „Sprechen“; sie heben sich mit Rahmen und Farbverlauf von den Widgets ab, weil man sie ständig nutzt.
- **Seite** `/notizen`, auch über die Suche („Einkauf“, „Merken“, „Liste“ …).

## Die Seite

1. **Hinweis oben:** „Einfach reinsprechen – die App schreibt die Liste.“ mit Beispiel.
2. **Eingabe** getippt oder mit „Sprechen“:
   - Eine einfache Sache („Zahnbürsten“, „2 kg Hackfleisch“) kommt direkt auf die Liste (`notesNeedPlan`).
   - Längeres („Ich muss Zahnbürsten kaufen, Fleisch holen und Oma anrufen“) geht an die KI → **Vorschau** mit jeder Notiz, Art (Einkaufen/Merken) und Bereich im Laden – alles änderbar, einzelne entfernbar –, dann „Alle notieren“.
   - Ohne KI (offline, Tageslimit) teilt die App selbst auf (`splitNotes`): Zeilen, Kommas, Sätze und „und“ trennen, Füllwörter wie „ich muss … kaufen“ fallen weg; Art und Bereich sortiert der Server nach Wörtern.
3. **Einkaufsliste** nach Bereichen in der Reihenfolge eines Ladens: Lebensmittel, Getränke, Drogerie & Apotheke, Haushalt, Tierbedarf, Garten & Baumarkt, Sonstiges.
4. **Merken & Erledigen.**
5. **Erledigt** – durchgestrichen, mit „erledigt von …“; der Besitzer räumt mit „Erledigte entfernen“ auf.
6. **Teilen** (unten).

## Teilen und Rechte

- **Jede Person hat eine eigene Liste und ist ihr Besitzer.**
- Geteilt wird gezielt mit einzelnen Personen: aus dem Team des Hofs oder per E-Mail mit jedem freigeschalteten Konto – auch Familie, die nicht im Team ist (`note_shares`).
- **Wer mitmacht:** sieht die Liste (als Reiter „Liste von Stefan“), hakt ab, fügt hinzu und ändert, was er selbst geschrieben hat – **löscht aber nichts**. Er kann die Liste verlassen.
- **Der Besitzer:** alles, auch löschen, „Erledigte entfernen“ und das Teilen beenden.
- Höchstens 10 Personen je Liste, 300 offene Notizen je Liste, eine Notiz höchstens 120 Zeichen.
- **Ein Dialog für beides** (`components/share-lists-dialog.tsx`): Person wählen oder E-Mail eingeben, dann „Hof-Aufgaben“, „Meine Alltagsnotizen“ oder beides ankreuzen.
  - Hof-Aufgaben teilen dürfen nur Admins des Hofs: eine neue Person kommt als Mitarbeiter ins Team und bekommt nur die Freigabe „Hof- & Stall-Aufgaben“ (die Tiere sind für Mitglieder immer sichtbar, `docs/team.md`); ein Mitglied mit eingeschränkten Freigaben bekommt sie dazu.
  - Dieselbe Regel gilt dort: Mitarbeiter haken ab, legen an und kommentieren – löschen dürfen nur Admins (`docs/hof-aufgaben.md`).

## Regeln (`api-server/src/lib/noteRules.ts`)

- **Art:** Einkaufen, außer die Wörter sagen Erledigen oder Erinnern (anrufen, Termin, bezahlen, überweisen, abgeben …); „kaufen“, „holen“, „besorgen“ gehen immer auf die Einkaufsliste.
- **Bereich:** Wortlisten je Bereich (Zahnbürste → Drogerie, Fleisch → Lebensmittel, Legemehl → Tierbedarf, Blumenerde → Garten & Baumarkt …), sonst „Sonstiges“.

## KI

- `POST /notes/plan` mit `{ text }` → `{ notes: [{ text, kind, category }] }`; gespeichert wird nichts. Die Antwort wird geprüft (`coerceNotes`): Text Pflicht, höchstens 120 Zeichen, doppelte fallen weg, Art und Bereich nur aus den festen Listen (sonst aus den Wörtern), höchstens 30.
- Zählt gegen das tägliche KI-Limit „Farm“; findet die KI nichts, wird der Versuch zurückgegeben.
- An Google Gemini geht nur der Text (Datenschutzerklärung).

## Technik

- Tabellen `daily_notes` (`user_id` = Besitzer der Liste, `added_by`, `kind`, `category`, `text`, `done`, `done_at`, `done_by`) und `note_shares` (`owner_id`, `user_id`, eindeutig je Paar). DDL in `schemaUpgrade.ts`.
- API: `GET/POST /notes`, `PATCH/DELETE /notes/:noteId`, `POST /notes/clear-done`, `POST /notes/plan`, `GET/POST /notes/shares`, `DELETE /notes/shares/:userId` (Besitzer beendet das Teilen oder Mitmachende verlassen die Liste).
- Konto löschen: die eigene Liste und die eigenen Freigaben gehen; auf fremden Listen bleiben Notizen ohne Namen (`accountDeletion.ts`); der Datenexport enthält beide Tabellen.
- Server: `lib/dailyNotes.ts`, `lib/noteRules.ts`, `routes/notes.ts`. App: `pages/notizen.tsx`, `components/share-lists-dialog.tsx`, `lib/daily-notes.ts`.
- Tests: `noteRules.test.ts`, `dailyNotes.integration.test.ts`, `lib/daily-notes.test.ts`.
- Demo-Daten gibt es keine: Die Notizen hängen am Konto, nicht am Demo-Hof, und würden beim Löschen der Demo nicht mitgehen.

## Offen

- Push-Nachricht, wenn jemand etwas auf eine geteilte Liste setzt.
- Mehrere Listen je Person (z. B. „Baumarkt“, „Wochenmarkt“).
- Wortlisten für Art und Bereich sowie der Auftrag an die KI (`notesPrompt`) sind ein erster Wurf; mit echten Sprachaufnahmen prüfen.
