# Alpakas

Alpakas sind eine eigene Tierart in „Meine Farm“ (`alpaca` in `FARM_SPECIES`). Sie gelten in den Modulen als Weide- und Nutztiere, kommen aber mit eigenen Regeln. Alle Zahlen sind **Richtwerte** und stehen unter „Offen“ zur fachlichen Prüfung.

## Was die App für Alpakas kann

| Modul | Was für Alpakas gilt |
|---|---|
| **Tierbestand** | Tierart „Alpaka“, Gruppe „Alpakas“, Nummern A-1, A-2 … Der Schnellstart legt eine Gruppe mit Startration und Pflege-Aufgaben an. Die KI erkennt Alpakas auf Fotos und schreibt ein Haltungs-Wiki. |
| **Stall-Aufgaben** | Schnellstart: Ausmisten bzw. Kotplätze absammeln (wöchentlich), Zehennägel (alle 3 Monate), Kotprobe zum Tierarzt (alle 4 Monate, entwurmt wird nur nach Befund), Schur (jährlich, meist Mai/Juni). |
| **Futterplaner** | Bedarf je Lebensphase (Erhaltung, Trächtigkeit, Säugezeit, Wachstum, Winter). Neues Futter „Mineralfutter Alpaka/Lama“ (nur für Alpakas, mit Zink, Selen und Vitamin D). Startration: 1,5 kg Heu und 10 g Mineralfutter je Tier und Tag. Tipps: viel Heu, Kraftfutter sparsam (Alpakas verfetten schnell), kein Schaf- oder Rindermineral. Futterumstellung über 14 Tage. |
| **Wetter** | Hitze: eigener Hinweis – Alpakas leiden früh unter Hitze, vor allem vor der Schur (Schatten, Wasser, Bauch und Beine abkühlen). Kälte: mehr Heu erst unter −10 °C, das Vlies hält warm; Nässe und Wind sind das Problem. |
| **Zucht** | Trächtigkeit 345 Tage (normal −15 bis +20 Tage). Schritte: Spucktest nach 14 Tagen (nach drei und sechs Wochen wiederholen), Ultraschall ab Tag 60, Futter im letzten Drittel steigern, Geburt vorbereiten. Das Junge heißt „Cria“ (Nummern CR-…). Absetzen nach etwa sechs Monaten. **Kein Brunstkalender:** Alpaka-Stuten haben keinen Zyklus, der Eisprung kommt durch die Paarung. |
| **Weide** | Alpakas teilen sich viele Magen-Darm-Würmer (Roter Magenwurm) mit Schafen und Ziegen – im Wurm-Hinweis zählen die drei zusammen. Dazu der Tipp, die Kothaufen ein- bis zweimal die Woche abzusammeln (Alpakas koten auf feste Plätze). |
| **Pflichten** | Beim Veterinäramt anmelden (Registriernummer) und ein Bestandsregister führen. Keine Küchenreste verfüttern. Ob die Tierseuchenkasse Alpakas will, regelt jedes Bundesland selbst – die App sagt „nachfragen“ und verlinkt die Kasse. Herdentiere: mindestens zwei, besser drei; Unterstand etwa 2 m² je Tier, Weide etwa 1000–1500 m² für zwei Tiere. Keine HI-Tier-Stichtagsmeldung, keine Ohrmarkenpflicht. |
| **Arzneimittel** | Alpakas gelten als Lebensmittel liefernde Tiere: Die Wartezeit für Fleisch zählt. Für Alpakas sind kaum Mittel zugelassen; der Tierarzt widmet um und gibt die Wartezeit an. |
| **Garten** | Ein wenig Wurzelgemüse als Zugabe (0,3 kg je Tier und Tag): Möhre, Pastinake, Fenchel. Grundfutter bleiben Weide und Heu. |
| **Ertrag & Bilanz** | Wolle über das Produkt „Wolle“. |
| **Modul-Finder** | „Alpakas“ empfiehlt Stall-Aufgaben, Futterplaner, Pflichten, Arzneimittel, Export, Zucht, Weide und Ertrag. |
| **Demo-Hof** | Drei Alpakas; eine Stute ist tragend und zweimal gewogen. |

