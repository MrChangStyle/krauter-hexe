# Bio und Bewirtschaftung

Schritte B1 bis B5, B7 und B8 aus `docs/BIO-KONZEPT.md`. **Bio ist eine Option, keine Pflicht.** Die App bleibt für alle da, die konventionell wirtschaften. Wer möchte, stellt auf naturnah oder bio um, und kann jederzeit zurückwechseln.

## Für Nutzer

### Bewirtschaftung des Hofs

Unter **Mehr → Farm & Team → Bewirtschaftung** legen Admins fest, wie der Hof wirtschaftet. Alle anderen sehen die Einstellung nur.

| Stufe | Bedeutung | Wirkung heute |
|---|---|---|
| **Konventionell** (Standard) | wie bisher | alle Empfehlungen, biologisch und mineralisch |
| **Naturnah** | ohne Zertifikat, aber naturnah | Pflanzendoc und Pflege-Guide nennen nur biologische Mittel und Dünger |
| **Bio (EU-Öko-Verordnung)** | zertifiziert oder in Umstellung | wie naturnah; dazu Kontrollstelle (z. B. `DE-ÖKO-006`) und „Umstellung seit“ |
| **Bio-Verband** | Bioland, Demeter, Naturland … | wie Bio |

Wer zurück auf konventionell oder naturnah stellt, verliert Kontrollstelle und Umstellungsdatum. Alle anderen Daten bleiben.

### Bio je Bereich

Nicht jeder Hof ist ein zertifizierter Betrieb – wer privat Bio-Gemüse anbaut, will seine Hühner vielleicht trotzdem nicht bio füttern. Darum schalten Admins unter der Bewirtschaftung **Bio je Bereich** an oder aus (Standard: alles an):

| Bereich | Was Bio dort bedeutet | ab Stufe |
|---|---|---|
| Pflanzendoc & Pflege-Guide | nur biologische Mittel und Dünger | naturnah |
| Garten | Feld „Bio-Saatgut?“, Mineraldünger zuletzt; ab Bio: Warnungen, Bio-Ernte, Saatgut und Düngung im Bio-Check | naturnah |
| Fütterung | Herkunft der Futtermittel, Bio-Anteile je Ration | Bio |
| Stall & Auslauf | Platz-Check, Weidegang in der Bio-Dokumentation | Bio |
| Behandlungen | doppelte Wartezeit, Zähler chemisch-synthetischer Behandlungen | Bio |
| Erzeugnisse | Eier, Milch, Fleisch, Wolle, Honig bekommen das Zeichen „Bio“ | Bio |

- Ein ausgeschalteter Bereich verhält sich wie auf einem konventionellen Hof. Der Bio-Check zeigt nur die Bereiche, die an sind; die Bio-Dokumentation lässt die anderen weg und nennt sie unter „Konventionell geführt“.
- Ist „Pflanzendoc & Pflege-Guide“ aus, entscheidet wieder der eigene Schalter „Nur biologische Empfehlungen“ jedes Kontos.
- Was beim Eintragen schon fest wurde (Bio-Zeichen, doppelte Wartezeit), bleibt beim Umschalten erhalten.
- Mitarbeiter und Gäste sehen die Auswahl, ändern kann sie nur ein Admin.

### Wo man Bio sieht und umschaltet

- **Hof-Startseite:** eine Zeile unter dem Wetter mit der Bewirtschaftung – „Konventionell · Auf Bio oder naturnah umstellen“ bzw. „Bio · Bio in 5 von 6 Bereichen“; ein Tipp öffnet Farm & Team → Bewirtschaftung.
- **In jedem Modul mit Bio-Regeln** oben eine Bio-Zeile (`components/organic-area-switch.tsx`): Futterplaner (Fütterung), Saatgut, Beet-Architekt und Ernte-Auswertung (Garten), Arzneimittel und Gesundheit am Tier (Behandlungen), Ertrag & Bilanz und Bienen (Erzeugnisse), Meine Tiere (Stall & Auslauf). Pflanzendoc hat seinen Schalter „Nur biologische Empfehlungen“.
  - Bio-Hof: grün mit „Bio: Fütterung“ bzw. „Fütterung: konventionell“; Admins schalten den Bereich dort direkt um, alle anderen sehen den Stand. „Alle Bereiche“ führt zur Bewirtschaftung.
  - Konventioneller Hof: dezente Zeile „Konventionell – Bio ist aus. Auf Bio umstellen“.
  - Naturnah bei Bereichen, die erst ab Bio gelten: „Naturnah – die Bio-Regeln für … gelten ab ‚Bio‘“.

