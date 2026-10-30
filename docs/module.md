# Module

Little Farming besteht aus zwei Bereichen, **Pflanzen** und **Tiere**, mit je mehreren Modulen. Jedes Konto stellt sich die App selbst zusammen: Unter Mehr → **„Meine Module“** (`/module`) lässt sich jeder Bereich und jedes Modul ein- und ausblenden. Das gilt auch für die Module, die fest zur App gehören.

## Kennzeichnung

- **Ohne Kennzeichnung**: Basis-Module. Sie gehören fest zur App und sind kostenlos.
- **Lite / Premium**: Module, deren Grundfunktionen kostenlos sind und bei denen Premium mehr bringt. Ohne Premium steht dort „Lite“, mit Premium „Premium“. Bisher ist das nur **Grow**, dessen KI-Check Premium ist (`docs/premium.md`).

## Was „ausblenden“ bewirkt

- Die Kachel auf der Bereichsseite (Pflanzen, Tiere) verschwindet, bei „Meine Pflanzen“ auch die grüne Karte oben auf „Pflanzen“. Auf „Tiere“ steht oben immer „Meine Tiere“ (Liste unter `/farm/tiere`). Fällige Pflege- und Stall-Aufgaben zeigt der Hof; Pflegeplan und Stall-Aufgaben bleiben als Kacheln.
- Die Widgets des Moduls verschwinden aus dem Hof-Dashboard und aus „Dashboard anpassen“ (`WIDGET_MODULE` in `lib/modules.ts`).
- Ein ausgeblendeter **Bereich** nimmt seinen Reiter aus der unteren Leiste und blendet alle seine Module aus.
- Die Daten bleiben unverändert erhalten. Wer das Modul wieder einblendet, findet alles wie vorher. Direkte Links funktionieren weiter.

## Meine Tierarten

Auf derselben Seite wählt jedes Konto seine Tierarten (Karte „Meine Tierarten“, `components/animal-switches.tsx`): Geflügel, Hase, Meerschweinchen, Katze, Pferd, Hund, Ziege, Schaf, Rind, Schwein, Alpaka, Esel. Ein Tipp blendet eine Art aus oder wieder ein und speichert sofort.

- **Wirkung:** „Essbar für …“ im Lexikon und die Kräuter-Hexe zeigen nur die gewählten Arten. Der Mensch bleibt immer. Eine Art, die gerade auf dem Bildschirm steht (z. B. aus einem geteilten Link), bleibt sichtbar.
- **Standard:** Alle Arten sind an – so bleibt es in der Testphase, bis jemand etwas abwählt. Unter beiden Auswahlen führt „Tierarten auswählen“ hierher.
- **Technik:** `user_settings.hidden_animals` (jsonb, Standard `[]`), `hiddenAnimals` in `GET/PUT /settings`; unbekannte Arten fallen beim Lesen heraus. App: `hooks/use-animal-kinds.ts`, Regeln in `lib/animal-kinds.ts`.
- **Tests:** `userSettings.integration.test.ts` (gegen echtes Postgres), `lib/animal-kinds.test.ts`, Browser-Test in 390 px.

## Demo-Daten

Unten auf der Seite lassen sich Beispieldaten laden und wieder löschen, siehe `docs/demo.md`.

## Technik

- Das Verzeichnis aller Module ist `MODULES` in `lib/modules.ts`, mit Bereich, Name, Hinweis und `tier` (`base` oder `lite`). Die Ids sind `ModuleId` in der API. Ein Test hält beide Listen gleich.
- Gespeichert wird pro Konto in der Tabelle `user_settings`:
  - `hidden_modules` und `onboarded_at` (für den Einrichtungsassistenten).
  - Die Tabelle steht in `PERSONAL_TABLES`.
  - `GET /settings` liefert `{ hiddenModules, onboarded }`, `PUT /settings` nimmt einen der beiden Werte oder beide.
  - Unbekannte oder doppelte Ids fallen weg.
- `useModules()` (`hooks/use-modules.ts`) liefert `visible(id)`. Solange die Einstellungen laden oder offline fehlen, ist alles sichtbar.

## Einrichtung

Beim ersten Start führt ein Assistent durch die Modulauswahl und die Demo-Daten. Danach gibt es eine App-Tour, siehe `docs/onboarding.md`.
