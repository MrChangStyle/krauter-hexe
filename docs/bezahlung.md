# Bezahlung: Paket & Abo

Schritt 16 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Lite und Premium als Monats- oder Jahresabo, mit Kündigen-Knopf und Webhook. Gebaut ist alles mit einer Testkasse. Für echtes Geld fehlen nur das Stripe-Konto und die Schlüssel (`docs/TODO-CHANG.md`).

## Pakete und KI-Limits

| Paket | Wer | KI-Anfragen am Tag je Bereich |
|---|---|---|
| Basis | ohne Paket, nach der Testphase | 3 |
| Testphase / Tester | alle während der Testphase, danach die Tester (`docs/premium.md`) | 15 (wie bisher) |
| Lite | Abo Lite | 15 |
| Premium | Abo Premium, von Hand vergeben | 40 |
| Betreiber | | ohne Limit |

- **Bereiche** sind die bisherigen Zähler, je für sich:
  - Pflanzen-Scan
  - Insekten-Scan
  - Hof-KI
  - Garten-KI
  - Grow
  - der erste Blick des Universal-Scans, mit dem Dreifachen
- **Wo gerechnet wird:**
  - Der Server bestimmt das Limit in `aiDailyLimit` (`lib/premium.ts`) aus dem Paket.
  - `checkAndRecordScanAttempt` holt es sich selbst, so kann kein Endpunkt es vergessen.
  - Die App zeigt es mit `aiPerDay` (`lib/billing-labels.ts`). Die Zahlen sind dieselben wie bei `PLANS` auf der Homepage.
- **Grow-KI-Check:** Er gehört zu Premium und nicht zu Lite (`routes/grow.ts`).
- **Was sich heute ändert:** Während der Testphase nichts. Nur von Hand vergebenes Premium hat jetzt 40 statt 15.

## Ablauf in der App (`/abo`, „Mehr → Paket & Abo“)

1. **Status:**
   - Paket, Tageslimit, Abo monatlich oder jährlich.
   - „Bezahlt bis …, verlängert sich automatisch“ bzw. „Gekündigt – läuft bis …“.
2. **Bestellen** (§ 312j BGB):
   - Paket und Zeitraum wählen, der Preis steht dabei.
   - Hinweis auf die Verlängerung und auf die Kleinunternehmerregelung.
   - Zwei Häkchen:
     - AGB und Widerrufsbelehrung gelesen (Links auf `/agb` und `/widerruf`).
     - Sofortiger Beginn, bei Widerruf Wertersatz.
   - Der Knopf heißt **„Zahlungspflichtig bestellen“**. Danach geht es zur Kasse von Stripe bzw. zur Testkasse.
3. **Zurück aus der Kasse:**
   - Es erscheint der Hinweis „Danke!“.
   - Der Webhook schaltet das Paket frei, meist binnen Sekunden.
4. **Kündigen** (§ 312k BGB):
   - Der Knopf „Abo kündigen“ führt zu einer Bestätigung mit Paket, Ende und Folgen, dort steht „Jetzt kündigen“.
   - Das Abo endet zum Ende des bezahlten Zeitraums, bis dahin bleibt alles.
5. **Paket wechseln** (Upgrade und Downgrade, Kasten „Paket wechseln“ über „Abo verwalten“):
   - Lite ↔ Premium und monatlich ↔ jährlich auf dem laufenden Abo, wirksam sofort.
   - Upgrade: Knopf „Kostenpflichtig zu … wechseln“; für den Rest des Zeitraums wird nur der Unterschied berechnet. Downgrade: „Zu … wechseln“; zu viel Gezahltes wird mit der nächsten Zahlung verrechnet (Stripe `proration_behavior=create_prorations`).
   - Ein gekündigtes Abo läuft mit einem Wechsel weiter (die Kündigung wird aufgehoben).
   - Zurück zu Basis ist „Abo kündigen“.
   - Technik: `POST /billing/change` (`changePlan` in `lib/billing.ts`): bei Stripe Preis des Abo-Postens tauschen und Metadaten `tier`/`interval` setzen, der Webhook bestätigt; in der Testkasse direkt, bei neuem Zeitraum beginnt ein neuer.
6. **Zahlung verwalten** (nur Stripe): Das Kundenportal von Stripe bietet Zahlungsart, Rechnungen und Fortsetzen nach einer Kündigung.
7. **Konto löschen:**
   - Ein laufendes Stripe-Abo endet vorher sofort.
   - Ist Stripe nicht erreichbar, bleibt das Konto und die Meldung bittet, es gleich noch einmal zu versuchen. So wird niemand ohne Konto weiter belastet.

- **Ohne Einrichtung:** Ist die Bezahlung nicht eingerichtet, zeigt `/abo` „Bezahlen geht noch nicht“ mit dem Hinweis auf die Testphase.
- **Wo der Weg hinführt:**
  - Der grüne Kasten oben in „Mehr“ nennt das Paket und führt nach `/abo`.
  - Die Grow-Karte verweist auf „Paket & Abo“.
  - Die Suche findet die Seite.

## Technik

- **Tabelle `premium`** (eine Zeile je Konto), neue Spalten:
  - `tier` (`lite` oder `premium`)
  - `customer_id` und `subscription_id`
  - `cancel_at_period_end`

  Für bestehende Datenbanken legt `schemaUpgrade.ts` sie an. `source` ist `stripe` oder `mock`. Von Hand vergebenes Premium bleibt `manual`.
