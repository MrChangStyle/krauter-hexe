# Konto: Name, Nutzer-ID, Passwort vergessen und ändern

Schritt 2 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Wer sein Passwort vergisst, kommt ohne fremde Hilfe wieder ins Konto. Wer es ändern will, kann das in der App.

## So funktioniert’s

### Name ändern

- Mehr → Konto → „Dein Name“ → „Ändern“: Vor- und Nachname anpassen, z. B. nach einer Hochzeit. Ohne Namen steht dort „Eintragen“.
- Der Name erscheint überall, wo andere das Konto sehen: Team, geteilte Listen („von …“), Hof-Aufgaben. Er wird bei jeder Anzeige frisch gelesen, ändert sich also überall sofort.
- Regeln (`api-server/src/lib/personName.ts`): je Feld höchstens 50 Zeichen, nur Buchstaben (auch Umlaute und Akzente), Leerzeichen, Bindestrich, Apostroph und Punkt; leer = kein Name. Technik: `PATCH /api/auth/user` mit `firstName`/`lastName` (nur die gesendeten Felder ändern sich).
- Eine Google-Anmeldung überschreibt einen selbst gesetzten Namen nicht – Google füllt nur leere Felder.
- Die E-Mail-Adresse und die Adresse lassen sich hier nicht ändern.

### Nutzer-ID

- Jedes Konto bekommt eine eigene **Nutzer-ID**: eine Zahl mit vier Stellen (1000–9999), z. B. 4821. Sie steht unter Mehr → Konto (mit „Kopieren“) und auf der Kachel „Konto“. Der Einrichtungsassistent zeigt sie beim ersten Start, die App-Tour weist im Schritt „Mehr“ darauf hin, und die Hilfe erklärt unter „Wo finde ich meine Nutzer-ID?“ den Weg.
- Mit ihr – nicht mit der E-Mail-Adresse – holt ein Admin jemanden ins **Team**, als **Vertretung** oder als **Tierarzt** (`docs/team.md`), und mit ihr teilt man **Listen** (Hof-Aufgaben, Alltagsnotizen; `docs/alltagsnotizen.md`).
- Jede Person braucht dafür ein eigenes Konto, auch eine Vertretung oder ein Mitarbeiter.
- Bestehende Konten ohne Nummer bekommen sie automatisch: beim Serverstart, bei der nächsten Anmeldung und spätestens, wenn der Betreiber Verwaltung → Benutzer öffnet.
- Der Betreiber sieht die Nutzer-ID jedes Kontos unter Verwaltung → Benutzer (Zeile „Nutzer-ID“ unter der E-Mail-Adresse).
- Sind 80 % der vierstelligen Nummern vergeben, bekommen neue Konten fünf Stellen (dann sechs …); bestehende Nummern ändern sich nie.
- Die Nummer allein zeigt nichts von der Person. Wer sie kennt, kann sie zu einem Hof oder einer Liste hinzufügen; die Person sieht dann, wessen Hof oder Liste es ist, und kann sie verlassen. Gegen Durchprobieren: höchstens 30 Hof-Einladungen und 20 Teilen-Versuche je Konto und Tag.


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

- **Nutzer-ID:** Spalte `users.user_code` (integer, eindeutig). `lib/userCode.ts`: `assignUserCode` zieht eine freie Zufallszahl in der aktuellen Länge (`digitsFor`), `assignMissingUserCodes` beim Start für ältere Konten, neue Konten bekommen sie beim ersten `GET /auth/user`; `accountByCode` findet nur freigeschaltete, nicht gesperrte Konten. `POST /farms/:farmId/members` nimmt `userCode` statt `email`, `POST /notes/shares` `userId` (Team) oder `userCode`; `GET /users` (Betreiber) vergibt fehlende Nummern (`assignMissingUserCodes`) und liefert `userCode` je Konto (`ManagedUser`). App: `UserCodeBox` in `components/account-card.tsx`, Formulare in `farm-members-card.tsx` und `share-lists-dialog.tsx`. Tests: `userCode.test.ts`, `userCode.integration.test.ts`, `farmMembers`, `farmHandover`, `dailyNotes` (echtes Postgres).

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
