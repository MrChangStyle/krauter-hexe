# Demo-Daten

Zum Ausprobieren lädt jedes Konto unter Mehr → **„Meine Module“** (`/module`) mit **„Demo-Daten laden“** Beispiele, zwei je Modul. Mit **„Demo-Daten löschen“** sind sie wieder weg. Die eigenen Daten bleiben dabei unberührt.

## Was geladen wird

Alles liegt auf einer eigenen Farm, dem **„Demo-Hof“**. Die App wechselt danach dorthin. Solange er gewählt ist, zeigt die Tiere-Seite einen Hinweis mit dem Weg zum Löschen.

- **Tiere**: zwei Gruppen („Hühner“ mit 2 Hühnern, „Ziegen“ mit 2 Ziegen) über den Schnellstart. Daraus entstehen auch die Rationen (Futterplaner) und die Stall-Aufgaben.
- **Futtervorrat**: Legehennenfutter (fast leer) und Heu.
- **Zucht**: eine trächtige Ziege und eine Brut unter der Glucke.
- **Arzneimittel**: eine Wurmkur, die bald abläuft, und ein Wundspray.
- **Ertrag & Bilanz**: Eier und Milch von gestern, eine Ausgabe für Futter.
- **Wildtier-Radar**: zwei Kameras, noch ohne Ereignisse.
- **Beet-Architekt**: ein Hochbeet mit Tomate und ein Gemüsebeet mit Salat, im laufenden Jahr.
- **Saatgut**: Tomate „Ochsenherz“ und Möhre „Nantaise“.
- **Farm & Team**: eine Tierarztpraxis und eine Stallhilfe als wichtige Kontakte.
- **Grow**: ein „Demo-Zelt“ mit zwei Pflanzen, aber nur, wenn das Konto Grow schon freigeschaltet hat (Alter bestätigt).

Pflegeplan, Pflanzen-Doc und Schädlinge bekommen keine Demo-Daten. Sie hängen an eigenen Scans und an der KI.

Alles wird über die Funktionen der Module selbst angelegt. Die Demo zeigt also genau, was ein Nutzer bekäme. Schlägt ein Schritt fehl, wird der halbe Demo-Hof gleich wieder gelöscht.

## Löschen

„Demo-Daten löschen“ löscht jeden Demo-Hof, auf dem das Konto Admin ist, mit allem darauf (Kaskade), und das Demo-Zelt. Echte Farmen und Grows bleiben. Danach lassen sich die Demo-Daten erneut laden.

## Technik

- Spalten `farms.is_demo` und `grows.is_demo` (Upgrade über die idempotenten Statements in `farmSchemaStatements.ts` und `growSchemaStatements.ts`).
- Server: `lib/demoData.ts`, Routen `GET`, `POST` und `DELETE /demo` (`routes/demo.ts`). Alle liefern `DemoStatus { active, farmId }`. Ein zweites Laden gibt 409.
- Der Demo-Hof zählt nicht gegen die Grenze für eigene Farmen.
- Client: `components/demo-card.tsx` (auch für den Einrichtungsassistenten gedacht), Hinweis in `pages/farm.tsx`.
- Test: `demoData.integration.test.ts`.
