# Demo-Daten

Zum Ausprobieren lädt jedes Konto unter Mehr → **„Meine Module“** (`/module`) mit **„Demo-Daten laden“** Beispiele, zwei je Modul. Mit **„Demo-Daten löschen“** sind sie wieder weg. Die eigenen Daten bleiben dabei unberührt.

## Was geladen wird

Alles liegt auf einer eigenen Farm, dem **„Demo-Hof“**. Die App wechselt danach dorthin. Solange er gewählt ist, zeigt die Tiere-Seite einen Hinweis mit dem Weg zum Löschen.

- **Tiere**: drei Gruppen („Hühner“ mit 2 Hühnern, „Ziegen“ mit 2 Ziegen, „Alpakas“ mit 3 Alpakas) über den Schnellstart. Daraus entstehen auch die Rationen (Futterplaner) und die Stall-Aufgaben – bei den Alpakas mit Zehennägeln, Kotprobe und Schur.
- **Gesundheitsakte und Gewicht**: eine Entwurmung mit Wartezeit und Erinnerung an die Wiederholung in drei Monaten, drei Wiegungen.
- **Futtervorrat**: Legehennenfutter (fast leer) und Heu.
- **Zucht**: eine trächtige Ziege, eine trächtige Alpaka-Stute (Spucktest, zwei Wiegungen), eine Brut unter der Glucke; die zweite Ziege mit zwei Brunsten im Brunstkalender und Zwillingen vor sechs Wochen (steht unter „Absetzen“).
- **Arzneimittel**: eine Wurmkur, die bald abläuft, ein Wundspray und Oxalsäure für die Bienen.
- **Pflichten**: eine erfundene Registriernummer, Bundesland Thüringen (Thüringer Tierseuchenkasse, Stichtag 3. Januar).
- **Ertrag & Bilanz**: acht Wochen Eier (Legeleistung), Milch, eine Ausgabe für Futter.
- **Weide**: Obstwiese und Hangweide, auf der Karte eingezeichnet; die Ziegen sind auf die Hangweide umgetrieben, auf der sie vor gut zwei Monaten schon standen (Wurm-Hinweis); die Talwiese ist einmal gemäht (18 Ballen), die Obstwiese nach dem Beweiden nachgemäht.
- **Bienen**: zwei Völker mit Durchsichten, Fütterung, Honig, einer Behandlung mit Drohnenbrut und einer Winterbehandlung mit Oxalsäure aus dem Vorrat (Bestandsbuch im Export); dazu ein Standort-Check mit festem Text (ohne Foto, ohne KI-Aufruf).
- **Vorratskammer**: Eingelegtes, Eingefrorenes und Honig, eines davon bald aufzubrauchen.
- **Wildtier-Radar**: zwei Kameras, noch ohne Ereignisse.
- **Übergabe**: eine Notiz für die Vertretung.
- **Beet-Architekt**: ein Hochbeet mit Tomate (zwei Ernten für die Ernte-Auswertung) und ein Gemüsebeet mit Salat, im laufenden Jahr. Für die Wirtschaftlichkeit: Tomatensamen und Hochbeeterde als Gartenausgaben, 3,5 Stunden Arbeit.
- **Saatgut**: Tomate „Ochsenherz“ und Möhre „Nantaise“.
- **Hof-Aufgaben**: die Liste für heute – Eier einsammeln (mit Kommentar „Wir brauchen neue Eierkartons“), Ziegen Heu geben, Teichpumpe kontrollieren (schon abgehakt, mit Kommentar), einmalig Federn aus dem Teich keschern, Hochbeet gießen alle zwei Tage.
- **Farm & Team**: eine Tierarztpraxis und eine Stallhilfe als wichtige Kontakte.
- **Grow**: ein „Demo-Zelt“ mit zwei Pflanzen, aber nur, wenn das Konto Grow schon freigeschaltet hat (Alter bestätigt).

Fotos (Tier, Beet, Standort eines Volks) gibt es in der Demo nicht – dafür müsste ein Bild hochgeladen werden.

Pflegeplan, Pflanzen-Doc und Schädlinge bekommen keine Demo-Daten. Sie hängen an eigenen Scans und an der KI. Der Ratgeber „Nützlinge fördern“ hat feste Inhalte und braucht keine.

Alles wird über die Funktionen der Module selbst angelegt. Die Demo zeigt also genau, was ein Nutzer bekäme. Schlägt ein Schritt fehl, wird der halbe Demo-Hof gleich wieder gelöscht.

## Löschen

„Demo-Daten löschen“ löscht jeden Demo-Hof, auf dem das Konto Admin ist, mit allem darauf (Kaskade), und das Demo-Zelt. Echte Farmen und Grows bleiben. Danach lassen sich die Demo-Daten erneut laden.

## Technik

- Spalten `farms.is_demo` und `grows.is_demo` (Upgrade über die idempotenten Statements in `farmSchemaStatements.ts` und `growSchemaStatements.ts`).
- Server: `lib/demoData.ts`, Routen `GET`, `POST` und `DELETE /demo` (`routes/demo.ts`). Alle liefern `DemoStatus { active, farmId }`. Ein zweites Laden gibt 409.
- Der Demo-Hof zählt nicht gegen die Grenze für eigene Farmen.
- Client: `components/demo-card.tsx` (auch für den Einrichtungsassistenten gedacht), Hinweis in `pages/farm.tsx`.
- Test: `demoData.integration.test.ts`.
