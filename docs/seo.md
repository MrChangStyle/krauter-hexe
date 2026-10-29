# SEO und Link-Vorschau

Schritt 12 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Damit Suchmaschinen und Messenger die öffentlichen Seiten richtig zeigen, ohne die App auszuführen.

## Was es gibt

- **Eine HTML-Datei je öffentlicher Seite.** Beim Build schreibt das Vite-Plugin `seo-pages` (`vite.config.ts`) für jede Seite eine eigene `index.html`. Darin stehen jeweils:
  - der eigene Titel und die Beschreibung
  - die kanonische Adresse
  - die Link-Vorschau (Open Graph und Twitter-Karte)

  Das gilt für Start, Pflanzen, Tiere, Hof, Preise, Modul-Finder, Impressum, Datenschutz und Nutzungsbedingungen. Die Startseite (zugleich die Hülle der App) trägt die Angaben der Homepage.
- **Strukturierte Daten** auf der Startseite (JSON-LD): `WebApplication` (kostenloser Einstieg) und `Organization` mit Logo und Kontakt.
- **Vorschaubild** `public/og-image.png`, 1200 × 630, mit Logo, Name und „Pflanzen, Garten und Tiere in einer App“.
- **`sitemap.xml`**: Der Build erzeugt sie mit allen öffentlichen Seiten und dem Build-Datum.
- **`robots.txt`**: erlaubt alles außer `/app` und `/api/` und nennt die Sitemap.

## Technik

- **Quelle:** Titel, Beschreibungen und Pfade stehen in `src/lib/site-meta.ts`. Die Datei hat keine Imports, damit `vite.config.ts` sie beim Build lesen kann. `lib/site.ts` exportiert sie weiter für die Homepage.
- **Funktionen in `site-meta.ts`:**
  - `pageHtml()` setzt Titel und Kopf-Angaben einer Seite ein. Es ersetzt den Block zwischen `<!-- seo -->` und `<!-- /seo -->`, damit nichts doppelt steht.
  - `sitemapXml()` schreibt die Sitemap.
- **Server:** Der Server (`lib/webClient.ts`) schickt für einen solchen Pfad die eigene Datei (`seoPageFor`), sonst die App-Hülle. `express.static` leitet Ordner nicht auf „/preise/“ um (`redirect: false`). Pfade mit anderen Zeichen als Kleinbuchstaben, Ziffern, „-“ und „/“ bekommen immer die Hülle, so kommt niemand aus dem Build-Ordner heraus.
- **Basispfad:** Favicon und Touch-Icon stehen mit `%BASE_URL%` in `index.html`, damit sie auch unter `/funktionen/tiere` laden.
- **Wechsel in der App:** Beim Wechsel zwischen den Homepage-Seiten setzt `site-app.tsx` weiter Titel und Beschreibung im Browser.

## Tests

- `lib/site-meta.test.ts`: Seiten, Längen von Titel (höchstens 70 Zeichen) und Beschreibung (höchstens 160), Kopf-Angaben ohne Doppel, Sitemap.
- `webClient.test.ts`: Eigene Datei einer Seite, keine Weiterleitung auf den Schrägstrich, kein Weg aus dem Build-Ordner.
- Browser in Handybreite: `/funktionen/tiere`, `/preise` und `/impressum` zeigen die Seite, das Favicon lädt, es gibt kein seitliches Scrollen und keine Fehler.

## Offen

- **Seitenpasswort:** Solange `SITE_PASSWORD` gesetzt ist, steht vor allem die Passwortseite mit `noindex`. Erst nach dem Löschen sehen Suchmaschinen die Seiten.
- **Search Console:** Nach dem Start die Domain bei Google Search Console und Bing Webmaster Tools anmelden und die Sitemap einreichen. Dafür braucht es den Zugang des Betreibers.
- **Adresse:** Sie steht fest als `https://littlefarming.de` in `site-meta.ts` und `robots.txt`. Ändert sich die Domain, beides anpassen.
- **Vorschaubild je Seite:** Bisher gibt es eines für alle Seiten. Eigene Bilder je Bereich (Pflanzen, Tiere) wären ein späterer Schritt.
