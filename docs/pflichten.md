# Pflichten & Tierseuchen

Wer Nutztiere hält, hat in Deutschland Pflichten gegenüber Veterinäramt und Tierseuchenkasse, auch beim kleinen Hobbybestand. Die Seite `/farm/pflichten` zeigt für die Tierarten auf dem Hof, was zu tun ist. Einmalige Pflichten und die jährliche Bestandsmeldung lassen sich abhaken; im Januar erinnert die App die Admins an die Meldung.

**Keine Rechtsberatung.** Die Texte geben die bundesweiten Grundregeln wieder. Fristen, Beiträge und Meldewege regeln die Länder und Tierseuchenkassen unterschiedlich. Mit eingetragenem Bundesland nennt die App die zuständige Kasse und rechnet mit deren Stichtag und Frist (siehe unten); maßgeblich bleibt der Meldebogen der Kasse.

## Katalog (`lib/farmDuties.ts`, `DUTIES`)

| Schlüssel | Art | Tierarten | Grundlage |
|---|---|---|---|
| `registration` | einmalig | Geflügel, Ziege, Schaf, Schwein, Rind, Pferd | Viehverkehrsverordnung § 26 |
| `tsk_member` | einmalig | wie oben | Tiergesundheitsgesetz, Landesrecht |
| `tsk_report` | jährlich (Stichtag und Frist je Bundesland, sonst 1. 1. und 15. 1.) | wie oben | Tierseuchenkasse des Landes |
| `hit_report` | jährlich (Stichtag 1. 1., bis 15. 1.) | Schwein, Schaf, Ziege | Viehverkehrsverordnung |
| `stock_register` | Regel | Geflügel, Ziege, Schaf, Schwein, Rind | ViehVerkV, Geflügelpest-VO |
| `eartags_small` | Regel | Schaf, Ziege | ViehVerkV |
| `eartags_cattle` | Regel | Rind | ViehVerkV |
| `eartags_pig` | Regel | Schwein | ViehVerkV |
| `equine_pass` | Regel | Pferd | DVO (EU) 2021/963 |
| `nd_vaccination` | Regel | Geflügel | Geflügelpest-Verordnung § 7 |
| `avian_flu` | Regel | Geflügel | Geflügelpest-VO, Anordnung des Kreises |
| `pig_hygiene` | Regel | Schwein | Schweinehaltungshygieneverordnung |
| `catering_waste` | Regel | alle Nutztiere inkl. Kaninchen | VO (EG) 1069/2009 |
| `rabbit_vaccination` | Empfehlung | Kaninchen | StIKo Vet |
| `dog_registration` | einmalig | Hund | Gemeinde, Landesrecht |
| `cat_neutering` | Empfehlung | Katze | Katzenschutzverordnung der Gemeinde |
| `bee_registration` | einmalig | Bienen | Bienenseuchen-Verordnung § 1a |
| `bee_tsk` | einmalig | Bienen | Tiergesundheitsgesetz, Landesrecht |
| `bee_varroa` | Regel | Bienen | Bienenseuchen-Verordnung § 15, Tierarzneimittelgesetz |
| `bee_moving` | Regel | Bienen | Bienenseuchen-Verordnung § 5 |

Die Bienenpflichten erscheinen, solange der Hof mindestens ein aktives Bienenvolk hat (Modul „Bienen“); aufgelöste, eingegangene oder verkaufte Völker zählen nicht. Die Antwort von `GET /farms/:farmId/duties` sagt das in `bees`.

Meerschweinchen haben keine Pflichten; die Seite sagt das so.

## Bundesland

Ein Admin wählt unter „Betrieb“ das Bundesland (`farms.state`, Kürzel wie `BY`). Dann:

- nennen die Pflichten zur Tierseuchenkasse (`tsk_member`, `tsk_report`, `bee_tsk`) die Kasse des Landes mit Link zu ihrer Website, und die Quelle heißt z. B. „Landesrecht Bayern“;
- rechnet die Bestandsmeldung an die Kasse mit dem Stichtag und der Frist des Landes;
- steht dabei, was im Land anders ist.

Die Meldung an HI-Tier bleibt überall bei Stichtag 1. 1. und Frist 15. 1. Ohne Bundesland bleibt alles wie zuvor (1. 1. und 15. 1., „Tierseuchenkasse des Bundeslandes“).

Tabelle in `lib/dutyStates.ts` (`STATES`), recherchiert im Oktober 2026 auf den Seiten der Kassen und Landwirtschaftskammern. **Richtwerte** – siehe „Offen“:

| Land | Kasse | Stichtag | Frist | Hinweis |
|---|---|---|---|---|
| Baden-Württemberg | Tierseuchenkasse Baden-Württemberg | 1. 1. | 15. 1. | |
| Bayern | Bayerische Tierseuchenkasse | 1. 1. | 20. 1. | Post, Tierhalter-Login oder QR-Code |
| Berlin | Tierseuchenkasse Berlin (LAGeSo) | 1. 1. | – | |
| Brandenburg | Tierseuchenkasse Brandenburg | 1. 1. | – | |
| Bremen | Tierseuchenkasse Bremen (LMTVet) | 1. 1. | – | |
| Hamburg | Tierseuchenkasse Hamburg (ohne Link) | 1. 1. | – | |
| Hessen | Hessische Tierseuchenkasse | 1. 1. | – | |
| Mecklenburg-Vorpommern | Tierseuchenkasse M-V | 3. 1. | – | Kasse und Veterinäramt tauschen keine Daten aus |
| Niedersachsen | Niedersächsische Tierseuchenkasse | 3. 1. | 17. 1. | |
| Nordrhein-Westfalen | Tierseuchenkasse NRW (Landwirtschaftskammer) | 1. 1. | 31. 1. | Jahreshöchstbestand bei Schwein, Schaf, Ziege, Geflügel, Bienen |
| Rheinland-Pfalz | Tierseuchenkasse Rheinland-Pfalz | 1. 1. | – | |
| Saarland | Tierseuchenkasse Saarland | 1. 1. | – | |
| Sachsen | Sächsische Tierseuchenkasse | 1. 1. | 15. 1. | Neuanmeldung binnen 30 Tagen |
| Sachsen-Anhalt | Tierseuchenkasse Sachsen-Anhalt | 1. 1. | – | Neuanmeldung binnen zwei Wochen |
| Schleswig-Holstein | Tierseuchenfonds Schleswig-Holstein (ohne Link) | 1. 1. | – | |
| Thüringen | Thüringer Tierseuchenkasse | 3. 1. | 17. 1. | Neue Tiere nach dem Stichtag gleich nachmelden |

„–“: Frist nicht geprüft. Die App rechnet dann mit dem 15. Januar und sagt, dass die genaue Frist im Meldebogen steht.

## Bestandsmeldung

- Eine jährliche Meldung betrifft **dieses Jahr**, wenn der Hof am Stichtag (1. oder 3. Januar, je nach Land) Tiere der Art hatte, also wenn sie bis dahin in der App angelegt und nicht archiviert waren. Vor dem 3. Januar zählen die Tiere von heute. Sonst betrifft sie das **nächste Jahr** („Stichtag …“); abhaken geht dann erst ab dem Stichtag.
- Die Zahlen am Stichtag zählt die App aus ihren eigenen Daten. Tiere, die erst später eingetragen wurden, fehlen darin. Deshalb heißt es auf der Seite immer „laut App“.
- Bis zur Frist steht die Meldung auf „fällig“, danach auf „noch nicht abgehakt“.
- Push um 07:30 an die Admins (nicht an Vertretungen), solange eine Meldung offen ist: je Meldung **13 und 3 Tage vor ihrer Frist** (`reportPushDays`), bei Frist 15. 1. also am 2. und 12. Januar, in NRW für die Kasse am 18. und 28. Januar. Pro Hof und Tag geht höchstens eine Nachricht raus (`farm_push_log`, Thema `duties`).

## Betrieb

- **Registriernummer** vom Veterinäramt: Freitext, bis 30 Zeichen. Sie steht auch im Kopf des Veterinäramt-Exports (CSV und PDF).
- **Stallpflicht** (nur mit Geflügel): Eine amtliche Aufstallungsanordnung kann die App nicht abrufen. Ein Admin trägt sie mit Enddatum ein (heute bis höchstens ein Jahr). Bis zu diesem Tag sehen alle auf dem Hof einen roten Hinweis auf der Tierseite, in der Übergabe und auf der Pflichten-Seite.

## Offen

- Fachliche Prüfung der Texte vor dem öffentlichen Start, am besten durch ein Veterinäramt oder eine Tierseuchenkasse.
- Prüfung der Bundesland-Tabelle (`lib/dutyStates.ts`): Namen, Websites, Stichtage und Fristen; die fehlenden Fristen (Berlin, Brandenburg, Bremen, Hamburg, Hessen, Mecklenburg-Vorpommern, Rheinland-Pfalz, Saarland, Sachsen-Anhalt, Schleswig-Holstein) ergänzen; jährlich nachsehen, ob sich etwas geändert hat.
- NRW zählt bei manchen Arten den Jahreshöchstbestand – die App zählt weiter am Stichtag und sagt das nur dazu.
- Weitere Landesregeln (Hundegesetze, Chip- und Haftpflicht, Beitragssätze) sind noch nicht je Land hinterlegt.
