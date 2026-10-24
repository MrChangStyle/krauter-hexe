# Legeleistung

`/farm/legeleistung` zeigt, wie viele Eier die Hennen legen, Woche für Woche. Man erreicht die Seite über die Kachel „Legeleistung (30 Tage)“ unter Ertrag & Bilanz oder über die Suche. Die Regeln sind fest, es gibt keine KI (`lib/layingHistory.ts`).

## Was gezählt wird

- **Hennen:** Geflügel, weiblich oder Geschlecht unbekannt, ab etwa 20 Wochen alt (`LAYING_AGE_DAYS`, nur wenn ein Geburtsdatum eingetragen ist). Eine archivierte Henne zählt bis zu ihrem Archivierungstag. Der Tag, an dem ein Tier angelegt wurde, zählt nicht, weil Bestände meist nachträglich mit zurückdatierten Eiern erfasst werden. Dieselbe Regel gilt für die 30-Tage-Kachel unter Ertrag.
- **Woche:** Montag bis Sonntag, die laufende Woche bis heute. Die Woche zählt die Hennen ihres letzten Tages. Die Leistung ist Eier ÷ (Hennen × Tage).
- **Gruppen (30 Tage):** Hühnergruppen mit Eiern, die für die Gruppe oder für eine ihrer Hennen eingetragen sind. Gibt es nur eine Hühnergruppe, zählen auch Eier „Ganzer Hof“ zu ihr.
- **Einzelne Hennen (30 Tage):** Beim Eintragen von Eiern kann man optional eine Henne wählen (`farm_yields.animal_id`). Die Gruppe der Henne wird dann vorausgewählt. Bei anderen Produkten wird keine Henne gespeichert.

## Hinweise

- **Rückgang:** Die letzten 2 Wochen liegen mindestens 30 % unter den 4 Wochen davor, und die 4 Wochen lagen bei mindestens 0,2. Die Ursache richtet sich nach der Jahreszeit: im Spätsommer und Herbst die Mauser, im Winter der kurze Tag, im Sommer Hitze. Dazu kommt eine Checkliste.
- **Stille Woche:** 7 Tage ohne Eintrag, aber Einträge in den Wochen davor. Dann gibt es den Hinweis „vergessen oder legen sie nicht?“ statt des Rückgangs.
- **Jahreszeit:** Mauserzeit (September–November), Wintertief (Dezember–Januar) oder Hitze (Juni–August).
- **Alter:** Es gibt Hennen über 3 Jahre (sie legen weniger) oder Junghennen, die noch nicht mitzählen, mit dem Tag, ab dem die erste legen dürfte.

## Technik

- `GET /api/farms/:farmId/laying` liefert 26 Wochen, die Gruppen, die Hennen und die Hinweise. Lesen dürfen alle Mitglieder mit der Freigabe „Ertrag“ (Segment `laying` → `yields`).
- `POST /farms/:farmId/yields` nimmt optional `animalId` an (Geflügel dieser Farm). Die Einträge unter Ertrag zeigen den Namen der Henne.
- Der Demo-Hof hat acht Wochen Eier mit Rückgang in den letzten zwei Wochen.
- Tests: `layingHistory.test.ts` (Regeln) und `farmYields.integration.test.ts` (Route, Henne, Junghenne, fremde Farm).
