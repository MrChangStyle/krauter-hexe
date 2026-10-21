# Feedback an das Team

Solange die App im Test ist, können alle angemeldeten Nutzer dem Betreiber Verbesserungsvorschläge schicken.

## In der App

- Unten rechts über der Leiste sitzt eine kleine **Sprechblase** (`components/feedback-bubble.tsx`). Sie ist auf jeder Seite da, aber klein genug, um nicht zu stören.
- Ein Tipp öffnet „Feedback an das Team“. Man kann tippen oder auf **„Sprechen“** tippen und diktieren.
  - Die Spracherkennung des Browsers arbeitet auf Deutsch (`lib/speech.ts`). Diktierte Sätze werden an den Text angehängt und lassen sich danach verbessern.
  - Wo der Browser keine Spracherkennung hat, fehlt der Knopf einfach.
- Mitgeschickt wird die Seite, auf der man gerade ist, zum Beispiel `/farm/futter`.

## Beim Betreiber

- Unter **Verwaltung → Feedback** (`components/feedback-card.tsx`) steht alles, das Neueste oben. Zu jedem Eintrag gehören Absender mit E-Mail, Zeit, Seite und „gesprochen“ bei Diktaten. Neue Einträge sind hervorgehoben.
- Jeder Eintrag lässt sich als gelesen oder ungelesen markieren oder löschen.
- Zu jedem neuen Feedback bekommt der Betreiber eine **Push-Nachricht**, außer er schreibt sich selbst.

## Technik

- Tabelle `feedback`, gehört zum Konto (`PERSONAL_TABLES`).
- Routen: `POST /api/feedback` für alle Freigeschalteten, höchstens 20 pro Tag und 3 bis 2000 Zeichen. `GET`, `PUT /api/feedback/:id` (gelesen) und `DELETE` nur für den Betreiber.
- Als Seite wird nur ein Pfad der App gespeichert, nie eine fremde Adresse.
- Test: `feedback.integration.test.ts`.