### Keine Gewähr

Die Bio-Funktionen sind eine Hilfe mit Richtwerten nach EU-Öko-Verordnung, kein Zertifikat. Little Farming übernimmt keine Gewähr, dass damit Verordnung, Verband oder Kontrollstelle zufrieden sind. Der Hinweis steht in der Bewirtschaftung, im Bio-Check, in der Bio-Dokumentation (PDF), in den Nutzungsbedingungen (`/rechtliches`, Abschnitt „Keine Gewähr“) und in der Antwort „Ist Little Farming eine Bio-App?“ auf der Homepage.

### Nur biologische Empfehlungen (Pflanzendoc, Pflege-Guide)

- Oben im **Pflanzendoc** gibt es den Schalter „Nur biologische Empfehlungen“. Er ist standardmäßig **aus**: Dann gibt es Dünger-Tipps biologisch und mineralisch, wie bisher.
- **An:**
  - Die KI bekommt die Anweisung, nur im Ökolandbau übliche Mittel zu nennen.
  - Der Kasten „Mineralisch“ entfällt.
  - Der Pflege-Guide daraus düngt nur biologisch. Plant die KI trotzdem einen mineralischen Tag, wird er zu einem biologischen.
- Gehört das Konto zu einem Hof, der **naturnah oder bio** wirtschaftet, ist der Schalter automatisch an und gesperrt, mit Verweis auf Farm & Team. Der **Demo-Hof** zählt dabei nicht.
- Scans, Schädlinge und Nützlinge bleiben unverändert. Dort steht Bio ohnehin vor chemischen Mitteln (`docs/schaedlinge.md`).

### Krankenakte und Arzneimittel (B2)

- **Art der Behandlung**, freiwillig für alle Höfe:
  - chemisch-synthetisches Arzneimittel
  - Naturheilverfahren (Pflanzen, Homöopathie)
  - Impfung
  - Parasitenbehandlung
- **Doppelte Wartezeit**, nur auf Höfen mit „Bio“ oder „Bio-Verband“:
  - Eine neue Behandlung merkt sich, dass sie auf einem Bio-Hof entstand.
  - Eingetragen wird die **gesetzliche** Wartezeit. Die App rechnet mit der doppelten, mindestens 2 Tage (48 Stunden). Chemische Mittel ohne Wartezeit bekommen 2 Tage.
  - Das gilt am Tier, in der Übergabe, im Futterplaner und im Export (Spalte „Wartezeit“ z. B. „7 (Bio 14)“).
  - Was vorher eingetragen wurde, bleibt, wie es war. Wechselt der Hof später zurück auf konventionell, behalten die Bio-Einträge ihre doppelte Wartezeit.
- **Zähler am Tier**, nur auf Bio-Höfen:
  - Die App zählt die chemisch-synthetischen Behandlungen der letzten 12 Monate, z. B. „Bio: 2 von 3“, und warnt bei 3.
  - Vor einer weiteren Behandlung erscheint ein Hinweis, dass das Tier sonst den Bio-Status verliert.
  - Impfungen und Parasitenbehandlungen zählen nicht.
- Konventionelle und naturnahe Höfe sehen alles wie bisher; die Art der Behandlung ist dort nur eine Notiz.

### Futterplaner (B3)

Nur auf Höfen mit „Bio“ oder „Bio-Verband“:

- **Herkunft der Futtermittel**, eine Karte im Futterplaner:
  - Je Futter, das in einer Ration vorkommt: bio, Umstellung oder konventionell, dazu „vom Hof / aus der Region“.
  - Mitarbeiter und Admins tragen ein, Gäste lesen nur.
