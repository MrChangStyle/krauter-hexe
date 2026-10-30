# Bio und Bewirtschaftung

Schritt B1 aus `docs/BIO-KONZEPT.md`. **Bio ist eine Option, keine Pflicht.** Die App bleibt für alle da, die konventionell wirtschaften. Wer möchte, stellt auf naturnah oder bio um, und kann jederzeit zurückwechseln.

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
- **Demo:** Der Demo-Hof ist naturnah (`docs/demo.md`).
- **Tests:**
  - `farming.integration.test.ts`: Standard, Umschalten in beide Richtungen, Rollen, Prüfungen, wer biologische Tipps bekommt.
  - `organicAdvice.test.ts`: was die KI gesagt bekommt und was zurückkommt.

## Offen

- Die nächsten Schritte B2–B8 aus `docs/BIO-KONZEPT.md`, unter anderem doppelte Wartezeit bei Bio, Bio-Futter, Platz-Check, Bio-Check und Bio-Dokumentation. Der Berater-Zugang (B6) ist zurückgestellt.
- Die Liste der „im Ökolandbau üblichen“ Mittel im KI-Hinweis ist ein Richtwert. Verbindlich ist Anhang I der VO (EU) 2021/1165 (zugelassene Pflanzenschutzmittel, Dünger); fachlich zu prüfen.
