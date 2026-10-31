# Fundorte – gemeinsame Karte im Archiv

Bei jeder Art im Archiv (Pflanzen, Pilze, Insekten) zeigt eine Karte, wo sie gefunden wurde – von allen Nutzern, die ihre Fundorte teilen. So sieht man, wo etwas wächst.

## So funktioniert’s

1. **Einwilligung:** Auf der Scan-Seite (Pflanzen und Insekten) fragt eine Karte einmal „Fundorte auf der gemeinsamen Karte zeigen?“ mit „Ja, anonym zeigen“ / „Nein, danke“ (`FindSpotsConsentCard`). Ohne Ja wird nichts geteilt. Ändern: Mehr → Konto → „Fundorte anonym teilen“ (`FindSpotsSwitch`); beim Ausschalten fragt die App nach und löscht alle eigenen Fundorte sofort.
2. **Beim Scan:** Mit Ja und erlaubtem Standort (den fragt die Scan-Seite wie bisher je Sitzung) rundet die App den Standort **auf dem Handy** auf die Mitte eines Felds von etwa 2 × 2 km (`lib/find-spots.ts`, `roundToCell`) und legt nur dieses Feld in die Scan-Warteschlange. Der genaue Standort verlässt das Gerät nie. Eine eigene Standort-Abfrage löst das nicht aus (`currentFindSpot` nutzt den Standort nur, wenn er schon erlaubt ist).
3. **Nach dem Scan:** Ist die Art erkannt, schickt die Warteschlange `POST /api/find-spots` mit Art und Feld (`shareFind` in `scan-queue-drain.ts`, Fehler werden verschluckt – der Scan hängt nie daran). Der Server speichert nur, wenn die Einwilligung vorliegt und das Konto die Art selbst gescannt hat, rundet noch einmal und hält nur die Feldnummer (Zeile/Spalte) und den Monat fest.
4. **Karte:** Auf der Seite der Art (`plant-detail.tsx`, `insect-detail.tsx`) steht der Abschnitt „Fundorte“. Die Kartenbilder kommen erst nach Tipp auf „Karte zeigen“ von OpenStreetMap (gleiche Zustimmung wie die Weidekarte, `lf-osm-ok`). Jedes Feld ist ein Quadrat mit der Zahl der Funde; Tipp zeigt „x Funde · zuletzt MM/JJJJ“.

## Datenschutz (Art. 6 Abs. 1 lit. a DSGVO)

- Einwilligung freiwillig, jederzeit widerrufbar; Zeitpunkt der Entscheidung in `user_settings.find_spots_decided_at`.
- Gespeichert: Konto, Art, Feldnummer (~2 km), Monat. Nicht gespeichert: Koordinaten, Uhrzeit. Öffentlich: nur Zahl der Funde je Feld und der letzte Monat – keine Namen, keine Konten.
- **Geschützte Arten** (`isProtectedSpecies` in `api-server/src/lib/findSpots.ts`): Orchideen, Enzian, Arnika, Sonnentau, Steinpilz, Pfifferling, Morchel, Hummeln, Hirschkäfer, Libellen u. a. – die Karte fasst sie zu Feldern von etwa 25 km zusammen und zeigt den Hinweis „Bitte nicht ausgraben oder pflücken“.
- Löschen: mit dem Konto (`PERSONAL_TABLES`), beim Widerruf, mit der Art (Fremdschlüssel).
- Missbrauch: höchstens 30 neue Fundorte je Konto und Tag; nur selbst gescannte Arten.
- **Fotos:** Fotos, die der Browser nicht verkleinern kann, gingen bisher als Original mit EXIF (auch GPS) hinaus. JPEGs verlieren jetzt vorher ihre EXIF/XMP-Daten (`stripJpegMetadata` in `lib/image.ts`). Verkleinerte Fotos haben ohnehin keine (Neuzeichnen über Canvas).
- Datenschutzerklärung (Abschnitt 2 „Fundorte“, Dienstleister OpenStreetMap, Speicherdauer) ergänzt, `LEGAL_VERSION` 2026-10-31.

## Technik

- Tabelle `find_spots` (`lib/db/src/schema/find-spots.ts`): `user_id`, `plant_id` oder `insect_id` (Fremdschlüssel mit Cascade), `species_key` („p:12“/„i:5“), `cell_row`, `cell_col`, `found_month`; eindeutig je Konto, Art und Feld (ein zweiter Fund im selben Feld setzt nur den Monat neu). DDL in `schemaUpgrade.ts`.
- Raster: Zeile = Breite / (2 km / 111,32 km), Spalte nach der Breite der Zeilenmitte; gleiche Rechnung in App und Server.
- `GET /api/find-spots?kind=plant|insect&speciesId=` → `cells` (Mitte, Funde, letzter Monat), `cellKm`, `protectedSpecies`, `finds`.
- Einstellung `shareFindSpots` (`null` = noch nicht gefragt) in `GET/PUT /api/settings`; `false` löscht die eigenen Fundorte.
- Keine Demo-Daten: Die Karte ist für alle sichtbar, erfundene Funde würden echte Nutzer in die Irre führen.

## Offen

- Liste der geschützten Arten ist ein **Richtwert** (BArtSchV/FFH, nach Gattung) – fachlich prüfen und ergänzen; zu viele Einträge machen die Karte nur gröber, nie genauer.
- Feldgrößen 2 km und 25 km sowie 30 Fundorte je Tag sind **Richtwerte**.
- Datenschutzerklärung vor dem Launch rechtlich prüfen lassen.