- **Bio-Futter je Ration:** Anteile auf die Trockenmasse mit Ampel (Richtwerte):

  | Regel | Richtwert | Gilt für |
  |---|---|---|
  | Bio- und Umstellungsfutter | 100 % | alle |
  | Umstellungsfutter zugekauft | höchstens 25 % | alle |
  | Vom Hof oder aus der Region | mindestens 70 % | Rind, Schaf, Ziege, Pferd, Esel, Alpaka |
  | Vom Hof oder aus der Region | mindestens 30 % | Schwein und Geflügel |
  | Raufutter und Grünfutter | mindestens 60 % | Rind, Schaf, Ziege, Pferd, Esel, Alpaka |

- Futter ohne Angabe zählt als konventionell und zugekauft. Die Ration nennt es unter „Herkunft fehlt bei …“.
- Konventionelle und naturnahe Höfe sehen den Futterplaner wie bisher.

### Platz-Check (B4)

Nur auf Höfen mit „Bio“ oder „Bio-Verband“, oben unter **Meine Tiere**:

- Je Gruppe werden Stallfläche und Auslauf in m² eingetragen. Gespeichert wird beim Verlassen des Feldes; leer heißt „nicht angegeben“.
- Die App rechnet die Mindestfläche für die Zahl der Tiere aus und zeigt eine Ampel für Stall und Auslauf. Richtwerte nach VO (EU) 2020/464, Anhang I, für ausgewachsene Tiere:

  | Tierart (Grundlage) | Stall | Auslauf je Tier |
  |---|---|---|
  | Huhn (Legehennen) | höchstens 6 Tiere je m² | 4 m² |
  | Pute | höchstens 10 Tiere je m² | 10 m² |
  | Ente | höchstens 10 Tiere je m² | 4,5 m² |
  | Gans | höchstens 10 Tiere je m² | 15 m² |
  | Schwein (Mast bis 110 kg) | 1,3 m² je Tier | 1 m² |
  | Rind (Milchkuh) | 6 m² je Tier | 4,5 m² |
  | Schaf, Ziege | 1,5 m² je Tier | 2,5 m² |

- Für andere Arten (Pferd, Esel, Alpaka, Kaninchen, Wachtel, Nandu …) nennt die App noch keine Werte.

### Bio-Check und Bio-Dokumentation (B5)

Nur auf Höfen mit „Bio“ oder „Bio-Verband“:

- **Bio-Check** als Kachel auf der Tiere-Seite (eigene Seite `/farm/bio-check`, nur wenn mindestens ein Bio-Bereich für Tiere oder Garten an ist): eine Ampel je Bereich, ein Tipp öffnet die Stelle zum Ändern.
  - **Futter:** Rot, wenn eine aktive Ration einen Bio-Anteil nicht einhält. Gelb, wenn bei einem Futtermittel die Herkunft fehlt oder es noch keine Ration gibt.
  - **Platz:** Rot bei zu wenig Stall oder Auslauf. Gelb, wenn Flächen fehlen.
  - **Behandlungen:** Rot, sobald ein Tier 3 oder mehr chemisch-synthetische Behandlungen in 12 Monaten hat.
  - **Saatgut** (ab B7): Rot bei konventionellem Saatgut, gelb, wenn die Angabe fehlt. Selbst gewonnenes zählt als Bio.
  - **Dünger** (ab B7): Rot bei Mineraldünger auf einem Beet in den letzten 12 Monaten, gelb, wenn in 12 Monaten nichts eingetragen ist.
- **Bio-Dokumentation (PDF)** im Veterinäramt-Export:
  - Kopf mit Stufe, Kontrollstelle und Datum der Umstellung.
  - Bestandsliste und Medizin-Historie mit Bio-Wartezeit, wie im Export.
  - Bio-Anteile der aktuellen Rationen.
  - Stall und Auslauf je Gruppe.
  - Weidegang im Zeitraum (aus der Weide).
  - Saatgut im Bestand mit Bio-Angabe, samenfest und Erntejahr (ab B7).
  - Düngung im Zeitraum je Beet (ab B7).
  - „(!)“ markiert Werte außerhalb des Richtwerts.
  - Rationen und Flächen sind der heutige Stand, nicht der des Zeitraums.

### Bio-Saatgut (B7, erster Teil)

