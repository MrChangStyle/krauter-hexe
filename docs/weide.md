# Weide

Das Modul „Weide“ (Bereich Tiere, Freigabe `pasture`) führt die Weideflächen und ein Weidetagebuch: welche Herde wann wo stand, wann eine Fläche wieder bereit ist, wann gemäht wird und wo Wurmlarven von früheren Weidegängen drohen. Man erreicht es über die Kachel „Weide“ auf der Tiere-Seite (`/farm/weide`) oder über die Suche. Feste Regeln, keine KI (`lib/pasture.ts`, Schnitt und Parasiten in `lib/pastureCare.ts`).

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

- **Auftreiben:** Gruppe des Hofs (die Zahl ihrer Tiere ist vorbelegt) oder „andere Tiere“ mit Namen, Anzahl, Datum und optional der Tierart. Die Tierart steht am Eintrag (`pasture_grazings.species`): von der Gruppe übernommen, bei anderen Tieren wie gewählt, sonst leer.
- **Umtreiben:** auf eine andere Weide (bereite zuerst vorgeschlagen). Der alte Eintrag endet am Tag davor.
- **Abtreiben:** der letzte Tag auf der Weide.
- Einträge lassen sich löschen. Der Name der Gruppe bleibt im Tagebuch, auch wenn die Gruppe später gelöscht wird.

## Schnitt

- **Gemäht** gibt es an jeder Weide: Datum, optional Ballen und Notiz (Heu, Silage, nachgemäht nach dem Beweiden). Die letzten zehn Schnitte stehen unter „Schnitte“ und lassen sich löschen.
- **Nächster Schnitt** nur bei Mähweide und Wiese (Richtwerte, `MOW_RULES`):

  | Nutzung | erster Schnitt ab | danach | letzter bis |
  |---|---|---|---|
  | Mähweide | 15.05. | alle 42 Tage | 30.09. |
  | Wiese | 15.06. | alle 56 Tage | 30.09. |

  Gezählt wird ab dem letzten Schnitt oder dem Ende des letzten Weidegangs des Jahres, je nachdem, was später war. Nach dem 30.09. (oder wenn der nächste Schnitt danach läge) gilt der erste Termin des nächsten Jahres. Die Karte zeigt „N Schnitte dieses Jahr · nächster ab …“.
- **Hinweis „Schnitt fällig“**, solange keine Herde draufsteht; dringend 21 Tage nach dem Termin („das Gras wird jetzt holzig“).
- **Heuwetter:** Ist ein Schnitt fällig und der Standort des Hofs bekannt, schaut die App in die Vorhersage (Bright Sky, wie das Hof-Wetter): die ersten 3 Tage am Stück mit weniger als 1 mm Regen („Heuwetter: ab 27.10. 3 trockene Tage“) – oder dass keine kommen (für Silage reicht ein trockener Tag). Die Vorhersage wird nur geladen, wenn ein Schnitt fällig ist.

## Parasiten

Steht eine Herde auf einer Weide, auf der vor Kurzem schon Tiere derselben Gruppe standen, kommt ein Hinweis (`parasiteHint`): Deren Wurmlarven oder -eier können noch im Gras sein. Ziegen und Schafe zählen als eine Gruppe, weil sie dieselben Würmer teilen; Rinder, Pferde, Schweine und Geflügel jeweils für sich. Wie lange das zählt (Richtwerte, `PARASITE_RULES`):

| Gruppe | Zeitraum | Hinweis |
|---|---|---|
| Ziegen, Schafe | 90 Tage | Magen-Darm-Würmer (u. a. Roter Magenwurm); Kotprobe in 3–4 Wochen, Wechselweide mit Rindern oder Pferden, nachmähen. Juli bis September: „Im Spätsommer ist der Wurmdruck am höchsten.“ |
| Rinder | 90 Tage | Magen-Darm-Würmer und Lungenwurm; Jungrinder im ersten Weidejahr beobachten, Kotprobe, Wechselweide. |
| Pferde | 60 Tage | kleine Strongyliden; Äpfel 1–2× pro Woche absammeln, Kotprobe vor dem Entwurmen. |
| Schweine | 365 Tage | Spulwurm-Eier überdauern Jahre im Boden; Auslauf wechseln, Kotprobe. |
| Geflügel | 90 Tage | Spulwurm-Eier und Kokzidien; Auslauf teilen und abwechselnd ruhen lassen. |

