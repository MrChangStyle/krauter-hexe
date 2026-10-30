# Einrichtungsassistent und App-Tour

## Einrichtungsassistent

Beim ersten Start (sobald der Benutzername gewählt ist) öffnet sich der Assistent. Er hat vier Schritte:

1. **Willkommen**: kurz, was Pflanzen, Tiere und Hof sind, dazu die eigene **Nutzer-ID** zum Kopieren mit dem Hinweis, dass sie jederzeit unter Mehr → Konto steht (`docs/konto.md`).
2. **Module**: dieselben Schalter wie unter „Meine Module“, mit den Kennzeichnungen Lite und Premium. Jeder Schalter speichert sofort.
3. **Demo-Daten**: auf Wunsch zwei Beispiele je Modul laden (`docs/demo.md`).
4. **Fertig**: „Tour starten“ oder „Ohne Tour loslegen“.

„Einrichtung überspringen“ und das Schließen beenden den Assistenten in jedem Schritt. Er erscheint dann nicht wieder. Gemerkt wird das pro Konto (`user_settings.onboarded_at`, `PUT /settings { onboarded: true }`). Unter Mehr → „Meine Module“ startet **„Einrichtung neu starten“** ihn erneut.

Auch Konten, die es schon vor dem Assistenten gab, sehen ihn einmal.

## App-Tour

Die Tour ist eine Folge von Erklärfeldern über der unteren Leiste, eines je Hauptseite: Hof, Pflanzen, Tiere, Mehr. Der Schritt „Mehr“ zeigt, dass unter „Konto“ die Nutzer-ID steht. „Weiter“ springt zur nächsten Seite. „Erklärungen überspringen“ oder das X beenden die Tour. Bereiche, die das Konto ausgeblendet hat, fallen aus der Tour heraus. Die Tour lässt sich unter „Meine Module“ jederzeit neu starten.

Wo die Tour gerade steht, merkt sich das Gerät (`localStorage`, `lf-tour-step`). Das ist nur eine Anzeigehilfe.

## Technik

- `components/onboarding.tsx` (in `layout.tsx`)
- `components/module-switches.tsx` (auch auf `/module`)
- `components/demo-card.tsx`
- `lib/tour.ts` (Schritte und Speicher, mit Test)
- `components/tour-card.tsx` (Erklärfeld, `startTour`)
