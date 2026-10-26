# Schädlinge & Nützlinge

Das Modul „Schädlinge & Nützlinge“ (Bereich Pflanzen, Freigabe `pests`, Seite `/schaedlinge`) hat oben eine Reiterleiste wie das Lexikon:

- **Meine Insekten:** die eigenen Insekten-Scans mit PDF-Export.
- **Nützlinge fördern** (`/schaedlinge?tab=nuetzlinge`): Kacheln im Stil der Pflanzen- und Tiere-Übersicht.
  - „Wobei brauchst du Hilfe?“: eine Kachel je Problem.
  - „Nützlinge kennenlernen“: eine Kachel je Nützling.
  - Damit die Seite kurz bleibt, zeigt jeder Bereich nur vier Kacheln. Darunter steht „X weitere anzeigen“ (derselbe Knopf wie bei „Meine Insekten“, `components/show-more-button.tsx`), „Weniger anzeigen“ klappt wieder zu.
  - Jede Kachel öffnet eine eigene Seite – der Inhalt erscheint nicht weiter unten, sondern oben auf der neuen Seite. „Nützlinge fördern“ oben links führt zurück.

## Meine Insekten

- **Scannen:** „Insekt bestimmen“ öffnet den Insekten-Scanner (KI).
- **Einstufung:** Jedes Insekt ist Schädling, Nützling oder neutral.
- **Filter:** Über der Liste stehen Chips „Alle / Schädlinge / Nützlinge / Neutral“ mit Anzahl, im selben Stil wie der Lagerort-Filter der Vorratskammer.
  - Leere Gruppen sind ausgegraut.
  - Der PDF-Export nimmt nur die gefilterten Insekten.
- **Detailseite eines Schädlings:** Der Kasten „Wer hilft dagegen?“ führt zur Seite des passenden Problems (`/schaedlinge/hilfe/<problem>`). Das Problem wird am deutschen Namen erkannt, z. B. „…laus“ → Blattläuse, „…schnecke“ → Schnecken, „Buchsbaumzünsler“ → Raupen.
- **Detailseite eines Nützlings:** Der Link „So holst du … in deinen Garten“ führt zur Seite dieses Nützlings (`/schaedlinge/nuetzling/<id>`), z. B. Marienkäfer, Florfliege, Ohrwurm, Mauerbiene, Hummel.

## Nützlinge fördern (Ratgeber)

Der Ratgeber arbeitet mit festen Inhalten in `pflanzenscanner/src/lib/beneficials.ts`, ohne KI. Kacheln, Farben und Bausteine stehen in `components/beneficials-guide.tsx`, die beiden Unterseiten in `pages/nuetzlinge.tsx`:

- **Problem-Seite** `/schaedlinge/hilfe/<problem>`: Kopf mit Symbol, „Als Erstes“, die helfenden Nützlinge (je eine Zeile, öffnet den Nützling) und die Maßnahmen.
- **Nützlings-Seite** `/schaedlinge/nuetzling/<id>`: was er tut, Richtwert, ob man ihn kaufen kann, „Hilft bei“ (führt zu den Problemen) und seine Maßnahmen.

Im Einzelnen:

1. **Probleme** (Kacheln „Wobei brauchst du Hilfe?“):
   - Blattläuse
   - Spinnmilben
   - Schnecken
   - Raupen
   - Trauermücken
   - Weiße Fliege
   - Engerlinge & Dickmaulrüssler
   - Boden verbessern
   - Mehr Ernte durch Bestäubung
2. **Als Erstes:** ein Satz, was sofort hilft (z. B. abwarten und Läuse abspritzen).
3. **Diese Nützlinge helfen** (auf der Problem-Seite):
   - Für jeden Nützling steht, was er tut.
   - Manche haben eine Zahl zum Vorstellen (Richtwert).
   - Bei manchen steht, ob man ihn kaufen kann.
   - Die Nützlinge sind:
     - Marienkäfer
     - Florfliege
     - Schwebfliege
     - Ohrwurm
     - Schlupfwespe
     - Raubmilbe
     - Laufkäfer
     - Igel
     - Erdkröte & Blindschleiche
     - Meisen & Singvögel
     - Nematoden
     - Regenwurm & Bodenleben
     - Wildbienen & Hummeln
4. **So holst du sie in deinen Garten:**
   - Die Maßnahmen für die gezeigten Nützlinge.
   - Reihenfolge: „Auf Gift verzichten“ immer zuerst, dann was den meisten der gezeigten Nützlinge hilft.
   - Jede Maßnahme klappt auf zu einer Schritt-für-Schritt-Anleitung mit Jahreszeit.

| Maßnahme | Für |
|---|---|
| Auf Gift verzichten | alle |
| Blühpflanzen von März bis Oktober | Schwebfliege, Florfliege, Schlupfwespe, Marienkäfer, Wildbienen |
| Nisthilfe für Wildbienen (Insektenhotel) | Wildbienen |
| Ohrwurm-Topf | Ohrwurm |
| Insektentränke | Schwebfliege, Wildbienen, Vögel |
| Wilde Ecke: Totholz, Steine, Laub | Marienkäfer, Florfliege, Laufkäfer, Igel, Kröte, Vögel, Bodenleben |
| Igel willkommen heißen | Igel |
| Nistkasten für Meisen | Vögel |
| Kleine Wasserstelle oder Mini-Teich | Kröte |
| Boden bedecken und füttern | Regenwurm, Laufkäfer, Raubmilbe |
| Nützlinge kaufen | Schlupfwespe, Raubmilbe, Nematoden |

## Technik

- **Inhalte und Regeln:** `lib/beneficials.ts`
  - Probleme, Nützlinge und Maßnahmen
  - `problemsForPest` und `beneficialForInsect`: Zuordnung am Namen
  - `measuresFor`: Reihenfolge der Maßnahmen
  - `filterByRelation` und `relationCounts`: der Filter
- **Tests:** `lib/beneficials.test.ts`
  - Jedes Problem hat Nützlinge, jeder Nützling Maßnahmen, alles wird benutzt.
  - Zahlen sind als Richtwert gekennzeichnet.
  - Namen werden erkannt.
  - Filter und Zählung stimmen.
- **Suche:** Eintrag „Nützlinge fördern“, z. B. für „Marienkäfer“, „Insektenhotel“, „Tränke“ oder „Igel“.
- **Hilfe:** Eintrag `pests` in `lib/help.ts`.
- **Kein neues Feld und keine Tabelle:** Darum gibt es keine neuen Demo-Daten. Insekten hängen an eigenen Scans (siehe `docs/demo.md`).

## Offen (fachliche Prüfung)

Alle Zahlen sind Richtwerte und sollten fachlich geprüft werden:

- Fraßleistung je Larve (einige hundert Läuse)
- Verzögerung, bis Nützlinge den Läusen folgen (1–2 Wochen)
- Insektenhotel:
  - Bohrungen 3–9 mm, 5–10 cm tief
  - mindestens 1 m hoch
  - Flugweite der Wildbienen: wenige hundert Meter
- Tränke: Wasser alle 2–3 Tage wechseln
- Igel-Durchschlupf 13 × 13 cm
- Meisenkasten:
  - Flugloch 26–28 mm bzw. 32 mm
  - 2–3 m hoch
- Mindesttemperaturen:
  - gekaufte Nützlinge 12–18 °C
  - Nematoden etwa 12 °C
- Blühstreifen ab etwa 1 m²
- Zuordnung am Namen über Schlüsselwörter: Seltene Arten werden nicht erkannt; dann führt der Link zum allgemeinen Ratgeber.