Ohne Tierart (andere Tiere ohne Angabe, ältere Einträge ohne Gruppe) gibt es keinen Hinweis. Die App rät nie zu einem Mittel – entwurmt wird nach Kotprobe und mit dem Tierarzt.

## Hinweise und Push

- **Umtreiben:** Steht eine Herde so lange wie die längste Weidedauer, kommt ein Hinweis, drei Tage später als dringend.
- **Zu früh beweidet:** Beginnt ein Weidegang, bevor die Ruhezeit um ist, gibt es einen Hinweis.
- **Push** (Thema „Weide“, ab 7:30 Uhr) nur an dem Tag, an dem es fällig wird:
  - die Herde steht genau die längste Weidedauer,
  - eine Weide ist wieder bereit,
  - an einer Mähweide oder Wiese ist der nächste Schnitt fällig („Talwiese: Schnitt fällig“).

  Er kommt einmal je Hof und Tag (`farm_push_log`, Thema `pasture`) an Admins und Mitarbeiter mit der Freigabe.

## Technik

- **Tabellen** (`lib/db/src/schema/pasture.ts`): `pastures`, `pasture_grazings` und `pasture_cuts`. Die DDL steht in `pastureSchemaStatements.ts`. Der Umriss liegt in `pastures.boundary` (jsonb, Ecken als `[Breite, Länge]`). Für bestehende Datenbanken ergänzt `schemaUpgrade.ts` die Spalten `boundary` und `pasture_grazings.species` und übernimmt bei alten Einträgen die Tierart der Gruppe.
- **API:**
  - `GET/POST /api/farms/:farmId/pastures`, `PUT/DELETE /pastures/:pastureId`,
  - `POST /pastures/:pastureId/grazings` (mit `fromGrazingId` = umtreiben),
  - `PUT /grazings/:grazingId/end`, `DELETE /grazings/:grazingId`,
  - `POST /pastures/:pastureId/cuts` (gemäht, `cutOn`, `bales`, `notes`), `DELETE /pasture-cuts/:cutId`.
  - Jede Änderung antwortet mit allen Weiden, den Gruppen samt Tierzahl und `center` (Standort des Hofs für die Karte).
  - `boundary` im Body: weglassen behält den Umriss, `null` entfernt ihn.
- **Suche:** genutzte Weiden nach Name.
- **Demo-Hof:** zwei Weiden, nebeneinander eingezeichnet (irgendwo in Thüringen); die Ziegen sind von der Obstwiese auf die Hangweide umgetrieben, auf der sie vor gut zwei Monaten schon standen (Wurm-Hinweis). Dazu die Talwiese (Wiese, 0,6 ha), vor 45 Tagen gemäht, 18 Ballen; die Obstwiese ist nach dem Beweiden nachgemäht.
- **Tests:** `pasture.test.ts` (Status, Jahresnutzung, Hinweise, Push, Fläche und Prüfung des Umrisses), `pastureCare.test.ts` (Schnittplan, Heuwetter, Schnitt- und Wurm-Hinweise, Push), `pasture.integration.test.ts` (Auf-, Um-, Abtreiben, Prüfungen, Rechte, Freigabe, Push, Umriss, Schnitte, Tierart) und in der App `lib/pasture-map.test.ts`.
- **Später denkbar:** Luftbild statt Straßenkarte (braucht einen Anbieter mit passender Lizenz), Schnitttermine je Region oder Höhenlage, Kotproben-Ergebnisse an der Weide.

## Offen

- Fachliche Prüfung der Richtwerte: Schnitttermine und Abstände (`MOW_RULES`, 21 Tage bis „holzig“), Heuwetter (3 Tage unter 1 mm), die Zeiträume und Texte der Wurm-Hinweise (`PARASITE_RULES`), Ruhezeit 35 und Weidedauer 10 Tage.
