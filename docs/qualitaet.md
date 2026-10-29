# Qualität: Ladezeit, Barrierefreiheit, Build

Schritt 17 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Gemessen wurde mit Lighthouse 12 (Handy, gedrosseltes Netz) gegen den gebauten Server und mit axe-core 4.10 (WCAG 2 A/AA) auf 23 Seiten der angemeldeten App mit dem Demo-Hof.

## Ergebnis

| Seite | Performance | Barrierefreiheit | Best Practices | SEO |
|---|---|---|---|---|
| Startseite `/` vorher | 48 | 90 | 100 | 100 |
| Startseite `/` nachher | 88 | 100 | 100 | 100 |
| `/preise` | 86 | 100 | 100 | 100 |
| `/impressum` | 88 | 100 | 100 | 100 |
| `/app` (Anmeldung) | 90 | 100 | 100 | 66 – absichtlich, `robots.txt` sperrt `/app` |

**Startseite, Ladezeiten:**
- Erster Inhalt (FCP) jetzt nach 2,3 s statt nach 6,6 s.
- Größter Inhalt (LCP) jetzt nach 3,5 s statt nach 7,8 s.

**axe-core:** Alle 23 geprüften App-Seiten sind ohne Befund. Geprüft wurden Hof, Pflanzen, Tiere, Hof-Aufgaben, Notizen, Mehr, Paket & Abo, Team, Beete, Pflichten, Hilfe, Suche, Archiv, Kräuter-Hexe, Futterplaner, Zucht, Bienen, Weide, Ertrag, Arzneimittel, Vorrat und Saatgut.

## Was geändert wurde

1. **Komprimierung** (`compression` in `app.ts`): Der Server schickte JavaScript, CSS und JSON ungepackt. Mit gzip schrumpft das Hauptpaket von 894 kB auf 265 kB über die Leitung.
2. **Seiten einzeln laden** (`React.lazy` in `App.tsx`):
   - Das Hauptpaket war ein Stück von 2,1 MB, über der Grenze, bis zu der der Service Worker vorlädt. Ohne Vorladen startet die App offline nicht.
   - Jetzt ist jede Seite ein eigenes Teil. Das Hauptpaket hat 894 kB, und alle Teile werden weiter für den Offline-Betrieb vorgeladen (159 Einträge).
   - Die Grenze aus Schritt 16 ist wieder zurückgenommen.
   - Die Startseite der App (Scannen), die Anmeldung und die Rechtsseiten bleiben im Hauptpaket.
3. **Schriften vom eigenen Server** (`@fontsource-variable/outfit`, `@fontsource/playfair-display`):
   - Der Google-Fonts-Import stand in der CSS nicht am Anfang. Browser haben ihn deshalb ignoriert, die Schriften Outfit und Playfair luden gar nicht.
   - Jedes Laden von Google hätte die IP-Adresse an Google übermittelt, ohne dass es in der Datenschutzerklärung steht. Jetzt geht keine Anfrage mehr an Google.
   - Die Schriftdateien landen nach dem ersten Laden im Cache, auch offline.
4. **Zoomen erlaubt:** `maximum-scale=1, user-scalable=no` ist aus dem Viewport entfernt (WCAG 1.4.4). Damit iOS beim Antippen eines Feldes nicht hineinzoomt, haben Felder dort mindestens 16 px.
5. **Kontraste:**
   - Grauer Text (`--muted-foreground`, hell): von 45 % auf 36 % Helligkeit.
   - Weißer Text auf Orange und Gelb (Sprechen-Knopf, Personen-Chips der Notizen, Giftigkeitsfilter im Archiv): auf die Stufe 700.
   - Grüner Kasten in „Mehr“: weniger Transparenz.
6. **Build ohne Warnungen** bis auf die Größe des Hauptpakets:
   - Die CSS-Warnung zum `@import` ist mit Punkt 3 erledigt.
   - Die Next.js-Anweisung `'use client'` ist aus 14 UI-Bausteinen entfernt; Vite meldete sie als Fehler bei den Source-Maps.

7. **KI-Zeitbudget** (`runModelChain`): Ein neues Modell wird nur gefragt, wenn noch mindestens 50 ms Budget übrig sind. Vorher konnte der Abbruch-Timer eine Millisekunde vor der Frist feuern. Dann startete die Kette noch ein Modell, das nie antworten konnte, und der Test dazu schlug in der CI gelegentlich fehl.

## Offen

- **Hauptpaket weiter verkleinern:** 894 kB, Vite warnt ab 500 kB.
  - Kandidaten: die Homepage mit ihren Szenen, die Anmeldung, große Bibliotheken wie Karten und PDF erst bei Bedarf laden.
  - Ziel ist eine Performance über 90 auf der Startseite.
- **Dunkler Modus:** Kontraste noch nicht mit axe geprüft.
- **Tastatur:** Reihenfolge und Fokus sind stichprobenartig geprüft (axe meldet nichts), eine vollständige Prüfung mit Screenreader steht aus.
- **Lighthouse regelmäßig:** nach größeren Änderungen wiederholen, die Werte hier fortschreiben.
