# To-do für Chang – was nur du erledigen kannst

Sortiert nach Wichtigkeit für den Start. Alles, was ohne dich geht, ist vorgebaut. Wenn du einen Punkt erledigt hast, sag kurz Bescheid oder hake ihn hier ab.

## Vor dem öffentlichen Start (Pflicht)

1. [ ] **Rechtstexte prüfen lassen**: Impressum, Datenschutzerklärung, Nutzungsbedingungen, später AGB und Widerrufsbelehrung.
   - Die Entwürfe liegen in der App unter `/impressum`, `/datenschutz`, `/nutzungsbedingungen`.
   - Am besten über eine Anwältin oder einen Dienst wie eRecht24 oder IT-Recht Kanzlei.
2. [ ] **E-Mail-Dienst für „Passwort vergessen“** (nach Schritt 2 des Launch-Plans):
   1. Konto bei https://resend.com anlegen, Region EU.
   2. Domain `littlefarming.de` hinzufügen und die angezeigten DNS-Einträge (SPF, DKIM) beim Domain-Anbieter eintragen.
   3. Einen API-Key erzeugen und in Render beim Dienst „Little Farming“ → Environment als `RESEND_API_KEY` eintragen.
   4. Absender: `MAIL_FROM` = `Little Farming <hallo@littlefarming.de>`.
3. [ ] **Zahlungsanbieter** (nach Schritt 16): Konto anlegen und Schlüssel in Render eintragen. Die genaue Anleitung kommt mit dem Schritt.
4. [ ] **Start-Schalter** am Starttag:
   - In Render `SITE_PASSWORD` löschen, damit die Seite öffentlich ist.
   - `TEST_PHASE_END` auf den letzten Testtag setzen.
   - Optional `OPEN_REGISTRATION=true`, damit jeder sofort loslegen kann.
   - `TEST_PHASE` in `lib/site.ts` stelle ich auf `false`, sag mir nur den Tag.
5. [ ] **Fachliche Prüfungen** (Richtwerte stehen in den Moduldateien unter „Offen“): Pflichten je Bundesland, am besten durch ein Veterinäramt oder eine Tierseuchenkasse. Dazu Zucht-Tage, Weide-Termine, Schädlings-Richtwerte, Saatgut-Jahre.

## Bald nach dem Start

6. [ ] **Domain `little-farming.de`** (falls vorhanden) beim Domain-Anbieter per 301 auf `https://littlefarming.de` weiterleiten.
7. [ ] **Google-Anmeldung freigeben lassen**: In der Google Cloud Console den OAuth-Zustimmungsbildschirm von „Testing“ auf „In production“ stellen. Sonst können sich nur eingetragene Testnutzer mit Google anmelden.
8. [ ] **Store-Konten** (für die Apps, Schritt 19): Google Play Console (einmalig 25 $) und Apple Developer Program (99 $ im Jahr).
9. [ ] **Marketing**: Social-Media-Konten unter „littlefarming“ sichern (Instagram, TikTok, Facebook, Pinterest, YouTube). Den Plan schreibe ich in `docs/MARKETING.md`.
