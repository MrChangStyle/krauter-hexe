# Feedback an das Team

Alle angemeldeten Nutzer können dem Betreiber Verbesserungsvorschläge schicken – in der App, und auf der Homepage auch Besucher ohne Konto.

## In der App

- Unten rechts über der Leiste sitzt eine kleine **Sprechblase** (`components/feedback-bubble.tsx`). Sie ist auf jeder Seite da, aber klein genug, um nicht zu stören.
- Ein Tipp öffnet „Feedback an das Team“. Man kann tippen oder **„Halten & sprechen“** gedrückt halten und diktieren; Loslassen beendet das Diktat (`docs/spracheingabe.md`).
  - Die Spracherkennung des Browsers arbeitet auf Deutsch (`lib/speech.ts`). Diktierte Sätze werden an den Text angehängt und lassen sich danach verbessern.
  - Wo der Browser keine Spracherkennung hat, fehlt der Knopf einfach.
- Mitgeschickt wird die Seite, auf der man gerade ist, zum Beispiel `/farm/futter`.
- **Screenshot anhängen** (seit 30.10.2026):
  - Bei einem Fehler macht man einen Screenshot mit dem Handy und hängt ihn über „Bild“ bzw. „Screenshot“ an. Das Bild kommt aus der Galerie, wie bei „Aus Galerie wählen“.
  - Die App verkleinert es auf höchstens 1600 Pixel. Eine Vorschau mit ✕ zeigt, was mitgeht.
  - Gespeichert wird es nur in unserer Datenbank, nicht im öffentlichen Bild-CDN, denn Screenshots können Persönliches zeigen. Nur der Betreiber ruft es ab.
  - Es wird mit dem Feedback gelöscht, und mit dem Konto.

## Auf der Homepage

- Unten rechts sitzt eine grüne Sprechblase **„Feedback“** (`components/site/site-feedback.tsx`), auf allen Seiten der Homepage.
- Andere Teile der Homepage öffnen sie mit einem Starttext über `openSiteFeedback(text)`. So macht es zum Beispiel „Tierart wünschen“ auf der Tiere-Seite mit „Bitte ergänzt die Tierart: “.
- Man wählt **„Idee / Vorschlag“** oder **„Problem melden“**, schreibt die Nachricht und gibt auf Wunsch eine E-Mail-Adresse für eine Antwort an. Ein Konto braucht es nicht.
- Mitgeschickt wird die Seite (z. B. `/preise`). Wer angemeldet ist, schickt das Feedback mit seinem Konto.
- Schutz vor Missbrauch:
  - ein unsichtbares Feld (Honeypot) – ist es ausgefüllt, wird nichts gespeichert, der Absender erfährt das nicht,
  - höchstens 5 Nachrichten je Stunde und Adresse,
  - höchstens 200 am Tag von Besuchern insgesamt.
- Feedback ohne Konto wird spätestens nach einem Jahr gelöscht (steht in der Datenschutzerklärung).

## Beim Betreiber

- Unter **Verwaltung → Feedback** (`components/feedback-card.tsx`; die Verwaltung zeigt nur Kacheln, ein Tipp öffnet den Bereich) steht alles, das Neueste oben. Zu jedem Eintrag gehören Absender mit E-Mail, Zeit, Seite und „gesprochen“ bei Diktaten. Neue Einträge sind hervorgehoben.
- Ein angehängter Screenshot erscheint als Vorschau unter dem Text. Ein Tipp öffnet ihn groß. Die Push-Nachricht heißt dann „Neues Feedback mit Screenshot“.
- Feedback von der Homepage trägt „Idee“ oder „Problem“, ohne Konto zusätzlich „ohne Konto“ und als Absender „Besuch der Homepage“ mit der angegebenen E-Mail-Adresse.
- Jeder Eintrag lässt sich als gelesen oder ungelesen markieren oder löschen.
- Zu jedem neuen Feedback bekommt der Betreiber eine **Push-Nachricht**, außer er schreibt sich selbst.

## Technik

- Tabelle `feedback`, gehört zum Konto (`PERSONAL_TABLES`). Ohne Konto ist `user_id` leer; dazu `kind` (idea/problem) und `contact` (E-Mail). Für bestehende Datenbanken ergänzt `schemaUpgrade.ts` die Spalten.
- Screenshot: Spalte `feedback.screenshot` (Daten-URL, JPEG/PNG/WebP, höchstens ~1,5 MB), in `FeedbackItem` nur `hasScreenshot`. Abruf über `GET /api/feedback/:id/screenshot`, nur für den Betreiber und als Bild.
- Routen: `POST /api/feedback` für alle Freigeschalteten, höchstens 20 pro Tag und 3 bis 2000 Zeichen. `POST /api/feedback/site` ohne Anmeldung (Homepage, `sendSiteFeedback`). `GET`, `PUT /api/feedback/:id` (gelesen) und `DELETE` nur für den Betreiber.
- Als Seite wird nur ein Pfad der App gespeichert, nie eine fremde Adresse.
- Test: `feedback.integration.test.ts`.
