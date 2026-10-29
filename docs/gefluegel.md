# Gänse, Enten, Puten, Wachteln

Schritt 5a des Launch-Plans (`docs/LAUNCH-PLAN.md`). Bisher gab es „Geflügel“ als eine einzige Tierart. Gänse, Enten, Puten und Wachteln brauchen aber andere Werte: Futterbedarf, Brutdauer, Kälte, Pflichten. Sie sind jetzt eigene Tierarten neben „Huhn“ (Schlüssel `poultry`). Die Entscheidung steht in `docs/ENTSCHEIDUNGEN.md`.

## Was gilt für alle Geflügelarten

Huhn, Gans, Ente, Pute und Wachtel bilden die Geflügel-Familie (`POULTRY_SPECIES` in `lib/species.ts` und `lib/farm-labels.ts`). Für alle gilt:

- **Eier und Legeleistung:** Eier lassen sich je Gruppe oder je Henne eintragen, die Legeleistung zählt alle Hennen der Familie.
- **Brut statt Trächtigkeit:** Die Brut wird mit eigener Dauer und eigenem Schierplan eingetragen.
- **Pflichten:**
  - Anmeldung beim Veterinäramt und Bestandsregister (Viehverkehrsverordnung: Hühner, Truthühner, Enten, Gänse, Wachteln und Laufvögel).
  - Geflügelpest-Stallpflicht.
  - Verbot von Küchenabfällen.
- **Arzneimittel:** Die Wartezeit gilt für Fleisch und Eier.
- **Pflanzen-Archiv:** Gans, Ente, Pute und Wachtel nutzen den Eintrag „Geflügel“ (Futter-Check, Heil- und Futterpflanzen).
- **Weide:** Für die Wurmregel gehören alle zur Gruppe Geflügel.

## Je Art (Richtwerte)

| | Gans | Ente | Pute | Wachtel |
|---|---|---|---|---|
| Brutdauer | 30 Tage | 28 Tage (Warzen-/Flugente 35) | 28 Tage | 17 Tage |
| Junge | Gössel | Entenküken | Putenküken | Wachtelküken |
| Startration im Schnellstart | Enten-/Gänsefutter 150 g + Gras 1 kg | Enten-/Gänsefutter 170 g + Muschelkalk 8 g (Legezeit) | Puten-Alleinfutter 290 g (Aufzucht) | Wachtel-Legefutter 28 g |
| Aufgaben im Schnellstart | Badewasser | Eier sammeln, Badewasser | – | Eier sammeln |
| Kältegrenze (mehr Futter) | −10 °C | −5 °C | 0 °C | 5 °C |
| Newcastle-Impfpflicht | nein | nein | ja | nein |

- **Gans:** Sie grast viel und frisst im Garten-Assistenten am meisten Grün (0,5 kg am Tag). Im Futterbedarf ist mehr Rohfaser erlaubt.
- **Ente und Gans:** Pflicht „Badewasser“ (Tierschutz). Bei Frost kommt der Hinweis „Badewasser täglich eisfrei“. Futter mit Kokzidiostatikum löst eine Warnung aus, es ist nur für Hühner und Puten gedacht.
- **Pute:** Tipp „Puten nicht mit Hühnern halten“ wegen der Schwarzkopfkrankheit. Der Schnellstart legt Puten in der Aufzucht an, weil die meisten Hobbyputen gemästet werden.
- **Wachtel:** Tipp „Voliere statt Käfig“. Bei Frost kommt der Hinweis, sie zugfrei unterzubringen. Sie braucht eiweißreiches Futter, reine Körner lösen eine Warnung im Futterplaner aus.

## Bestehende Tiere

Tiere, die bisher als „Geflügel“ eingetragen waren, heißen jetzt „Huhn“. Wer darunter Enten oder Gänse führt, stellt die Tierart an der Gruppe oder am Tier um („Bearbeiten“ → Tierart). Bei der Brut von „Huhn“ lassen sich weiter alle Vögel wählen, damit ältere Einträge stimmen.

## Tierart anfragen

Unter jeder Tierart-Auswahl (Tiergruppe anlegen, Tier bearbeiten) steht „Deine Tierart fehlt? Anfragen“. Der Link öffnet das Feedback mit „Bitte ergänzt die Tierart: …“. Die Anfrage landet in Verwaltung → Feedback. Eine Art wird mit ihren Fachwerten eingebaut, nicht frei angelegt (`docs/ENTSCHEIDUNGEN.md`).

## Technik

- `farm_species` hat die neuen Werte `goose`, `duck`, `turkey` und `quail`, für bestehende Datenbanken per `ALTER TYPE … ADD VALUE IF NOT EXISTS … BEFORE 'other'` in `schemaUpgrade.ts`.
- Werte je Art stehen in `breeding.ts`, `feedNeeds.ts`, `feedCatalog.ts` (Alleinfutter Enten/Gänse, Puten, Wachteln), `farmSetup.ts`, `farmDuties.ts`, `farmWeather.ts`, `feedWeather.ts`, `gardenAssistant.ts` und `medicines.ts`.
- Tests: `lib/gefluegel.test.ts` (Startrationen passen zum Bedarf, Brut, Pflichten, Wetter, Wartezeit, Archiv).
- Demo: drei Laufenten aus dem Schnellstart und eine Gänsebrut.

## Offen

- **Fachlich prüfen:** Alle Bedarfswerte, Brutdauern, Kältegrenzen und Startrationen sind Richtwerte. Sie sollen von einer Fachperson (Geflügelgesundheitsdienst) geprüft werden.
- **Legeleistung:** Gänse und Puten legen nur im Frühjahr. Die gemeinsame Legeleistung aller Hennen sinkt deshalb, wenn sie mitgezählt werden. Eine Legeleistung je Art wäre eine spätere Verbesserung.
- **Nandus** gehören seit Schritt 5b auch zur Geflügel-Familie (`docs/nandu-esel.md`).
