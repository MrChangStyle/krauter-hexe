# To-do für Chang – was nur du erledigen kannst

Sortiert nach Wichtigkeit für den Start. Alles, was ohne dich geht, ist vorgebaut. Wenn du einen Punkt erledigt hast, sag kurz Bescheid oder hake ihn hier ab.

## Vor dem öffentlichen Start (Pflicht)

1. [ ] **Rechtstexte prüfen lassen**: Impressum, Datenschutzerklärung, Nutzungsbedingungen, später AGB und Widerrufsbelehrung.
   - Die Entwürfe liegen in der App unter `/impressum`, `/datenschutz`, `/nutzungsbedingungen`.
   - Am besten über eine Anwältin oder einen Dienst wie eRecht24 oder IT-Recht Kanzlei.
   - Was geprüft werden muss, steht in `docs/rechtstexte.md`. Die Entwürfe für AGB, Widerruf und Datenschutz zur Bezahlung liegen in `docs/recht/`.
   - Dazu gehören die Verträge zur Auftragsverarbeitung (Art. 28 DSGVO) mit Render, Neon, Cloudinary, Google, Resend und Cloudflare: in deren Konten annehmen bzw. herunterladen und ablegen.
2. [ ] **E-Mail-Dienst für „Passwort vergessen“**. Er ist fertig eingebaut. Bis der Schlüssel da ist, bekommst du bei einer Anfrage einen Push und schickst den „Passwort-Link“ aus Verwaltung → Benutzer:
   1. Konto bei https://resend.com anlegen, Region EU.
   2. Domain `littlefarming.de` hinzufügen und die angezeigten DNS-Einträge (SPF, DKIM) beim Domain-Anbieter eintragen.
   3. Einen API-Key erzeugen und in Render beim Dienst „Little Farming“ → Environment als `RESEND_API_KEY` eintragen.
   4. Absender: `MAIL_FROM` = `Little Farming <hallo@littlefarming.de>`.
3. [ ] **Stripe einrichten** (`docs/bezahlung.md`). Erst nach der Prüfung der Rechtstexte:
   1. Konto bei https://stripe.com anlegen, Land Deutschland, Kleinunternehmer angeben. Unternehmensdaten wie im Impressum.
   2. Produkte anlegen: „Little Farming Lite“ mit zwei Preisen (2,99 € monatlich, 29,90 € jährlich, wiederkehrend) und „Little Farming Premium“ (5,99 € monatlich, 59,90 € jährlich). Die vier Preis-IDs (`price_…`) notieren.
   3. Unter Einstellungen → Billing → Kundenportal das Portal einschalten: Zahlungsart ändern, Rechnungen, Kündigen, Paket wechseln zwischen den vier Preisen.
   4. Unter Entwickler → Webhooks einen Endpunkt anlegen: `https://littlefarming.de/api/webhooks/stripe`. Ereignisse: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Das Signatur-Secret (`whsec_…`) notieren.
   5. In Render beim Dienst „Little Farming“ → Environment eintragen:
      - `BILLING_PROVIDER=stripe`
      - `STRIPE_SECRET_KEY` (`sk_live_…`, zum Testen erst `sk_test_…`)
      - `STRIPE_WEBHOOK_SECRET`
      - `STRIPE_PRICE_LITE_MONTHLY`, `STRIPE_PRICE_LITE_YEARLY`, `STRIPE_PRICE_PREMIUM_MONTHLY`, `STRIPE_PRICE_PREMIUM_YEARLY`
   6. Erst im Testmodus mit den Testkarten von Stripe einmal bestellen, kündigen und das Konto löschen. Dann auf die echten Schlüssel umstellen.
4. [ ] **Start-Schalter** am Starttag:
   - In Render `SITE_PASSWORD` löschen, damit die Seite öffentlich ist.
   - `TEST_PHASE_END` auf den letzten Testtag setzen.
   - Optional `OPEN_REGISTRATION=true`, damit jeder sofort loslegen kann.
   - Prüfen, ob in Render `SCAN_DAILY_BUDGET` gesetzt ist (Vorschlag 300 KI-Anfragen am Tag für die ganze App). Ohne Wert gibt es keine Obergrenze für die ganze App. Für dich selbst gilt das Budget nicht.
   - `TEST_PHASE` in `lib/site.ts` stelle ich auf `false`, sag mir nur den Tag.
5. [ ] **Fachliche Prüfungen** (Richtwerte stehen in den Moduldateien unter „Offen“): Pflichten je Bundesland, am besten durch ein Veterinäramt oder eine Tierseuchenkasse. Dazu Zucht-Tage, Weide-Termine, Schädlings-Richtwerte, Saatgut-Jahre.

## Bald nach dem Start

6. [ ] **Domain `little-farming.de`** (falls vorhanden) beim Domain-Anbieter per 301 auf `https://littlefarming.de` weiterleiten.
7. [ ] **Google-Anmeldung freigeben lassen**: In der Google Cloud Console den OAuth-Zustimmungsbildschirm von „Testing“ auf „In production“ stellen. Sonst können sich nur eingetragene Testnutzer mit Google anmelden.
8. [ ] **Store-Konten** (für die Apps, Schritt 19): Google Play Console (einmalig 25 $) und Apple Developer Program (99 $ im Jahr).
9. [ ] **Marketing** (`docs/MARKETING.md`):
   - Social-Media-Konten unter „littlefarming“ sichern (Instagram, TikTok, Facebook, Pinterest, YouTube).
   - Das Zitat im Pressetext abstimmen und das Startdatum festlegen.
   - Entscheiden, ob „Tester bleiben kostenlos“ ohne Obergrenze gilt.
10. [ ] **Suchmaschinen** (`docs/seo.md`): Nach dem Start `littlefarming.de` in der Google Search Console und in den Bing Webmaster Tools anmelden und `https://littlefarming.de/sitemap.xml` einreichen.
