# Kräuter-Hexe – Beschwerden

Die Kräuter-Hexe (Bereich Pflanzen, Freigabe `herb-witch`, Seite `/kraeuter-hexe`) zeigt Pflanzen, die für Mensch oder Tier essbar sind oder eine Heilwirkung haben, gefiltert nach Beschwerden.

## Ein Name je Beschwerde

Die KI schreibt beim Scan zu jeder Pflanze Schlagwörter wie „Husten“ oder „Magenkrämpfe“. Damit im Filter nichts doppelt steht, gilt ein fester **Beschwerden-Wortschatz** (`pflanzenscanner/src/lib/symptom-vocabulary.ts`; der Server hat eine gleiche Kopie in `api-server/src/lib/symptomVocabulary.ts`, ein Test vergleicht beide):

- **Jedes Schlagwort wird genau einem festen Namen zugeordnet.** Die Regeln prüfen Wortteile der Reihe nach. Beispiele:
  - „Magenkrämpfe“, „Magen-Darm-Krampf“, „Verdauungsbeschwerden“, „Bauchschmerzen“ → **Magen-Darm-Beschwerden**
  - „Rachenraumentzündung“, „Mandelentzündung“, „Zahnfleischentzündung“, „Schleimhautentzündung“ → **Mund- und Rachenentzündungen**
  - „Entzündung“, „entzündungshemmend“ → **Entzündungen (allgemein)**
  - „Kopfschmerz“, „Migräne“ → **Kopfschmerzen**
- **Einzahl und Mehrzahl** gibt es nicht doppelt. Ein Test prüft, dass sich keine zwei Namen nur durch die Endung unterscheiden.
- **Unbekannte Beschwerden** (z. B. „Legenot“, „Hufrehe“) behalten ihr Wort, einheitlich großgeschrieben. Sie stehen im Filter unter „Weitere“.

## Filter mit Gruppen

Das Menü „Nach Beschwerden filtern“ zeigt Gruppen, die sich per Tipp aufklappen. Eine Gruppe mit gewählter Beschwerde ist schon offen, gibt es nur eine Gruppe, ebenfalls. Gruppen ohne passende Pflanze fehlen. Unten im Menü stehen fest, auch beim Blättern durch eine lange Liste, „Übernehmen (Anzahl)“ – schließt das Menü – und darunter „Zurücksetzen“.

| Gruppe | Beschwerden |
|---|---|
| Entzündungen | Entzündungen (allgemein), Hautentzündungen, Mund- und Rachenentzündungen, Magen-Darm-Entzündungen, Gelenkentzündungen, Blasen- und Harnwegsinfekte |
| Erkältung & Atemwege | Erkältung & Schnupfen, Husten, Halsschmerzen, Atemwegsbeschwerden, Fieber |
| Magen & Darm | Magen-Darm-Beschwerden, Durchfall, Verstopfung, Blähungen & Völlegefühl, Übelkeit, Appetitlosigkeit, Leber- und Gallenbeschwerden, Parasiten & Würmer, Magen-Darm-Entzündungen |
| Haut & Wunden | Wunden, Hautprobleme, Hautentzündungen, Insektenstiche, Verbrennungen, Prellungen & Verstauchungen |
| Schmerzen & Krämpfe | Schmerzen, Kopfschmerzen, Zahn- und Zahnfleischbeschwerden, Gelenk- und Muskelschmerzen, Gelenkentzündungen, Krämpfe, Frauenbeschwerden |
| Nerven & Schlaf | Nervosität & Stress, Schlafstörungen, Erschöpfung |
| Herz, Kreislauf & mehr | Herz-Kreislauf-Beschwerden, Blasen- und Harnwegsinfekte, Stoffwechselbeschwerden, Abwehrschwäche, Augenbeschwerden |
| Weitere | alles, was keinem festen Namen zugeordnet ist |

Manche Beschwerden stehen in zwei Gruppen, z. B. „Hautentzündungen“ unter Entzündungen und unter Haut & Wunden. Gewählt wird trotzdem ein und dieselbe Beschwerde.

Weitere Regeln:

