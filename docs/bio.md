# Bio und Bewirtschaftung

Schritte B1 bis B4 aus `docs/BIO-KONZEPT.md`. **Bio ist eine Option, keine Pflicht.** Die App bleibt für alle da, die konventionell wirtschaften. Wer möchte, stellt auf naturnah oder bio um, und kann jederzeit zurückwechseln.

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

## Technik

- **Datenbank** (additiv, `farmSchemaStatements.ts`, `schemaUpgrade.ts`):
  - `farms.farming` (`conventional` | `natural` | `organic` | `association`, Standard `conventional`), `farms.organic_control_body`, `farms.organic_since`.
  - `user_settings.organic_tips` (Standard `false`).
- **Server:** `lib/farming.ts`
  - `getFarming`, `setFarming`; ein Datum in der Zukunft wird abgelehnt.
  - `organicTipsFor` und `organicTipsOn`: eigener Schalter oder ein Hof des Kontos mit Stufe ≠ konventionell, ohne Demo-Hof.
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
- **Demo:** Der Demo-Hof ist naturnah (`docs/demo.md`).
- **Tests:**
  - `farming.integration.test.ts`: Standard, Umschalten in beide Richtungen, Rollen, Prüfungen, wer biologische Tipps bekommt.
  - `organicAdvice.test.ts`: was die KI gesagt bekommt und was zurückkommt.
  - `farmHealth.integration.test.ts`: doppelte Wartezeit nur bei Bio, Art der Behandlung.
  - App `farm-health.test.ts`: Wartezeit-Rechnung, Export-Text, Zähler über 12 Monate.
  - `feedPlanner.integration.test.ts`: Anteile nur auf Bio-Höfen, fehlende Herkunft, Rollen.
  - `farmAnimals.integration.test.ts` und App `organic-space.test.ts`: Flächen speichern und prüfen.

## Offen

- Richtwerte zur fachlichen Prüfung: doppelte Wartezeit, mindestens 48 Stunden; höchstens 3 chemisch-synthetische Behandlungen in 12 Monaten, bei Tieren mit weniger als einem Jahr Nutzungsdauer 1 (die App zeigt dafür nur einen Hinweis, sie kennt die Nutzungsdauer nicht); dass Impfungen und Parasitenbehandlungen nicht zählen (VO (EU) 2018/848, Anhang II Teil II).
- Futter-Richtwerte zur fachlichen Prüfung: Anteil vom Hof oder aus der Region, zugekauftes Umstellungsfutter, Raufutter (bei Milchkühen in der Frühlaktation 50 %), Ausnahmen für Eiweißfutter bei Jungtieren (VO (EU) 2018/848, Anhang II Teil II 1.4). „Region“ prüft die App nicht, das Häkchen setzt der Hof selbst.
- Platz-Richtwerte zur fachlichen Prüfung: Jungtiere, Masthühner, Sauen mit Ferkeln, Mastrinder und Verbandswerte fehlen noch; Pferde, Esel, Alpakas und Kaninchen ohne Werte.
- Die nächsten Schritte B5–B8 aus `docs/BIO-KONZEPT.md`, unter anderem doppelte Wartezeit bei Bio, Bio-Futter, Platz-Check, Bio-Check und Bio-Dokumentation. Der Berater-Zugang (B6) ist zurückgestellt.
- Die Liste der „im Ökolandbau üblichen“ Mittel im KI-Hinweis ist ein Richtwert. Verbindlich ist Anhang I der VO (EU) 2021/1165 (zugelassene Pflanzenschutzmittel, Dünger); fachlich zu prüfen.
