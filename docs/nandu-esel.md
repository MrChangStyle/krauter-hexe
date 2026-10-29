# Nandus und Esel

Schritt 5b des Launch-Plans (`docs/LAUNCH-PLAN.md`). Zwei weitere Tierarten, jeweils mit eigenen Werten in allen Tier-Modulen. Wie Gänse, Enten, Puten und Wachteln (`docs/gefluegel.md`) werden sie mit ihren Fachwerten eingebaut.

## Nandu (`rhea`)

Nandus sind Laufvögel. Nach der Viehverkehrsverordnung zählen sie zum Geflügel, deshalb gehören sie zur Geflügel-Familie (`POULTRY_SPECIES`):

- Anmeldung beim Veterinäramt, Bestandsregister, Geflügelpest-Stallpflicht, Küchenabfälle.
- **Pflicht „Gehege und Genehmigung klären“:** Ob eine Genehmigung nötig ist (Gehege, Artenschutz-Nachweis), regelt das Land. Die App rät, beim Veterinäramt und bei der unteren Naturschutzbehörde zu fragen.
- **Tipp „In der Gruppe halten“:** ein Hahn auf drei bis fünf Hennen. Der Hahn brütet und verteidigt das Nest.
- **Brut:** etwa 36 Tage. Die Eier werden wegen der dicken Schale gewogen statt geschiert, Gewichtsverlust bis zum Schlupf etwa 13–15 %.
- **Futter:**
  - Laufvogel-Alleinfutter neu im Katalog.
  - Start mit 700 g Laufvogelfutter und 2 kg Gras.
  - Bedarf je Lebensphase mit mehr Rohfaser als beim Huhn.
- **Weitere Werte:** Kältegrenze −10 °C, Wurmgruppe Geflügel, Wartezeit für Fleisch und Eier, im Pflanzen-Archiv als „Geflügel“.

## Esel (`donkey`)

Esel teilen viele Regeln mit Pferden (`EQUIDS`):

- **Pflichten:** Equidenpass mit Chip, Anmeldung beim Veterinäramt und Tierseuchenkasse wie bei Pferden.
- **Pflicht „Esel nie allein halten“:** Ein Esel braucht einen Artgenossen und einen trockenen Unterstand.
- **Wurmgruppe:** dieselbe wie Pferde. Die Weide-Regel warnt deshalb, wenn vorher Pferde auf der Fläche standen.
- **Futter:**
  - Esel brauchen sehr wenig Eiweiß und viel Rohfaser.
  - Start mit 1,7 kg Stroh, 1,7 kg Heu und Pferde-Mineralfutter.
  - Zu viel Eiweiß, etwa reines Luzerneheu, löst eine Warnung aus.
  - Tipps gegen Verfettung und Hufrehe.
- **Zucht:**
  - Trächtigkeit etwa 365 Tage, mit großer Spanne.
  - Rosse alle 23 Tage, sichtbar am „Maulen“.
  - Absetzen nach sechs bis acht Monaten, nie allein.
- **Aufgaben im Schnellstart:** Hufpflege alle 8 Wochen, Kotprobe alle 4 Monate, Zahnkontrolle jährlich.
- **Wetter:** Bei Starkregen kommt der Hinweis „kein wasserdichtes Fell, trockener Unterstand“. Kältegrenze 0 °C, weil Nässe und Kälte Esel früher treffen als Pferde.
- **Weitere Werte:** Wartezeit für Fleisch, im Pflanzen-Archiv als „Pferd“, Kokzidiostatikum-Warnung wie beim Pferd.

## Technik

- `farm_species` hat die neuen Werte `rhea` und `donkey`, für bestehende Datenbanken per `ALTER TYPE … ADD VALUE IF NOT EXISTS … BEFORE 'other'`.
- Werte in denselben Dateien wie beim Geflügel. Dazu `EQUIDS` in `lib/species.ts`, `CYCLES` und `WEANING` in `breedingCycle.ts` und der Regenhinweis in `farmWeather.ts`.
- Tests: `lib/nanduEsel.test.ts`.
- Demo: zwei Esel aus dem Schnellstart.

## Offen

- **Fachlich prüfen:** Alle Werte (Bedarf, Brut- und Tragzeit, Zyklus, Absetzen, Kältegrenzen, Startrationen, Aufgaben-Abstände) sind Richtwerte und sollen von einer Fachperson geprüft werden.
- **Genehmigung für Nandus:** Die Pflicht nennt nur die Ämter, an die man sich wenden soll. Ob die Genehmigung je Bundesland nötig ist, ist nicht hinterlegt.
