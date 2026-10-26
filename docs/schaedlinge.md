# Schädlinge & Nützlinge

Das Modul „Schädlinge & Nützlinge“ (Bereich Pflanzen, Freigabe `pests`, Seite `/schaedlinge`) hat zwei Reiter:

- **Meine Insekten:** die eigenen Insekten-Scans mit PDF-Export.
- **Nützlinge fördern:** der Ratgeber. Er ist auch direkt erreichbar über `/schaedlinge?tab=nuetzlinge`.

## Meine Insekten

- **Scannen:** „Insekt bestimmen“ öffnet den Insekten-Scanner (KI).
- **Einstufung:** Jedes Insekt ist Schädling, Nützling oder neutral.
- **Filter:** Über der Liste stehen Chips „Alle / Schädlinge / Nützlinge / Neutral“ mit Anzahl.
  - Leere Gruppen sind ausgegraut.
  - Der PDF-Export nimmt nur die gefilterten Insekten.
- **Detailseite eines Schädlings:** Der Kasten „Wer hilft dagegen?“ führt in den Ratgeber zum passenden Problem. Das Problem wird am deutschen Namen erkannt, z. B. „…laus“ → Blattläuse, „…schnecke“ → Schnecken, „Buchsbaumzünsler“ → Raupen.
- **Detailseite eines Nützlings:** Der Link „So holst du … in deinen Garten“ führt zu diesem Nützling und seinen Maßnahmen, z. B. Marienkäfer, Florfliege, Ohrwurm, Mauerbiene, Hummel.

## Nützlinge fördern (Ratgeber)

Der Ratgeber arbeitet mit festen Inhalten in `pflanzenscanner/src/lib/beneficials.ts`, ohne KI. Die Seite ist in `components/beneficials-guide.tsx`.

1. **Wobei brauchst du Hilfe?** Zur Wahl stehen:
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
3. **Diese Nützlinge helfen:**
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
