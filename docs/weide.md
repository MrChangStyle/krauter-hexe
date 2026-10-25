# Weide

Das Modul „Weide“ (Bereich Tiere, Freigabe `pasture`) führt die Weideflächen und ein Weidetagebuch: welche Herde wann wo stand und wann eine Fläche wieder bereit ist. Man erreicht es über die Kachel „Weide“ auf der Tiere-Seite (`/farm/weide`) oder über die Suche. Feste Regeln, keine KI (`lib/pasture.ts`).

## Weiden

- **Eine Weide hat:**
  - Name und Nutzung (Weide, Mähweide, Auslauf, Wiese) sowie die Fläche in ha,
  - die **Ruhezeit** nach dem Beweiden (Vorschlag 35 Tage),
  - die **längste Weidedauer** am Stück (Vorschlag 10 Tage),
  - eine Notiz.
  - Eine Weide kann als „nicht mehr genutzt“ markiert werden; löschen dürfen nur Admins.
- **Status:**
  - **beweidet**: Eine Herde steht drauf, mit Name, Zahl und „seit … , N Tage“.
  - **ruht bis …**: Ende des letzten Beweidens plus Ruhezeit.
  - **bereit**.
- **Pro Jahr:** Weidetage (jeder Tag einmal, auch wenn zwei Herden drauf standen) und Tier-Tage (Tage × Tiere). Mit Fläche als Tier-Tage je ha, ein Maß für die Beanspruchung.

## Karte

- **Anzeigen:** Unter den Zahlen steht die Karte (OpenStreetMap, `components/pasture-map.tsx` mit Leaflet). Sie lädt erst nach einem Tipp auf **„Karte zeigen“**, weil die Kartenbilder vom Server der OpenStreetMap Foundation kommen (steht auch in der Datenschutzerklärung). Das Gerät merkt sich die Zustimmung (`localStorage` `lf-osm-ok`). Leaflet wird erst dann nachgeladen.
- **Farben:** beweidet hellgrün, ruht orange, bereit dunkelgrün, wie auf den Karten darunter. Der Name steht auf der Fläche. Ein Tipp auf eine Fläche springt zu ihrer Karte in der Liste.
- **Wo die Karte aufgeht:** um die eingezeichneten Weiden; ohne Umrisse am Standort des Hofs (oder eines Beetes), sonst über Deutschland.
- **Einzeichnen:** In „Weide anlegen/bearbeiten“ führt **„Auf der Karte einzeichnen“** zur Karte. Jeder Tipp setzt eine Ecke. Dazu gibt es „Letzte Ecke weg“, „Neu anfangen“ und einen Knopf zum eigenen Standort (GPS), praktisch am Zaun. Die übrigen Weiden sind grau zu sehen. Ab drei Ecken zeigt die App die Fläche („≈ 0,62 ha“). „Übernehmen“ und dann „Speichern“ legen den Umriss ab.
- **Fläche:** Mit Umriss rechnet der Server die Fläche aus dem Umriss (Kugelformel, `boundaryAreaHa`, in der App gleich, `lib/pasture-map.ts`). Das Feld „Fläche“ ist dann gesperrt. „Umriss entfernen“ macht es wieder frei.
- **Prüfung:** 3 bis 100 Ecken, gültige Koordinaten (auf etwa 1 cm gerundet), Fläche über 1 m² und höchstens 10.000 ha. Sich kreuzende Kanten werden nicht geprüft.

## Weidetagebuch

- **Auftreiben:** Gruppe des Hofs (die Zahl ihrer Tiere ist vorbelegt) oder „andere Tiere“ mit Namen, Anzahl und Datum.
- **Umtreiben:** auf eine andere Weide (bereite zuerst vorgeschlagen). Der alte Eintrag endet am Tag davor.
- **Abtreiben:** der letzte Tag auf der Weide.
- Einträge lassen sich löschen. Der Name der Gruppe bleibt im Tagebuch, auch wenn die Gruppe später gelöscht wird.

## Hinweise und Push

- **Umtreiben:** Steht eine Herde so lange wie die längste Weidedauer, kommt ein Hinweis, drei Tage später als dringend.
- **Zu früh beweidet:** Beginnt ein Weidegang, bevor die Ruhezeit um ist, gibt es einen Hinweis.
- **Push** (Thema „Weide“, ab 7:30 Uhr) nur an dem Tag, an dem es fällig wird:
  - die Herde steht genau die längste Weidedauer,
  - eine Weide ist wieder bereit.

  Er kommt einmal je Hof und Tag (`farm_push_log`, Thema `pasture`) an Admins und Mitarbeiter mit der Freigabe.

## Technik

- **Tabellen** (`lib/db/src/schema/pasture.ts`): `pastures` und `pasture_grazings`. Die DDL steht in `pastureSchemaStatements.ts`. Der Umriss liegt in `pastures.boundary` (jsonb, Ecken als `[Breite, Länge]`); für bestehende Datenbanken ergänzt `schemaUpgrade.ts` die Spalte.
- **API:**
  - `GET/POST /api/farms/:farmId/pastures`, `PUT/DELETE /pastures/:pastureId`,
  - `POST /pastures/:pastureId/grazings` (mit `fromGrazingId` = umtreiben),
  - `PUT /grazings/:grazingId/end`, `DELETE /grazings/:grazingId`.
  - Jede Änderung antwortet mit allen Weiden, den Gruppen samt Tierzahl und `center` (Standort des Hofs für die Karte).
  - `boundary` im Body: weglassen behält den Umriss, `null` entfernt ihn.
- **Suche:** genutzte Weiden nach Name.
- **Demo-Hof:** zwei Weiden, nebeneinander eingezeichnet (irgendwo in Thüringen); die Ziegen sind von der Obstwiese auf die Hangweide umgetrieben.
- **Tests:** `pasture.test.ts` (Status, Jahresnutzung, Hinweise, Push, Fläche und Prüfung des Umrisses), `pasture.integration.test.ts` (Auf-, Um-, Abtreiben, Prüfungen, Rechte, Freigabe, Push, Umriss) und in der App `lib/pasture-map.test.ts`.
- **Später denkbar:** Luftbild statt Straßenkarte (braucht einen Anbieter mit passender Lizenz), Weide-Parasiten-Hinweise je Tierart, Mähtermine für Mähweiden.
