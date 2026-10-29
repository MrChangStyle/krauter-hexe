# Krankenakte und Tierarzt-Zugang

Schritt 9 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Geprüft wurde, ob die Gesundheitsakte eines Tieres alles enthält, was üblicherweise zu einer Behandlung gehört, und ob der Tierarzt sie ohne Umwege sehen kann.

## Was ein Eintrag enthält

Unter Tiere → ein Tier → **Gesundheit** (`components/farm-animal-health.tsx`):

| Angabe | Pflicht | Hinweis |
|---|---|---|
| Datum | ja | nicht in der Zukunft |
| **Behandlung bis** | nein | **neu:** letzter Tag einer Behandlung über mehrere Tage, höchstens 90 Tage nach dem Datum |
| Diagnose / Anlass | ja | z. B. Entwurmung, Moderhinke |
| Behandlung | nein | Freitext, auch gesprochen |
| Mittel aus dem Arzneimittel-Vorrat | nein | Menge geht vom Vorrat ab, Charge und Wartezeit werden übernommen (`docs/arzneimittel.md`) |
| Medikament | nein | Freitext, wenn das Mittel nicht im Vorrat ist |
| Wartezeit (Tage) | nein | Milch, Eier, Fleisch |
| Tierarzt | nein | |
| Notiz | nein | |
| Erinnern zum Wiederholen | nein | nur bei neuen Einträgen (`docs/gesundheit-erinnerung.md`) |

## Wartezeit ab dem letzten Behandlungstag

Bei einer Behandlung über mehrere Tage beginnt die Wartezeit erst nach dem letzten Tag. Bisher zählte sie immer ab dem Datum des Eintrags und endete damit zu früh.

- **Regel:** Wartezeit bis = (Behandlung bis, sonst Datum) + Wartezeit in Tagen.
- **Server:** `withdrawalUntil()` in `lib/farmHealth.ts`. Die Regel gilt für die Übergabe-Seite (`lib/farmHandover.ts`) und für die Warnung im Futterplaner (`lib/feedPlanner.ts`).
- **App:** `withdrawalEnd()` in `lib/farm-health.ts`. Die Regel gilt für die Akte, den Hinweis „Wartezeit bis“ oben am Tier und den Export.
- **Im Formular** steht unter der Wartezeit sofort das Ende, z. B. „Wartezeit bis 10.6.2026“.
- **Liste und Export** zeigen den Zeitraum, z. B. „30.5.2026 – 3.6.2026“. Ein Ende am selben Tag wie das Datum wird als eintägige Behandlung gespeichert.

## Tierarzt-Zugang

Unter **Farm & Team → Vertretung → „Tierarzt einladen“** (`components/farm-members-card.tsx`, `lib/vet-access.ts`):

- **E-Mail:** Das Formular übernimmt die E-Mail-Adresse des Kontakts „Tierarzt“, falls einer eingetragen ist.
- **Rolle:** Gast (nur lesen). Wer möchte, dass der Tierarzt Behandlungen selbst einträgt, wählt Mitarbeiter.
- **Ende:** in 14 Tagen, änderbar. Danach endet der Zugang von selbst, wie bei jeder Vertretung.
- **Freigaben:** nur Arzneimittel-Vorrat und Veterinäramt-Export. Die Tiere mit ihrer Akte sind für jedes Mitglied offen. Futter, Ertrag, Kameras und alles andere bleiben verborgen.
- **In der Liste** steht bei ihm „Freigaben: Tierarzt-Zugang“. Ein Tipp darauf ändert die Freigaben wie bei jedem Mitglied.

Technik: `POST /farms/:farmId/members` nimmt optional `modules` an und speichert die Freigaben gleich mit der Einladung. Bei Admins wird der Wert ignoriert.

Der Tierarzt braucht ein eigenes Little-Farming-Konto. Eine Einladung per Link ohne Konto gibt es nicht.

## Schema

- `medical_records.treatment_until` (date, null = ein Tag), für bestehende Datenbanken per `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `schemaUpgrade.ts`.
- OpenAPI: `MedicalRecord.treatmentUntil`, `MedicalRecordInput.treatmentUntil` und `AddFarmMemberInput.modules`.

## Tests

- `farmHealth.integration.test.ts`: Behandlung über mehrere Tage, ein Ende am selben Tag als ein Tag, ungültige Enden.
- `farmHandover.integration.test.ts`: Die Wartezeit auf der Übergabe zählt ab dem letzten Behandlungstag.
- `farmMembers.integration.test.ts`: Die Einladung mit Enddatum und Freigaben.
- `lib/farm-health.test.ts`, `lib/vet-access.test.ts`: Ende der Wartezeit, Zeitraum, Vorbelegung der Einladung.
- Browser in Handybreite: Eintrag mit „Behandlung bis“ anlegen; Tierarzt einladen.

## Offen

- **Fachlich prüfen:** die 90 Tage als längste Behandlung und die 14 Tage als Standard-Dauer des Tierarzt-Zugangs. Beides sind Richtwerte.
- **Wartezeit je Erzeugnis:** Die Akte speichert eine Wartezeit, die längste für die Tierart. Getrennte Wartezeiten für Milch, Eier und Fleisch gibt es nur im Arzneimittel-Vorrat.
- **Tierarzt ohne Konto:** Ein Lese-Link ohne Konto, etwa für einen einmaligen Blick in die Akte, wäre eine eigene Funktion für später.
