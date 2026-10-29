# Apps für Android und iOS

Schritt 19 des Launch-Plans (`docs/LAUNCH-PLAN.md`): die Store-Apps vorbereitet, so weit es ohne Store-Konten geht. Die Web-App bleibt der Hauptweg: Sie ist installierbar (PWA) und braucht keinen Store.

## Aufbau

`artifacts/mobile` ist eine **Capacitor-Hülle** (Capacitor 7) um die Web-App:

- `capacitor.config.json`:
  - App-ID `de.littlefarming.app`, Name „Little Farming“.
  - Die App lädt `https://littlefarming.de/app`. Anmeldung, Cookies und Updates laufen wie im Browser, und eine neue Version der App braucht keine neue Store-Version.
  - `allowNavigation` erlaubt nur littlefarming.de.
  - Ohne Netz beim Laden erscheint `www/offline.html` mit „Noch einmal versuchen“.
- `android/`: das Android-Projekt (Gradle) mit diesen Berechtigungen:
  - Kamera (Scannen)
  - Mikrofon („Halten & sprechen“)
  - ungefährer Standort (Region)
- `ios/`: das Xcode-Projekt mit:
  - deutschen Texten für Kamera, Fotos, Mikrofon und Standort
  - Region `de`
  - `WKAppBoundDomains` littlefarming.de, damit der Service Worker der Web-App auch in iOS arbeitet (Offline, Warteschlange)
- `assets/`: Vorlagen für App-Icon (`icon-only.png`, 1024 × 1024, randlos) und Startbild (`splash.png`, 2732 × 2732) aus dem Logo der App.
- **In der Web-App:** `lib/native-app.ts` erkennt die Hülle. Dort fehlt „Mit Google anmelden“, weil Google die Anmeldung in eingebetteten Web-Ansichten verweigert („disallowed_useragent“). In der App meldet man sich mit E-Mail und Passwort an.

## Bauen (braucht Rechner mit Android Studio bzw. Xcode)

```bash
cd artifacts/mobile
pnpm install
# Icons und Startbilder in allen Größen erzeugen (einmalig, nach Änderungen am Logo):
npx @capacitor/assets generate --iconBackgroundColor "#2F5B44" --splashBackgroundColor "#F4F1EA"
npx cap sync
npx cap open android   # Android Studio: Build → Generate Signed Bundle (AAB)
npx cap open ios       # Xcode (Mac): vorher in ios/App „pod install“, dann Product → Archive
```

## Vor der Veröffentlichung

1. **Konten** (`docs/TODO-CHANG.md`): Google Play Console (einmalig 25 $) und Apple Developer Program (99 $ im Jahr).
2. **Signieren:**
   - Android: Upload-Schlüssel erzeugen und sicher aufbewahren.
   - iOS: Team in Xcode wählen.
3. **Store-Einträge:**
   - Texte (aus `docs/MARKETING.md`)
   - Screenshots, die bereits für die Homepage gemacht wurden (`public/site/screens/`, 390 px; die Stores wollen größere, also neu aufnehmen)
   - Datenschutzerklärung: `https://littlefarming.de/datenschutz`
   - Altersfreigabe: Grow ist ab 18 und in der App nur für bestätigte Erwachsene sichtbar. Fragebogen ehrlich ausfüllen.
4. **Datenschutz-Angaben** (Google „Data safety“, Apple „App Privacy“): E-Mail, Fotos, Standort (ungefähr, nur Stadtname gespeichert), Nutzungsdaten. Kein Tracking.
5. **Bezahlung in den Apps:** In den Store-Apps verlangen Google und Apple für digitale Abos ihre eigene Bezahlung. Bis das geklärt ist, verkaufen die Apps nichts. „Paket & Abo“ zeigt dort statt der Bestellung „In dieser App lassen sich keine Pakete buchen“ (`isNativeApp` in `pages/abo.tsx`); Status und Kündigen bleiben.

## Offen

- **Bauen und testen** auf echten Geräten: Kamera, Fotoauswahl, Mikrofon, Push. Hier lässt sich nur das Projekt erzeugen, ohne Android-SDK und Xcode.
- **Push in der App:** Web-Push funktioniert in der Android-WebView und in iOS-WKWebView nicht. Erinnerungen in den Store-Apps brauchen `@capacitor/push-notifications` mit Firebase (Android) und APNs (iOS) sowie eine zweite Versandart im Server.
- **Google-Anmeldung in der App:** über `@capacitor/browser` (System-Browser) oder ein natives Google-Plugin.
- **Abo in der App:**
  - Die Bestellung ist in der Hülle ausgeblendet. Offen ist, ob und wie die App auf die Web-App verweisen darf; das hängt von den Store-Regeln ab.
  - Oder In-App-Käufe einbauen. Dafür gibt es eigene Gebühren von 15–30 %.
- **Apple-Prüfung (Richtlinie 4.2):** Apple lehnt reine Webseiten-Hüllen manchmal ab. Für die Prüfung gegebenenfalls native Funktionen ergänzen, etwa Push, Kamera-Plugin oder Teilen.
