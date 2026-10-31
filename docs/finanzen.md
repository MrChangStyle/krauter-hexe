# Finanzen – Pakete, Umsatz und KI-Kosten

Nur für den Betreiber: **Verwaltung → Finanzen**. Dort steht, wer welches Paket hat, was eingenommen wurde, was die KI ungefähr gekostet hat und was übrig bleibt – je Monat für die letzten 12 Monate.

## Was die Seite zeigt

1. **Kennzahlen des laufenden Monats:**
   - Umsatz und Zahl der Zahlungen
   - laufende Abos im Monat: alle bezahlten, nicht gekündigten Abos, ein Jahresabo als Zwölftel, zum Listenpreis
   - KI-Kosten (geschätzt) und die Zahl der KI-Anfragen
   - Ergebnis = Umsatz − KI-Kosten
2. **Summe der letzten 12 Monate** und eine **Tabelle je Monat** (Umsatz, KI-Anfragen, KI-Kosten, Ergebnis). **„Als CSV herunterladen“** gibt dieselben Zahlen als Datei für Tabellenkalkulation oder Steuerberater (Semikolon, Dezimalkomma).
3. **Wer hat welches Paket:** jedes Konto mit Name, E-Mail, Nutzer-ID und Paket. Filter-Chips mit Anzahl: Premium, Lite, Geschenkt (von Hand), Tester, Testphase, Basis, Betreiber. Bei Abos: monatlich/jährlich, „bezahlt bis“ bzw. „gekündigt, läuft bis“, Betrag je Monat; „(Testkasse)“ für Test-Abos.
4. **Letzte Zahlungen** (20): Datum, Konto (oder „gelöschtes Konto“), Paket, Betrag.

## Woher die Zahlen kommen

- **Umsatz:** Tabelle `payments`. Stripe schreibt jede bezahlte Rechnung über den Webhook `invoice.paid` (`recordStripeInvoice` in `lib/finance.ts`); das Konto kommt aus den Metadaten des Abos, sonst über Abo- oder Kundennummer aus `premium`. Dieselbe Rechnung zählt nur einmal (`external_id` eindeutig). Die Testkasse schreibt beim Bezahlen eine Zahlung zum Listenpreis. Brutto wie bezahlt, ohne Gebühren von Stripe.
- **Paket je Konto:** dieselben Regeln wie überall (`premiumFrom` in `lib/premium.ts`, von `premiumOf` mitbenutzt).
- **KI-Kosten:** Zahl der KI-Anfragen je Tag (`usage_daily`, Kennzahl `ai_actions`, 400 Tage aufbewahrt) × Kosten je Anfrage. Die Kosten je Anfrage sind ein **Richtwert**: 0,3 Cent (Gemini Flash mit Foto), änderbar in Render über `AI_COST_PER_REQUEST_CENT` (z. B. `0,5`). Die echte Rechnung steht in der Google Cloud Console.

## Datenschutz und Aufbewahrung

- Gespeichert je Zahlung: Konto-Kennung, Anbieter, Rechnungsnummer des Anbieters, Betrag, Währung, Paket, Zeitraum, Zeitpunkt – keine Zahlungsdaten.
- Wird ein Konto gelöscht, bleibt die Zahlung für die Buchhaltung (Aufbewahrungspflicht, Art. 6 Abs. 1 lit. c DSGVO), aber ohne Bezug zum Konto (`account_id` wird leer, `lib/accountDeletion.ts`). Die Rechnung selbst führt Stripe.
- Nur der Betreiber sieht die Seite (`GET /admin/finance`, `requireOwner`).

## Technik

- Tabelle `payments` (`lib/db/src/schema/premium.ts`), DDL in `schemaUpgrade.ts`.
- `lib/finance.ts`: `financeOverview`, `recordPayment`, `recordStripeInvoice`, `invoicePayment` (alte und neue Stripe-API-Form), `PRICE_CENTS` (gleich wie `PLANS` auf der Homepage), `aiCostPerRequestCent`.
- `GET /admin/finance` (`routes/premium.ts`) → `FinanceOverview`.
- App: `components/finance-card.tsx`, `lib/finance-labels.ts` (Euro, Monat, CSV), Kachel „Finanzen“ in `pages/verwaltung.tsx`.
- Tests: `finance.test.ts`, `finance.integration.test.ts` (echtes Postgres: Pakete, Testkasse, Webhook doppelt, KI-Kosten, nur Betreiber, Konto löschen), `finance-labels.test.ts`.
- Keine Demo-Daten: Umsatz und KI-Kosten müssen echt sein.

## Offen

- **Kosten je KI-Anfrage (0,3 Cent)** ist ein Richtwert – mit der ersten Google-Rechnung abgleichen und `AI_COST_PER_REQUEST_CENT` setzen.
- **Erstattungen** (Stripe `charge.refunded`) und **Gebühren** von Stripe sind noch nicht abgezogen.
- **Paketwechsel mit Verrechnung:** Stripe stellt die Differenz mit der nächsten Rechnung; sie erscheint dann als Zahlung. In der Testkasse wird beim Wechsel nichts gebucht.
- Weitere Kosten (Server, Datenbank, Domain) sind nicht erfasst.
