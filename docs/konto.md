# Konto: Passwort vergessen und ändern

Schritt 2 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Wer sein Passwort vergisst, kommt ohne fremde Hilfe wieder ins Konto. Wer es ändern will, kann das in der App.

## So funktioniert’s

### Passwort vergessen

1. Auf der Anmeldeseite unter dem Passwort-Feld auf „Passwort vergessen?“ tippen und die E-Mail-Adresse eingeben.
2. **Mit Mailversand:** Es kommt eine Mail mit dem Knopf „Neues Passwort festlegen“. Der Link gilt eine Stunde und nur einmal.
3. **Ohne Mailversand** (solange `RESEND_API_KEY` fehlt): Der Betreiber bekommt einen Push „Passwort vergessen“. Er öffnet Mehr → Verwaltung → Benutzer, tippt beim Konto auf „Passwort-Link“ und schickt den Link per Messenger. Dieser Link gilt 24 Stunden und nur einmal.
4. Auf der Seite `/passwort-neu` zweimal das neue Passwort eingeben. Danach ist man angemeldet und in der App. Alle anderen Geräte sind abgemeldet.

### Passwort ändern

Mehr → Konto → „Passwort ändern“: Man gibt das bisherige und das neue Passwort ein. Konten, die sich bisher nur mit Google angemeldet haben, lassen das erste Feld leer und legen so ihr erstes Passwort fest. Danach sind alle anderen Geräte abgemeldet.

## Sicherheit

- **Gleiche Antwort für alle Adressen:** Die Antwort auf die Anfrage ist dieselbe, ob es ein Konto gibt oder nicht. So lässt sich nicht herausfinden, wer die App nutzt.
- **Nur der Hash wird gespeichert:** Der Link enthält einen Zufallswert mit 256 Bit. In der Datenbank (`password_resets`) steht nur sein SHA-256-Hash.
- **Einmal gültig:** Ein Link gilt nur einmal. Wird er benutzt, verfallen alle anderen offenen Links des Kontos. Abgelaufene Links räumt die tägliche Aufräumrunde nach 7 Tagen weg.
- **Andere Geräte werden abgemeldet:** `users.password_changed_at` wird gesetzt. Die Anmelde-Middleware lehnt jedes Token ab, das vorher ausgestellt wurde.
- **Grenzen:**
  - Je Adresse höchstens 3 Mails pro Stunde, ohne dass der Anfragende davon etwas merkt.
  - Je Anschluss 10 Anfragen in 15 Minuten.
  - Passwort ändern: 10 Versuche in 15 Minuten.
- **Links nur mit fester Adresse:** Links in Mails entstehen nur aus `PUBLIC_BASE_URL`, nie aus dem Host-Header der Anfrage. Ohne `PUBLIC_BASE_URL` gibt es keinen Mailversand.
- **Konto löschen:** Die Links des Kontos werden mit gelöscht.

## Betrieb

| Variable | Wirkung |
|---|---|
| `RESEND_API_KEY` | schaltet den Mailversand über Resend ein (Region EU, Domain `littlefarming.de` bei Resend bestätigt) |
| `MAIL_FROM` | Absender, Standard `Little Farming <hallo@littlefarming.de>` |
| `PUBLIC_BASE_URL` | muss gesetzt sein, sonst gehen keine Mails |

Die Anleitung für den Betreiber steht in `docs/TODO-CHANG.md`. Resend ist in der Datenschutzerklärung unter „Dienstleister“ aufgeführt (Stand der Rechtstexte jetzt 2026-10-29).

## Technik

- **Server:**
  - `lib/mail.ts` (Versand)
  - `lib/passwordReset.ts` (Links, Einlösen, Abmelden anderer Geräte)
  - `routes/password.ts` mit den Endpunkten:
    - `POST /auth/password-reset`
    - `POST /auth/password-reset/check`
    - `POST /auth/password-reset/confirm`
    - `POST /auth/password`
    - `POST /users/:id/password-reset-link` (nur der Betreiber)
- **App:**
  - `components/password.tsx` mit dem Formular „Passwort vergessen“, der Seite für das neue Passwort, dem Dialog „Passwort ändern“ und dem Knopf „Passwort-Link“ in der Verwaltung
  - `pages/passwort-neu.tsx` (öffentlich, vor dem Login)
- **Tests:**
  - `lib/passwordReset.integration.test.ts` gegen echtes Postgres
  - `components/password.test.ts`

## Offen

- **E-Mail-Bestätigung bei der Registrierung:** Sie folgt, sobald der Mailversand läuft. Bis dahin ist eine Adresse nicht bewiesen. Das ist vertretbar, weil das Seitenpasswort und die Freigabe den Zugang begrenzen.
- **Richtwerte:** Gültigkeit 1 Stunde für Mail-Links und 24 Stunden für Betreiber-Links, 3 Mails pro Stunde.
