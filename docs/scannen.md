# Scannen: Ablauf und Fehlerfälle

Schritt 6 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Geprüft wurde, ob ein Scan in jedem Fall bei einem klaren Ergebnis endet und das Foto nie verloren geht.

## Ablauf

1. Foto aufnehmen oder wählen. Es wird verkleinert und kommt zuerst in die Warteschlange auf dem Gerät (IndexedDB). Ohne Netz bleibt es dort.
2. Der Universal-Scan (`POST /scan`) fragt die KI zuerst: Pflanze, Pilz, Insekt, Tier oder nichts? Dieser erste Blick hat ein eigenes Tageslimit (`docs/kostenschutz.md`).
3. Pflanze oder Insekt gehen an den Pflanzen- oder Insekten-Scan mit Tageslimit, Doppel-Erkennung und Archiv. Pilze brauchen drei Fotos (von oben, von der Seite und die Lamellen von unten), sonst gibt es keine Aussage zur Essbarkeit (siehe „Pilz-Scan“).
4. Ist die Art neu, kommt sie ins Archiv. Ist sie schon bekannt, ersetzt ein besseres Foto das Galerie-Bild (`imageQualityPolicy`, je Art eines, bei Pilzen zusätzlich die Unterseite).
5. **Meine Scans:** Das eigene Foto bleibt auf dem Gerät. Bei einem erneuten Scan derselben Art fragt die App, welches Foto bleiben soll, das alte oder das neue (`lib/my-photos.ts`, `components/photo-choice-card.tsx`).

## Pilz-Scan mit drei Fotos (30.10.2026)

- **Drei Schritte:**
  1. **Von oben:** der Hut.
  2. **Von der Seite:** Stiel, Ring, Stielbasis.
  3. **Lamellen von unten:** Farbe der Lamellen bzw. Röhren und wie sie am Stiel ansetzen.
- **Zwischenstand:** Die ersten beiden Fotos bleiben als Entwurf auf dem Gerät. Ein Neuladen zwischen den Schritten verliert nichts.
- **Essbar** wird ein Pilz nur, wenn alle drei Fotos vorliegen **und** die KI ihn zweifelsfrei und ohne Verwechslungsgefahr bestimmt. Sonst gilt er als nicht essbar, mit Begründung. Das prüft der Server fest, nicht die KI (`identifyPlant`).
- **Bestehende Einträge:**
  - Das Archiv hat je Art einen Eintrag.
  - Fehlt einem Pilz-Eintrag das Lamellen-Foto, darf ein späterer Scan mit allen drei Fotos ihn neu bewerten.
  - Einträge, die mit zwei Fotos als essbar bestätigt wurden, bleiben, wie sie sind.
- **Freigabe durch den Betreiber:**
  - Auf der Detailseite eines Pilzes sieht nur der Betreiber „Als essbar freigeben“ bzw. „Freigabe zurücknehmen“, jeweils mit Rückfrage.
  - Die Begründung der KI („Nicht als essbar bestätigt …“) weicht dem Hinweis „✅ Vom Betreiber am … anhand der Fotos geprüft und als essbar freigegeben“, mit der Mahnung, im Zweifel eine Pilzberatungsstelle zu fragen.
  - Ein freigegebener oder zurückgenommener Eintrag wird von späteren Scans nicht mehr geändert.
  - Technik: `PUT /plants/:id/edible-release`, nur für den Betreiber, nur für Pilze; `plants.edible_released_at`.
- **Technik:**
  - `PlantScanInput.imageGills`, nur zusammen mit `imageSide`.
  - Neue Spalten `plants.has_gills_image` und `plants.image_url_gills`. Das Lamellen-Foto zeigt die Detailseite, wenn es auf dem CDN liegt.
  - In der App: `PendingScan.imageGills` und Entwurf mit `side` (`lib/scan-queue.ts`).
- **Tests:**
  - `mushroomGate.test.ts`: essbar nur mit drei Fotos und sicherer Bestimmung, Text der Freigabe.
  - `mushroomScan.integration.test.ts`: Freigabe nur durch den Betreiber, Neubewertung mit drei Fotos, freigegebene Einträge bleiben.
  - App-Tests der Warteschlange mit drei Fotos.

## Fehlerfälle

| Fall | Antwort des Servers | Was der Nutzer sieht | Foto |
|---|---|---|---|
| Kein Netz | – | „Du bist offline – der Scan wird verarbeitet, sobald du wieder verbunden bist.“ | bleibt in der Warteschlange |
| Server nicht erreichbar | – | wie offline | bleibt |
| Abgemeldet | 401/403 | Anmeldeseite | bleibt, läuft nach der Anmeldung weiter |
| Tageslimit oder App-Budget erreicht | 429 | Hinweis mit Uhrzeit, ab wann es weitergeht | bleibt, läuft nach Mitternacht weiter |
| Nichts Erkennbares auf dem Foto | 422 `KEIN_MOTIV` | „… bitte näher und schärfer fotografieren“ | wird verworfen |
| Ein Tier auf dem Foto | 422 `TIER_ERKANNT` | Hinweis, dass Tiere noch nicht bestimmt werden | wird verworfen |
| KI nicht erreichbar oder Fehler | 502 | **neu:** „Noch kein Ergebnis – dein Foto ist gespeichert und wird automatisch noch einmal versucht“ | bleibt, wird mit wachsender Pause erneut versucht |
| Ungültiges Foto | 400 | Grund des Servers, unter Mehr → Warteschlange erneut startbar | bleibt als Fehler |

Fehlgeschlagene KI-Anfragen zählen nicht gegen das Tageslimit.

## Bei der Prüfung behoben (29.10.2026)

- **Ladeanzeige bei KI-Fehler:** Fiel die KI aus, stand die Scan-Seite minutenlang auf „Pflanze wird analysiert… 95 %“. Im Hintergrund versuchte es die Warteschlange still weiter, mit wachsender Pause. Jetzt gibt die Seite nach dem ersten Fehlschlag sofort ab und sagt, was passiert. Endgültige Fehler zeigen den Grund.
- **Englischer Text:** Die Antwort bei einem KI-Fehler lautete „AI-Erkennung fehlgeschlagen“. Sie ist jetzt deutsch und sagt, dass das Foto noch einmal versucht wird.

## Tests

- `lib/scan-queue-drain.test.ts` (39 Tests): Netz, Anmeldung, Limit, Budget, KI-Fehler mit Wiederholung und Pause, kein Motiv, Pilz mit zwei Fotos, Doppelte.
- `lib/costProtection.integration.test.ts`: Limits und Rückgabe.
- `lib/my-photos.test.ts`: Wahl zwischen altem und neuem Foto.
- Browser in Handybreite gegen den echten Server mit ausgefallener KI: Die Ladeanzeige endet nach wenigen Sekunden, der Hinweis erscheint, und das Foto liegt in der Warteschlange.

## Offen

- **Tiere erkennen:** Ein Foto mit einem Tier wird verworfen. Eine Tier-Erkennung wäre eine eigene Funktion für später.