- **Eintippen:** Ein eingetipptes Wort, das einen festen Namen meint, findet auch diesen Namen. „Magenkrämpfe“ findet zum Beispiel die Pflanzen mit „Magen-Darm-Beschwerden“.
- **Alte Links:** Geteilte Links mit früheren Namen (z. B. `symptoms=Verdauungsbeschwerden`) werden auf den neuen Namen umgestellt.

## Gleicher Name überall

- **Pflanzen-Detailseite, PDF und Trefferkarten** zeigen die festen Namen. Die Anwendungs-Hinweise wandern mit. Fallen zwei alte Schlagwörter zusammen, werden ihre verschiedenen Hinweise zusammengesetzt (`applicationsFor` in `lib/heal-targets.ts`).
- **Neue Scans:** Die KI bekommt die Liste der festen Namen vorgegeben. Was sie trotzdem anders schreibt, ordnet der Server beim Speichern zu (`normalizeSymptomTag`).
- **Bestehende Pflanzen:**
  - Nach jedem Serverstart benennt `normalizeStoredSymptoms` (`lib/plantSymptoms.ts`) die gespeicherten Schlagwörter im Hintergrund um, samt der Anwendungs-Hinweise.
  - Geschrieben werden nur Pflanzen, bei denen sich etwas ändert. Beim zweiten Lauf passiert nichts mehr.
  - Der Owner-Endpunkt `POST /plants/symptoms/casing/backfill` macht dasselbe auf Abruf.

## Tests

- `pflanzenscanner/src/lib/symptom-vocabulary.test.ts`: Varianten werden zusammengeführt, keine Doppelnamen (auch nicht als Einzahl/Mehrzahl), jeder Name gehört zu einer Gruppe.
- `ailment-filter.test.ts`: Gruppen im Menü, Suche mit Synonym.
- `kraeuter-hexe.test.tsx`: alte Links funktionieren weiter.
- `api-server/src/lib/symptomVocabulary.test.ts`: Server- und App-Liste sind gleich; Umbenennen samt Hinweisen.
- `plantSymptoms.integration.test.ts`: gegen echtes Postgres.

## Alle Tierarten

Die Kräuter-Hexe und „Essbar für …“ im Lexikon (Archiv) kennen dieselben Ziele: Mensch und zwölf Tierarten – Geflügel (Hühner, Enten, Gänse, Puten, Wachteln, Nandus), Hase, Meerschweinchen, Katze, Pferd, Hund, Ziege, Schaf, Rind, Schwein, Alpaka und Esel. Die Liste steht an einer Stelle (`ANIMAL_KINDS` in `lib/db/src/schema/plants.ts`, in der App `lib/animals.ts` und `lib/heal-targets.ts`); die KI-Anweisungen werden daraus gebaut.

- **Neue Scans** bekommen den Steckbrief für alle zwölf Tierarten.
- **Pflanzen von früher** bekommen die neuen Tierarten nach und nach im Hintergrund, sobald der Betreiber die App öffnet (bis zu 120 Pflanzen je Sitzung, je Pflanze drei kurze KI-Aufrufe für Steckbrief, Beschwerden und Anwendung). Was schon gespeichert ist – Einstufung, Giftgrad, Beschwerden, Anwendungen –, bleibt unverändert.
- Bis dahin zeigt „Essbar für“ bei den neuen Tierarten „Keine Einträge“. Beim **Esel** gilt bis dahin der Eintrag fürs Pferd (Esel fressen wie Pferde).
- Tests: `api-server/src/lib/animalKinds.integration.test.ts` (Nachfüllen gegen echtes Postgres), `farmAi.test.ts` (Pferd für Esel), `pflanzenscanner/src/lib/animals.test.ts`.

## Offen

- Die Einschätzungen für die neuen Tierarten stammen von der KI und sind fachlich zu prüfen – besonders bei Wiederkäuern (Ziege, Schaf, Rind, Alpaka), wo Verträglichkeit stark von der Menge abhängt.
- Fachliche Prüfung der Zuordnungen, z. B.:
  - Gehört „Bronchitis“ zu Husten?
  - Gehört „Schleimhautentzündung“ zu Mund und Rachen?
  - Sollen Augen eine eigene Gruppe bekommen?
- Die Regeln arbeiten mit Wortteilen. Seltene Schreibweisen können im falschen Namen landen. Fällt so etwas auf, wird die Regel in beiden Dateien angepasst.