- **`lib/billing.ts`:**
  - `billingProvider()`:
    - `stripe` nur mit `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` und allen vier `STRIPE_PRICE_*`.
    - `mock` nur außerhalb von Production.
    - Sonst ist die Bezahlung aus.
  - Stripe ohne SDK, mit REST-Aufrufen und `Idempotency-Key`:
    - Checkout (`mode=subscription`, Metadaten `userId`, `tier`, `interval` am Abo)
    - Kundenportal
    - Kündigen (`cancel_at_period_end`)
    - Sofort beenden (`DELETE`)
  - `verifyStripeSignature`: HMAC-SHA256 über `t.rohdaten`, höchstens 5 Minuten alt, Vergleich in konstanter Zeit.
  - `subscriptionUpdate`:
    - Ein laufendes Abo (`active`, `trialing`, `past_due`) gilt bis zum Periodenende plus 3 Tage Kulanz, damit eine fehlgeschlagene Abbuchung noch nachgeholt werden kann.
    - Bei anderem Status endet es sofort.
    - Das Periodenende steht je nach API-Version am Abo oder am Posten. Beides wird gelesen.
- **Routen** (`routes/billing.ts`):
  - `GET /billing`
  - `POST /billing/checkout`, `/billing/cancel`, `/billing/portal`
  - `POST /billing/mock/complete` (Testkasse)
  - `POST /webhooks/stripe`: ohne Anmeldung. Die Signatur ist der Nachweis, ohne sie antwortet die Route mit 401. `app.ts` hebt dafür die Rohdaten des Körpers auf.
- **Von Hand vergeben:** Der Betreiber kann ein bezahltes Abo nicht von Hand überschreiben oder entziehen (409).
- **Rechtstexte:**
  - `/agb` und `/widerruf` in `pages/rechtliches.tsx`, ohne Anmeldung.
  - Solange `PAYMENT_TEXTS_DRAFT` in `lib/legal.ts` an ist, mit dem Hinweis „Entwurf“.
  - Die Vorlagen stehen in `docs/recht/`.

## Testkasse (ohne Geld)

- **Einschalten:** `BILLING_PROVIDER=mock`, nur außerhalb von Production.
- **Ablauf:**
  - „Zahlungspflichtig bestellen“ führt zu `/abo/testkasse`.
  - „Bezahlen simulieren“ schreibt, was der Webhook nach einer echten Zahlung schreiben würde: `source` `mock`, einen Monat bzw. ein Jahr.
  - Kündigen und das Tageslimit funktionieren wie echt.

## Tests

- `lib/billing.test.ts`:
  - Bezahlung nur bei vollständiger Einrichtung, Testkasse nie in Production.
  - Limits je Paket.
  - Formularkodierung für Stripe.
  - Signatur: richtig, falsch, zu alt, verändert.
  - Abo zur Zeile: laufend mit Kulanz, gekündigt, beendet, ohne Konto.
  - Zeiträume.
- `lib/billing.integration.test.ts` gegen Postgres:
  - Testkasse von der Bestellung über das Limit bis zum Kündigen, ein zweites Abo wird abgelehnt.
  - Ausgeschaltete Bezahlung.
  - Signierte Stripe-Ereignisse: angelegt, gekündigt, beendet, gefälscht, fremde Ereignisse, unbekanntes Konto.
  - Keine Hand-Vergabe über ein Abo.
  - Konto löschen mit Abo: Ist Stripe nicht erreichbar, bleibt das Konto.
- `lib/billing-labels.test.ts`: Paketname, Limit, Preis, Ende.
- Browser in Handybreite: `/abo` mit der Testkasse von der Bestellung bis zum Kündigen.

## Offen

- **Stripe einrichten** (Betreiber, `docs/TODO-CHANG.md`): Konto, Produkte und Preise, Webhook, Kundenportal, Schlüssel in Render.
- **Rechtstexte prüfen lassen** (`docs/rechtstexte.md`) und danach `PAYMENT_TEXTS_DRAFT` ausschalten.
- **Richtwerte:** 3 Tage Kulanz nach dem Periodenende und die Limits 3, 15 und 40. Die Limits gelten je Bereich, nicht für alle zusammen. Nach den ersten Wochen mit echten Kosten prüfen.
- **Funktionen je Paket:** Heute unterscheidet die App Lite und Premium beim Tageslimit und beim Grow-KI-Check. Die Zuordnung weiterer KI-Funktionen zu Premium (Hof-KI, Wildtier-Radar-KI, Bienen-Standort-Check) wie auf der Seite „Preise & Pakete“ ist noch nicht durchgesetzt, alle KI zählt nur gegen das Limit. Vor dem Start der Bezahlung entscheiden und angleichen.
- **Paketwechsel rechtlich prüfen:** Upgrade sofort mit anteiliger Berechnung, Downgrade sofort mit Gutschrift – in AGB und Widerrufsbelehrung erwähnen und prüfen lassen. Im Stripe-Kundenportal den Paketwechsel ausschalten, damit es nur einen Weg gibt.
- **Rechnungen:** Stripe verschickt Belege. Eine eigene Rechnungsnummer und die Aufbewahrung (10 Jahre) laufen über Stripe; das mit dem Steuerberater abstimmen.
- **App-Stores:** In den Store-Apps (Schritt 19) gelten die Bezahlregeln von Google und Apple. Dort wird vorerst nicht verkauft.