- Auf naturnahen und Bio-Höfen hat jedes Saatgut das Feld **„Bio-Saatgut?“**: Bio, konventionell oder weiß nicht. Auf konventionellen Höfen ist es ausgeblendet; ein eingetragener Wert bleibt erhalten.
- Auf **Bio-Höfen** warnt die Saatgut-Seite bei konventionellem Saatgut (nur erlaubt, wenn es die Sorte nicht in Bio gibt, mit Ausnahmegenehmigung – Richtwert) und nennt Saatgut ohne Angabe. Selbst gewonnenes Saatgut zählt als Bio, archiviertes nicht.
- Das Feld „Samenfest?“ gab es schon für alle Höfe.

### Düngung und Kreislauf Stall → Beet (B7)

- Für **alle Höfe**: Im Beet trägt man unter „Düngung“ ein, was wann aufs Beet kam (`docs/beet-architekt.md`, Schritt 8).
- Darunter der **Kreislauf**: Mist der eigenen Tiere im Jahr und die Beetfläche, für die er reicht – Richtwerte.
- Auf naturnahen und Bio-Höfen steht Mineraldünger am Ende der Auswahl; auf **Bio-Höfen** warnt das Formular und der Bio-Check zeigt ihn rot.

### Bio-Erzeugnisse (B7)

- Eier, Milch, Fleisch, Wolle, Honig und Ernten, die eingetragen werden, während der Hof auf „Bio“ oder „Bio-Verband“ steht, bekommen das Zeichen **„Bio“** – fest beim Eintragen, wie die Wartezeit einer Behandlung. Wer zurückstellt, behält es an den alten Einträgen.
- „Ertrag & Bilanz“ zeigt unter dem Jahreswert **„davon Bio“** und das Zeichen an jedem Eintrag; die Ernte-Liste im Beet ebenso.

### Nachhaltigkeit und Homepage (B8)

- Unter **Farm & Team** für **jeden** Hof, auch konventionell: eine Liste mit zwölf Maßnahmen zum Abhaken (Nistkästen, Wildbienen-Nisthilfen, Blühstreifen, Hecken, Totholz, Teich, Regenwasser, Kompost, Mulchen, torffreie Erde, alte Rassen und samenfeste Sorten, Sonnenstrom). Abhaken dürfen Admins und Mitarbeiter, Gäste sehen sie.
- Daraus entsteht der **Hof-Steckbrief**: ein, zwei Sätze mit Bewirtschaftung (ab naturnah) und den Maßnahmen, zum Kopieren für die Website oder den Hofladen.
- **Homepage:** Abschnitt „Bio & nachhaltig“ (Bio-Check, Kreislauf Stall → Beet, Bio-Dokumentation, Nachhaltigkeit) und die Frage „Ist Little Farming eine Bio-App?“ – Antwort: nein, eine Option.

## Technik

- **Datenbank** (additiv, `farmSchemaStatements.ts`, `schemaUpgrade.ts`):
  - `farms.farming` (`conventional` | `natural` | `organic` | `association`, Standard `conventional`), `farms.organic_control_body`, `farms.organic_since`.
  - `user_settings.organic_tips` (Standard `false`).
  - `farms.organic_off` (text[], Standard leer): Bio je Bereich, Schlüssel aus `ORGANIC_AREAS` (`plants`, `garden`, `feed`, `space`, `treatments`, `products`).
- **Server:** `lib/farming.ts`
  - `getFarming`, `setFarming`; ein Datum in der Zukunft wird abgelehnt.
  - `organicTipsFor` und `organicTipsOn`: eigener Schalter oder ein Hof des Kontos mit Stufe ≠ konventionell, ohne Demo-Hof und ohne `plants` in `organic_off`.
  - `certifiedIn(farming, area)` und `certifiedAt(farmId, area)`: Bio-Regeln eines Bereichs; genutzt von Behandlungen (`farmHealth`), Futterplaner, Ertrag und Honig (`products`), Ernte (`garden`). App: `certifiedIn`, `organicAdviceIn`, `organicAreasFor`, `ORGANIC_DISCLAIMER` in `lib/farming-labels.ts`.