## Technik

- **Schema:** Enum-Wert `alpaca` in `farm_species` (vor `other`). Für bestehende Datenbanken ergänzt ihn `ALTER TYPE … ADD VALUE IF NOT EXISTS` in `schemaUpgrade.ts`. OpenAPI-Enum und Codegen sind angepasst.
- **Regeln** liegen in den Modulen selbst:
  - `farmAnimals.ts` (Namen), `feedCatalog.ts`, `feedNeeds.ts`, `feedSeason.ts`, `feedWeather.ts`
  - `farmSetup.ts` (`START_RATIONS`, `ALPACA_TASKS`), `breeding.ts`, `breedingCycle.ts`
  - `pastureCare.ts`, `farmWeather.ts`, `farmDuties.ts`, `medicines.ts`, `gardenAssistant.ts`
  - App: `farm-labels.ts`, `site.ts`
- **Tests:** `api-server/src/lib/alpaca.test.ts` deckt alle Regeln ab. Im Modul-Finder prüft `site.test.ts`.
- **Nicht umgesetzt:** Das Pflanzenarchiv führt keine Giftigkeit für Alpakas, wie auch nicht für Ziegen und Schafe. Giftpflanzen für Alpakas sind z. B. Eibe, Oleander, Rhododendron, Kirschlorbeer, Jakobskreuzkraut und Herbstzeitlose.

## Quellen

- [Merkblatt für Neuweltkamelidenhalter, LRA Schweinfurt](https://www.landkreis-schweinfurt.de/fileadmin/inhalt_service-info/SG32_Veterinaeramt/Merkblatt_fuer_Neuweltkamelidenhalter.pdf): Anzeige beim Veterinäramt, Rohfaser und Eiweiß.
- [Merkblatt Alpakahalter, LK Uelzen](https://www.landkreis-uelzen.de/PortalData/2/Resources/landkreis_uelzen/amt_39/veterinaerangelegenheiten/Merkblatt_Alpakahalter.pdf): Bestandsregister.
- [Sächsische Broschüre](https://publikationen.sachsen.de/bdb/artikel/24022/documents/54143): 1000–1500 m² Weide für zwei Alpakas.
- [Merkblatt Kamelidenhaltung, Hersfeld-Rotenburg](https://www.hef-rof.de/leben-in-hef-rof/gesundheit-mensch-tier/veterinaerwesen-verbraucherschutz/merkblatt-kamelidenhaltung.pdf?cid=dcq): Unterstand 2 m² je Tier.
- [Diplomarbeit Vetmeduni Wien](https://phaidra.vetmeduni.ac.at/api/object/o:169/download): eigenes Mineralfutter wegen Zink, Kupfer, Selen.
- [Tierärztl. Praxis (Thieme)](https://www.thieme-connect.de/products/ejournals/abstract/10.1055/s-0038-1623166?lang=de): Trächtigkeit 336–349 Tage.

## Offen (fachliche Prüfung)

- **Futter:**
  - Bedarfswerte je Lebensphase (TM-Aufnahme 1,2–1,7 kg, Eiweiß, Rohfaser, Calcium, Phosphor, Wasser)
  - Startration 1,5 kg Heu und 10 g Mineralfutter
  - Werte des Mineralfutters (Kupfer je Produkt verschieden, darum leer)
- **Zucht:**
  - Trächtigkeit 345 Tage und Spanne
  - Zeitpunkte von Spucktest und Ultraschall
  - Absetzen nach 180 Tagen, mindestens 25 kg
- **Pflege:** Intervalle für Zehennägel, Kotprobe und Schur.
- **Wetter:** Kältegrenze −10 °C; Hitzehinweis ab der allgemeinen Grenze von 30 °C.
- **Pflichten:**
  - Tierseuchenkasse je Bundesland (in welchen Ländern Beitrag?)
  - Ob die Anzeige beim Veterinäramt überall gilt, und dass keine Kennzeichnung (Ohrmarke, Chip) vorgeschrieben ist
  - Flächen-Richtwerte
- **Weide:** Wurm-Gruppe mit Schafen und Ziegen.
- **Garten:** Menge und Auswahl des Wurzelgemüses.
