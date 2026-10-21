# Module

Little Farming besteht aus zwei Bereichen, **Pflanzen** und **Tiere**, mit je mehreren Modulen. Jedes Konto stellt sich die App selbst zusammen: Unter Mehr → **„Meine Module“** (`/module`) lässt sich jeder Bereich und jedes Modul ein- und ausblenden. Das gilt auch für die Module, die fest zur App gehören.

## Kennzeichnung

- **Ohne Kennzeichnung**: Basis-Module. Sie gehören fest zur App und sind kostenlos.
- **Lite / Premium**: Module, deren Grundfunktionen kostenlos sind und bei denen Premium mehr bringt. Ohne Premium steht dort „Lite“, mit Premium „Premium“. Bisher ist das nur **Grow**, dessen KI-Check Premium ist (`docs/premium.md`).

## Was „ausblenden“ bewirkt

- Die Kachel auf der Bereichsseite (Pflanzen, Tiere) verschwindet, bei Pflegeplan und Stall-Aufgaben auch die grüne Karte oben.
- Die Widgets des Moduls verschwinden aus dem Hof-Dashboard und aus „Dashboard anpassen“ (`WIDGET_MODULE` in `lib/modules.ts`).
- Ein ausgeblendeter **Bereich** nimmt seinen Reiter aus der unteren Leiste und blendet alle seine Module aus.
- Die Daten bleiben unverändert erhalten. Wer das Modul wieder einblendet, findet alles wie vorher. Direkte Links funktionieren weiter.

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
