# Pflichten & Tierseuchen

Wer Nutztiere hält, hat in Deutschland Pflichten gegenüber Veterinäramt und Tierseuchenkasse, auch beim kleinen Hobbybestand. Die Seite `/farm/pflichten` zeigt für die Tierarten auf dem Hof, was zu tun ist. Einmalige Pflichten und die jährliche Bestandsmeldung lassen sich abhaken; im Januar erinnert die App die Admins an die Meldung.

**Keine Rechtsberatung.** Die Texte geben die bundesweiten Grundregeln wieder. Fristen, Beiträge und Meldewege regeln die Länder und Tierseuchenkassen unterschiedlich. Die Texte verweisen deshalb immer auf das zuständige Amt.

## Katalog (`lib/farmDuties.ts`, `DUTIES`)

| Schlüssel | Art | Tierarten | Grundlage |
|---|---|---|---|
| `registration` | einmalig | Geflügel, Ziege, Schaf, Schwein, Rind, Pferd | Viehverkehrsverordnung § 26 |
| `tsk_member` | einmalig | wie oben | Tiergesundheitsgesetz, Landesrecht |
| `tsk_report` | jährlich (Stichtag 1. 1., Frist meist Mitte Januar) | wie oben | Tierseuchenkasse des Landes |
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

Meerschweinchen haben keine Pflichten; die Seite sagt das so.

## Bestandsmeldung

- Eine jährliche Meldung betrifft **dieses Jahr**, wenn der Hof am 1. Januar Tiere der Art hatte, also wenn sie bis dahin in der App angelegt und nicht archiviert waren. Sonst betrifft sie das **nächste Jahr** („Stichtag 01.01.…“); abhaken geht dann erst ab dem Stichtag.
- Die Zahlen am Stichtag zählt die App aus ihren eigenen Daten. Tiere, die erst später eingetragen wurden, fehlen darin. Deshalb heißt es auf der Seite immer „laut App“.
- Bis zum 15. Januar steht die Meldung auf „fällig“, danach auf „noch nicht abgehakt“.
- Push um 07:30 am **2. und 12. Januar** an die Admins (nicht an Vertretungen), solange eine Meldung offen ist. Pro Hof und Tag geht höchstens eine Nachricht raus (`farm_push_log`, Thema `duties`).

## Betrieb

- **Registriernummer** vom Veterinäramt: Freitext, bis 30 Zeichen. Sie steht auch im Kopf des Veterinäramt-Exports (CSV und PDF).
- **Stallpflicht** (nur mit Geflügel): Eine amtliche Aufstallungsanordnung kann die App nicht abrufen. Ein Admin trägt sie mit Enddatum ein (heute bis höchstens ein Jahr). Bis zu diesem Tag sehen alle auf dem Hof einen roten Hinweis auf der Tierseite, in der Übergabe und auf der Pflichten-Seite.

## Offen

- Fachliche Prüfung der Texte vor dem öffentlichen Start, am besten durch ein Veterinäramt oder eine Tierseuchenkasse.
- Die Fristen der einzelnen Tierseuchenkassen pro Bundesland, falls der Hof später ein Bundesland bekommt.