- **Endpunkte:**
  - `GET /farms/:farmId/farming` für alle Mitglieder, `PUT` nur für Admins.
  - `GET/PUT /settings` mit `organicTips` und `organicFarm` (Name des Hofs, der Bio vorgibt, sonst `null`).
- **KI:** `checkPlantHealth(image, { organic })` und `generateCareGuide({ …, organic })` bekommen `ORGANIC_RULE` mit. Das Ergebnis trägt `organic`, `duenge_chemisch` ist dann leer.
- **App:**
  - `components/farm-farming-card.tsx` auf `/team`.
  - `components/organic-tips-switch.tsx` im Pflanzendoc.
  - Texte in `lib/farming-labels.ts`.
- **Krankenakte (B2):**
  - `medical_records.remedy_kind` (`chemical` | `natural` | `vaccine` | `antiparasitic` | null) und `medical_records.organic`. `organic` wird beim Anlegen aus der Stufe des Hofs gesetzt (`certified`) und danach nie geändert.
  - `withdrawalDays` und `withdrawalUntil` in `lib/farmHealth.ts`, gespiegelt in der App (`lib/farm-health.ts`, dazu `chemicalTreatments`, `waitDaysText`).
- **Futterplaner (B3):**
  - Tabelle `feed_origins` (`feed_key` oder `feed_id`, `organic`, `own_farm`), `lib/feedOrganic.ts` mit `organicShares` und `setFeedOrigin`.
  - `GET/PUT /farms/:farmId/feed-origins`, Modul Futter.
  - `RationEvaluation.organic` ist nur auf Bio-Höfen gefüllt.
  - App: `components/feed-organic.tsx`.
- **Platz-Check (B4):**
  - `herds.stall_m2` und `herds.run_m2`, gesetzt über `PUT /farms/:farmId/herds/:herdId/space` (`setHerdSpace`, Mitarbeiter und Admins).
  - Die Rechnung macht die App (`lib/organic-space.ts`), angezeigt wird sie in `components/organic-space-card.tsx`.
  - Behoben dabei: `listHerds` zählte die Tiere einer Gruppe falsch (die Spalte `id` im Unterabfrage-SQL war die des Tiers).
- **Bio-Check und Bio-Dokumentation (B5):**
  - Beides rechnet die App aus vorhandenen Daten (Rationen, Gruppen, Export, Weiden), ohne neue Tabelle.
  - Code: `lib/organic-check.ts`, `components/organic-check-card.tsx`, die Abschnitte in `lib/farm-export-pdf.ts` (`OrganicDoc`).
- **Bio-Saatgut (B7):** Spalte `seeds.organic` (true/false/null), über die vorhandenen Saatgut-Routen; Regeln in `lib/organic-check.ts` (`conventionalSeeds`, `seedArea`, `seedRows`).
- **Düngung (B7):** Tabelle `bed_fertilizings` (Beet, Datum, Art, Bezeichnung, kg; fällt mit dem Beet weg), Routen `GET /farms/:farmId/fertilizings`, `POST /farms/:farmId/beds/:bedId/fertilizings`, `DELETE /farms/:farmId/fertilizings/:id` (Modul Garten, Schreiben ab Mitarbeiter). App: `components/bed-fertilizing-card.tsx`, `lib/fertilizing.ts`.
- **Bio-Erzeugnisse (B7):** Spalte `organic` an `farm_yields` und `harvest_logs` (Standard false), gesetzt in `addYield`, `addHoney` und `addHarvest` aus `certified(getFarming())`; `summarize` liefert `organicValue`.
- **Nachhaltigkeit (B8):** Spalte `farms.sustainability` (text[], Schlüssel aus `SUSTAINABILITY_KEYS` in `lib/sustainability.ts`, feste Reihenfolge), `GET/PUT /farms/:farmId/sustainability` (Grundfunktion ohne Modul, Schreiben ab Mitarbeiter). App: `lib/sustainability.ts` (Texte, `farmProfile`), `components/sustainability-card.tsx`; Homepage in `components/site/site-pages.tsx`, Frage in `lib/site-meta.ts`.
- **Demo:** Der Demo-Hof ist naturnah (`docs/demo.md`).
- **Tests:**
  - `farming.integration.test.ts`: Standard, Umschalten in beide Richtungen, Rollen, Prüfungen, wer biologische Tipps bekommt.
  - `organicAdvice.test.ts`: was die KI gesagt bekommt und was zurückkommt.
  - `farmHealth.integration.test.ts`: doppelte Wartezeit nur bei Bio, Art der Behandlung.
  - App `farm-health.test.ts`: Wartezeit-Rechnung, Export-Text, Zähler über 12 Monate.
  - `feedPlanner.integration.test.ts`: Anteile nur auf Bio-Höfen, fehlende Herkunft, Rollen.
  - `farmAnimals.integration.test.ts` und App `organic-space.test.ts`: Flächen speichern und prüfen.
  - App `organic-check.test.ts`: Ampeln und Zeilen der Bio-Dokumentation, Bio-Saatgut.
  - `seeds.integration.test.ts`: Bio-Saatgut speichern und ändern.
  - `farmYields.integration.test.ts` und `gardenHarvests.integration.test.ts`: Bio-Zeichen beim Eintragen, bleibt nach dem Umstellen; `farmYields.test.ts`: „davon Bio“.
  - `farming.integration.test.ts`: Nachhaltigkeit für jede Stufe, Rollen, unbekannte Maßnahmen; App `sustainability.test.ts`: Hof-Steckbrief.
  - `bedFertilizing.integration.test.ts`: Düngung eintragen, prüfen, löschen, Rollen, Trennung der Höfe; App `fertilizing.test.ts`: Kreislauf-Rechnung.

