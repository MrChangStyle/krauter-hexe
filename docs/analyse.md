# Analyse: Besucher der Homepage

Schritt 18 des Launch-Plans (`docs/LAUNCH-PLAN.md`): eine datenschutzfreundliche Zählung ohne Cookies, vorbereitet und abschaltbar. Sie ergänzt die eigenen Tageszahlen der App (aktive Konten, neue Konten, KI, Fehler unter Verwaltung → Betrieb) um die Besucher der öffentlichen Seiten. Damit lassen sich die Messgrößen des Marketing-Plans (`docs/MARKETING.md`, Abschnitt 8) ablesen.

## Was gezählt wird

- **Ein Seitenaufruf** auf einer öffentlichen Seite: Start, Pflanzen, Tiere, Hof, Preise, Modul-Finder, Impressum, Datenschutz, Nutzungsbedingungen. App-Seiten zählen nicht.
- **Gespeichert** in `site_visits`: Tag (Berlin), Seite, Herkunft und Anzahl. Sonst nichts: keine IP, kein Cookie, nichts im Gerätespeicher, kein Browser-Merkmal, keine Konto-Verbindung.
- **Herkunft**, in dieser Reihenfolge:
  1. Kampagne aus der Adresse: `?utm_source=…` oder `?ref=…`, z. B. `littlefarming.de/?ref=huehnerforum`. Nur Buchstaben, Ziffern, `.`, `_`, `-`, höchstens 40 Zeichen, klein geschrieben.
  2. Sonst die Domain der verweisenden Seite ohne `www.`, z. B. `google.de`.
  3. „intern“ für einen Wechsel zwischen unseren Seiten, „direkt“ ohne verweisende Seite.
- **Nicht gezählt:**
  - Bots, Link-Vorschauen (WhatsApp, Telegram, Facebook), Lighthouse und Headless-Browser.
  - Unbekannte Seiten.
  - Browser mit Global Privacy Control oder Do Not Track: Sie senden gar nichts.
- **Grenze:** Höchstens 200 verschiedene Herkünfte je Tag, weitere zählen als „andere“. So bleibt die Tabelle klein, auch wenn jemand Unsinn sendet.
- **Löschen:** Zahlen älter als etwa 13 Monate löscht die stündliche Pflege.

## Technik

- **Server:**
  - Logik in `lib/siteVisits.ts`.
  - `POST /site/visit` braucht keine Anmeldung und antwortet immer mit 204.
  - `GET /admin/site-visits` gibt es nur für den Betreiber: die letzten 30 Tage je Tag, Seite und Herkunft (Top 20).
- **App:**
  - `lib/site-visit.ts` schickt den Aufruf mit `navigator.sendBeacon`, aus `site-app.tsx` bei jedem Seitenwechsel der Homepage und aus `LegalShell` für die Rechtsseiten.
  - Die verweisende Seite und die Kampagne gehen nur beim ersten Aufruf mit.
- **Anzeige:** Verwaltung → Betrieb → „Besucher der Homepage“, getrennt nach Seiten und Herkunft.
- **Abschalten:** Env `ANALYTICS=off` in Render. Dann wird nichts gespeichert, und die Anzeige sagt, dass die Zählung aus ist.
- **Datenschutzerklärung:** Der neue Punkt „Besucherzählung der Homepage“ beschreibt das, Rechtsgrundlage ist das berechtigte Interesse.

## Für das Marketing

Jeder Kanal bekommt seinen eigenen Link, dann zeigt die Herkunft, was wirkt:

| Kanal | Link |
|---|---|
| Instagram-Profil | `littlefarming.de/?ref=instagram` |
| Facebook-Gruppen | `littlefarming.de/?ref=facebook` |
| YouTube-Beschreibung | `littlefarming.de/?ref=youtube` |
| Flyer im Landhandel (QR-Code) | `littlefarming.de/?ref=flyer` |
| Pressetext | `littlefarming.de/?ref=presse` |

## Marketing-Links führen zur Homepage

Vorher öffnete `/` mit irgendeinem Parameter die App. Damit wäre jeder Link wie `littlefarming.de/?ref=instagram` bei der Anmeldung gelandet. Jetzt zählen reine Kampagnen-Parameter (`ref`, `utm_…`, `fbclid`, `gclid`, `msclkid`) nicht als App-Link (`lib/app-entry.ts`). Kommt ein anderer Parameter dazu, etwa `?start=login`, öffnet sich weiter die App.

## Tests

- `lib/siteVisits.test.ts`: Herkunft aus Kampagne und verweisender Seite, Abschalten.
- `lib/siteVisits.integration.test.ts` gegen Postgres:
  - Zählung je Seite und Herkunft, Schrägstrich am Ende.
  - Keine App-Seite, kein Bot, keine erfundene Seite.
  - Tabelle nur mit Tag, Seite, Herkunft und Anzahl.
  - `ANALYTICS=off`.
  - Bericht nur für den Betreiber.
- `lib/site-visit.test.ts` (App): Global Privacy Control und Do Not Track, Kampagne aus der Adresse.
- `lib/app-entry.test.ts`: Marketing-Links führen zur Homepage.
- Browser:
  - `/?ref=testlauf` zeigt die Homepage, und die Kampagne erscheint in der Auswertung.
  - Mit Global Privacy Control wird nichts gesendet.

## Offen

- **Registrierungen je Herkunft:** Welcher Kanal Konten bringt und nicht nur Besuche, braucht eine Verbindung von Besuch und Konto. Das ginge ohne Cookie nur grob, etwa über die Kampagne in der Registrierung. Bewusst nicht gebaut.
- **Ein fremder Dienst** wie Plausible oder Umami wäre ein Ersatz, falls Verläufe oder Länder gebraucht werden. Dann muss die Datenschutzerklärung angepasst werden.
