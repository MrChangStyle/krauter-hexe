# Alltagsnotizen

Eine Einkaufsliste und ein Merkzettel für alles, was nicht direkt den Hof betrifft: „Zahnbürsten kaufen“, „Fleisch holen“, „Oma anrufen“. Getrennt von den Hof-Aufgaben, aber genauso schnell: einfach reinsprechen.

## Wo

- **Auf dem Hof** direkt unter „Pflanzenretter“ stehen zwei quadratische Kacheln mit orangem Rand nebeneinander (`HofTools` in `components/hof-tasks.tsx`):
  - **Hof-Aufgaben** (nur mit der Freigabe „Hof- & Stall-Aufgaben“): offen heute, Fortschrittsbalken, die nächsten Aufgaben.
  - **Alltagsnotizen**: wie viel auf der Einkaufsliste steht, die ersten Dinge, wie viel zum Merken.
  - Beide tragen den Hinweis „Sprechen“; sie heben sich mit Rahmen und Farbverlauf von den Widgets ab, weil man sie ständig nutzt.
- **Seite** `/notizen`, auch über die Suche („Einkauf“, „Merken“, „Liste“ …).

## Die Seite

1. **Aufbau wie bei Hof-Aufgaben** (`components/tool-card.tsx`): Überschrift oben, Textfeld, „Halten & sprechen“ und „Speichern“ gleich groß nebeneinander, darunter klein der Hinweis – eine Zeile „Einfach reinsprechen“ mit Info-Symbol und „So geht's“; aufgeklappt die Erklärung mit Beispiel (`components/speak-hint.tsx`, zu Beginn zugeklappt).
2. **Eingabe** getippt oder mit „Halten & sprechen“ (gedrückt halten, zum Beenden loslassen):
   - Nur eine einfache Sache – ein Wort („Zahnbürsten“) oder eine Menge mit Ding („2 kg Hackfleisch“) – kommt direkt auf die Liste (`notesNeedPlan`). Alles andere geht an die KI, auch „Nudeln Eier“ ohne Komma: Gesprochene Listen kommen oft ohne Satzzeichen.
   - Längeres („Ich muss Zahnbürsten kaufen, Fleisch holen und Oma anrufen“) geht an die KI → **Vorschau** mit jeder Notiz, Art (Einkaufen/Merken) und Bereich im Laden – alles änderbar, einzelne entfernbar –, dann „Alle notieren“.
   - **Auftrag an die KI** (`notesPrompt`): Der Text kommt meist aus der Spracheingabe – ohne Satzzeichen, klein, mit Füllwörtern. Die KI findet jedes einzelne Ding auch ohne Komma („nudeln eier milch“ → drei), ergänzt bei mehreren Sorten die ausgelassenen Wörter („Nudeln mit roter und grüner Soße“ → „Nudeln mit roter Soße“, „Nudeln mit grüner Soße“), liest den Text nach dem Sinn statt nach den Punkten der Spracheingabe, erkennt **Läden** (Penny, Aldi, Lidl, Rewe, dm, Fressnapf, Bäcker …) und hängt sie in Klammern an („bei Penny Nudeln kaufen“ → „Nudeln (Penny)“), darf offensichtlich falsch erkannte Wörter verbessern und hat drei Beispiele. Modell wie bei allen Text-Aufgaben: `TEXT_MODELS` (Gemini Flash, dann Flash-Lite).
   - Ohne KI (offline, Tageslimit, KI zu langsam) teilt die App selbst auf (`splitNotes`): Zeilen, Kommas, Sätze und „und“ trennen – außer vor einem einzelnen kleingeschriebenen Wort („Nudeln rot und grün“ bleibt eine Notiz), Füllwörter wie „ich muss … kaufen“ fallen weg; Art und Bereich sortiert der Server nach Wörtern.
   - **Grund sichtbar:** Steht in der Vorschau „ohne KI“, nennt eine Zeile darunter den Grund (zu langsam, Tageslimit, nicht erreichbar). Der Inhaber sieht bei „nicht erreichbar“ zusätzlich die technische Ursache (`aiErrorDetail` in `routes/farmRouteHelpers.ts`: Status und Meldung, nie der Schlüssel); dieselbe steht unter Verwaltung → Betrieb als „AI request failed“.
   - **Nie hängen:** Der Server gibt die KI nach 25 Sekunden auf (`AI_PLAN_TIMEOUT_MS`), ein einzelnes Modell darf davon höchstens 12 Sekunden brauchen (`AI_PLAN_ATTEMPT_MS`), damit Flash-Lite noch drankommt, wenn Flash zu langsam ist; 8192 Ausgabe-Tokens lassen dem Modell Platz zum Nachdenken (`AI_PLAN_OUTPUT_TOKENS`). Die App wartet höchstens 30 Sekunden (`lib/ai-plan.ts`) und teilt dann selbst auf – mit dem Hinweis „Die KI hat zu lange gebraucht“. Gilt genauso für den KI-Aufgabenplan der Hof-Aufgaben.
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

- `POST /notes/plan` mit `{ text }` (höchstens 2000 Zeichen, etwa zwei bis drei Minuten Sprechen) → `{ notes: [{ text, kind, category }] }`; gespeichert wird nichts. Die Antwort wird geprüft (`coerceNotes`): Text Pflicht, höchstens 120 Zeichen, doppelte fallen weg, Art und Bereich nur aus den festen Listen (sonst aus den Wörtern), höchstens 30.
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
- Wortlisten für Art und Bereich sowie der Auftrag an die KI (`notesPrompt`, Fassung 2 mit Läden und Beispielen) mit echten Sprachaufnahmen prüfen. Reicht Flash danach nicht, Gemini Pro nur für die Notizen ausprobieren (langsamer, teurer).
- „Punkt“ als gesprochenes Satzzeichen trifft auch „um Punkt acht“ – bisher selten, beobachten.