## Offen

**Freigabe (30.10.2026):** Der Betreiber hat die Bio-Richtwerte unten so freigegeben – mit dem Hinweis „keine Gewähr“ in App, PDF und Nutzungsbedingungen (siehe oben). Die Punkte bleiben als Merkliste für eine spätere fachliche Prüfung stehen.

- Richtwerte zur fachlichen Prüfung: doppelte Wartezeit, mindestens 48 Stunden; höchstens 3 chemisch-synthetische Behandlungen in 12 Monaten, bei Tieren mit weniger als einem Jahr Nutzungsdauer 1 (die App zeigt dafür nur einen Hinweis, sie kennt die Nutzungsdauer nicht); dass Impfungen und Parasitenbehandlungen nicht zählen (VO (EU) 2018/848, Anhang II Teil II).
- Futter-Richtwerte zur fachlichen Prüfung: Anteil vom Hof oder aus der Region, zugekauftes Umstellungsfutter, Raufutter (bei Milchkühen in der Frühlaktation 50 %), Ausnahmen für Eiweißfutter bei Jungtieren (VO (EU) 2018/848, Anhang II Teil II 1.4). „Region“ prüft die App nicht, das Häkchen setzt der Hof selbst.
- Platz-Richtwerte zur fachlichen Prüfung: Jungtiere, Masthühner, Sauen mit Ferkeln, Mastrinder und Verbandswerte fehlen noch; Pferde, Esel, Alpakas und Kaninchen ohne Werte.
- Rationen und Flächen in der Bio-Dokumentation sind der heutige Stand. Ob die Kontrolle den Stand im Zeitraum braucht, ist zu klären.
- Mist-Mengen je Tierart und 3 kg/m² (`lib/fertilizing.ts`) sind grobe Richtwerte und fachlich zu prüfen.
- Ware aus der Umstellungszeit (`organicSince` jünger als 2 bzw. 3 Jahre) zählt in der App schon als Bio; ob dafür ein eigenes Zeichen „Umstellungsware“ nötig ist, ist fachlich zu klären.
- Bio ist damit vollständig bis auf den Berater-Zugang (B6, zurückgestellt). und B8 (Nachhaltigkeit, Homepage) aus `docs/BIO-KONZEPT.md`. Der Berater-Zugang (B6) ist zurückgestellt.
- Die Liste der „im Ökolandbau üblichen“ Mittel im KI-Hinweis ist ein Richtwert. Verbindlich ist Anhang I der VO (EU) 2021/1165 (zugelassene Pflanzenschutzmittel, Dünger); fachlich zu prüfen.
