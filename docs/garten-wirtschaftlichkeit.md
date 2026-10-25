# Garten-Wirtschaftlichkeit

Lohnt sich der Garten? Die Ernte-Auswertung (`/beete/ernte`) hat unten den Teil **„Wirtschaftlichkeit“**. Er stellt die Ernte einer Saison zum Ladenwert den Kosten des Gartens und der Zeit darin gegenüber. Dazu gehören Überschuss, Euro je Stunde, Kosten je kg und der Blick je Beet. Feste Regeln, keine KI (`lib/gardenEconomics.ts`). Das Modul ist „Garten“ (Freigabe `garden`).

## Erfassen

- **Ausgabe** (Knopf „Ausgabe“):
  - Datum, Betrag, Art und optional Beet und Notiz.
  - Die Arten sind Saatgut & Pflanzen, Erde, Kompost & Dünger (neu), Wasser (neu), Geräte & Material und Sonstiges.
  - Eine Gartenausgabe ist eine ganz normale Ausgabe des Hofs (`farm_expenses`) mit dem Zeichen `garden` und optional `bed_id`. Unter Ertrag & Bilanz steht sie mit „· Garten“ und zählt dort **einmal**.
- **Unter Ertrag & Bilanz eingetragen** zählen Saatgut, Erde und Wasser von selbst für den Garten. Das Häkchen „Für den Garten“ ändert das, auch für andere Arten (z. B. eine Gartenschere unter Geräte).
- **Stunden** (Knopf „Stunden“): Datum, Stunden (¼ bis 24, auf Viertelstunden gerundet), optional Beet und Notiz (`garden_hours`).
- Die Saison ist das Kalenderjahr des Datums. Die Ernte zählt wie in der Ernte-Auswertung nach der Saison ihrer Pflanzung.
- Einträge stehen unter „Ausgaben und Stunden …“ und lassen sich löschen. Gartenausgaben löscht man hier oder unter Ertrag.

## Rechnung

- **Ernte im Laden**: Wert der Saison aus der Ernte-Auswertung, zu den Preisen des Hofs.
- **Kosten**: Summe der Gartenausgaben der Saison, je Art. **Kosten je kg** = Kosten ÷ geerntete kg.
- **Überschuss** = Ernte − Kosten. Dazu kommen der Überschuss je m² aller Beete und der des Vorjahrs.
- **Je Stunde** = Überschuss ÷ Stunden. Ohne eingetragene Stunden schätzt die App sie: etwa 1 Stunde je Woche für 10 m² Beet, 30 Wochen (`M2_PER_WEEKLY_HOUR`, `SEASON_WEEKS`). Die Kachel heißt dann „geschätzt“.
- **Je Beet**: Ernte, Kosten des Beets, Überschuss und Stunden. Kosten und Stunden ohne Beet stehen unter „Für den ganzen Garten“.
- **Hinweise**:
  - noch keine Ausgaben,
  - die Saison hat mehr gekostet als gebracht,
  - ein Beet mit mehr Kosten als Ernte,
  - was je m² am meisten bringt,
  - Euro je Stunde im Vergleich zum gesetzlichen Mindestlohn der Saison (`MINIMUM_WAGE`: 2024 12,41 €, 2025 12,82 €, 2026 13,90 €, 2027 14,60 €), mit dem Satz, dass Frische und Freude nicht mitzählen,
  - dass die Zeit geschätzt ist.
- Verkäufe zählen hier nicht extra. Die Ernte zählt zum Ladenwert, wie in der Ernte-Auswertung; Erlöse stehen unter Ertrag & Bilanz.

## Technik

- **Schema:**
  - `farm_expenses.garden` (boolean) und `farm_expenses.bed_id` (beim Löschen des Beets `null`), neue Kategorien `soil` und `water`.
  - Tabelle `garden_hours` in `lib/db/src/schema/garden.ts`; die DDL steht in `gardenSchemaStatements.ts`.
  - Für bestehende Datenbanken kommen die Spalte und der Fremdschlüssel nach den Beet-Tabellen. Beim ersten Anlegen der Spalte zählen frühere Saatgut-Ausgaben für den Garten.
- **API:**
  - `GET /api/farms/:farmId/garden/seasons/:season/economics` (lesen: alle mit Freigabe „Garten“),
  - `POST /farms/:farmId/garden/costs`, `DELETE /garden/costs/:costId` (nur Gartenausgaben),
  - `POST /garden/hours`, `DELETE /garden/hours/:hoursId` (Mitarbeiter und Admins),
  - `POST /farms/:farmId/expenses` nimmt optional `garden`.
- **App:** `components/garden-economics.tsx` auf `pages/ernte-auswertung.tsx`; Häkchen und „· Garten“ in `pages/ertrag.tsx`.
- **Demo-Hof:** Tomatensamen und Hochbeeterde als Gartenausgaben, 2 und 1,5 Stunden.
- **Tests:** `gardenEconomics.test.ts` (Rechnung, je Beet, Schätzung, Hinweise, Vorjahr, Mindestlohn) und `gardenEconomics.integration.test.ts` (Routen, Ertrag & Bilanz zählt einmal, Vorgaben für Saatgut/Wasser, nur Gartenausgaben löschen, Prüfungen, Rechte, Freigabe, fremde Farm, Vorjahr).

## Offen

- Fachliche Prüfung der Richtwerte: Zeit je m² und Woche, Länge der Saison; die Ladenpreise unter Ertrag.
- Kosten je Kultur (z. B. Saatgut aus dem Saatgut-Vorrat mit Preis) und Wasser aus dem Zähler sind noch nicht erfasst.
