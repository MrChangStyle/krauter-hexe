# Zucht

Die Seite `/farm/zucht` begleitet eine Trächtigkeit oder eine Brut vom Deck- bzw. Einlegedatum bis zur Geburt oder zum Schlupf. Die App rechnet daraus aus:
- den erwarteten Tag und den normalen Bereich darum,
- die Schritte bis dahin, mit Push am jeweiligen Tag.

Bei der Geburt legt die App auf Wunsch die Jungtiere an, mit Geburtstag, Mutter, Vater und der Gruppe der Mutter. Feste Regeln, keine KI (`lib/breeding.ts`).

## Dauer und Schritte (`BREEDING`)

Die Tage sind Durchschnittswerte aus der Fachliteratur. Ein positiver Schritt zählt ab Beginn, ein negativer rückwärts vom erwarteten Tag.

| Tierart | Tage (Bereich) | Schritte |
|---|---|---|
| Geflügel (Brut) | 21 (±1); Pute/Ente 28, Moschusente 35, Gans 30, Wachtel 17 | Tag 7 schieren, 7 Tage vorher erneut schieren, 3 Tage vorher nicht mehr wenden (Schlupfruhe) |
| Kaninchen | 31 (28–35) | Tag 12 abtasten, 5 Tage vorher Nestbox |
| Meerschweinchen | 68 (59–72) | 14 Tage vorher Männchen trennen, 7 Tage vorher nicht mehr hochheben |
| Ziege | 150 (145–155) | Tag 21 Brunst beobachten, 56 Tage vorher trockenstellen, 42 Tage vorher Futter steigern, 7 Tage vorher Ablammbucht |
| Schaf | 147 (142–152) | Tag 17 Brunst, 42 Tage vorher Futter, 7 Tage vorher Ablammbucht |
| Schwein | 115 (112–118) | Tag 21 Umrauschen, 7 Tage vorher Abferkelbucht |
| Rind | 283 (275–291) | Tag 21 Umrindern, 56 Tage vorher trockenstellen, 7 Tage vorher Abkalbebox |
| Pferd | 335 (320–360) | Tag 16 Ultraschall, 30 Tage vorher Abfohlbox |
| Katze | 63 (58–67) | 10 Tage vorher Wurfkiste |
| Hund | 63 (58–68) | Tag 28 Ultraschall, 7 Tage vorher Wurfkiste und Temperatur messen |

Bei kurzen Bruten wie der Wachtel fallen Schritte weg, die vor dem Beginn oder nach dem Schlupf lägen.

## Regeln

- Muttertier: Pflicht bei Säugetieren, bei Geflügel optional (Glucke oder Brutapparat). Es muss weiblich oder unbekannt sein, von derselben Art und vom selben Hof stammen und darf nicht archiviert sein. Eine Mutter kann nur eine laufende Trächtigkeit haben (409).
- Vatertier: ein Tier vom Hof (männlich oder unbekannt) oder ein Name für ein Tier von einem anderen Hof.
- Geflügel braucht die Zahl der Eier (1–200). Bei der Geburt dürfen lebende und tote Tiere zusammen nicht mehr sein als die Eier, bei Säugetieren höchstens 30.
- Die Jungtiere heißen „Kitz 1“, „Küken 2“ usw. und bekommen freie Nummern wie `ZK-1` oder `KÜ-1` (`freeNumbers`, wie beim Schnellstart). Geschlecht ist unbekannt; Name, Geschlecht und Ohrmarke werden später beim Tier geändert.
- Inzucht: Die Eltern stehen am Tier (`farm_animals.mother_id`, `father_id`). Sind Mutter und Vater verwandt, zeigt der Eintrag eine Warnung, blockiert aber nicht. Erkannt werden Elterntier/Nachkomme, Voll- und Halbgeschwister, Großelternteil/Enkel und Cousins. Auf der Tierseite unter „Abstammung“ lassen sich die Eltern von Hand setzen; ein Nachkomme kann nicht Elterntier werden.
- Ist der späteste normale Tag überschritten, wird der Eintrag rot markiert.
- Push um 07:30 an Admins und Betreuer, höchstens einmal pro Hof und Tag (`farm_push_log`, Thema `breeding`).

## Offen

- Fachliche Prüfung der Tage und Schritte.
- Eine Ansicht für Brunstzyklen (wann wieder decken) und Absetzen der Jungtiere.
