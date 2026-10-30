# Beet-Architekt

Baustein von Little Farming (Bereich „Pflanzen“/Garten). Grundlage ist das Kapitel
„Beet-Architekt“ der **Little Farming – Spezifikation v1** und der Entwurf
„Modern · Beet mit Raster“ im **Little Farming – App-Design** (Option B). Der
Beet-Architekt plant, welche Pflanze wann in welches Beet kommt, legt ein Pflanzraster
auf das Foto des eigenen Beetes und begleitet die Beete über die Jahre. Er ersetzt den
„Bepflanzungsplaner“ und enthält den Autarkie-Planer. Gebaut wird additiv in diesem
Repo, Schritt für Schritt, jeder Schritt als eigener Pull Request.

## Entscheidungen

Aus der Spezifikation v1:
- **Beet anlegen:** Typ (Hochbeet, Freilandbeet, Gewächshaus, Frühbeet, Kübel/Balkon),
  Maße vom Nutzer (Länge × Breite, beim Hochbeet auch Höhe) – das Foto misst nicht.
  Standort: Postleitzahl → letzter/erster Frosttermin, der Kalender richtet sich danach.
  Lage: Sonnenstunden, Ausrichtung, Windschutz.
- **Foto mit Pflanzraster:** geführte Aufnahme (ganzes Beet, vier Ecken sichtbar, schräg
  von oben aus 1–3 m, Tageslicht, Kompassrichtung wird gespeichert); Nutzer tippt die vier
  Ecken an; die App rechnet aus Ecken und Maßen die Perspektive und legt ein Raster
  (z. B. 30 × 30 cm) passgenau aufs Foto. Rückfall: einfaches Raster von oben ohne Foto.
- **Bodenprofil:** Fingerprobe mit Anleitung (sandig/lehmig/tonig), pH per Teststreifen;
  daraus Mischverhältnisse und organische Dünger mit Zeitpunkt.
- **Anbaudaten pro Pflanze:** Vorziehen/Direktsaat/Auspflanzen relativ zu den
  Frostterminen, Pflanz- und Reihenabstand, Ertrag, Nährstoffbedarf, Pflanzenfamilie,
  gute/schlechte Nachbarn, Boden, Sonne, Frosthärte, Erntezeitraum. **Berechnungen nach
  festen Regeln, nicht per KI** – die KI erklärt und berät nur. Neue Pflanzen: KI-Entwurf,
  Admin gibt frei, danach gelten sie für alle.
- **Premium (Modul Garten):** KI-Analyse von Beetfoto und Laborbefund, Ecken-Vorschlag,
  Garten-Assistent, Jahreskalender, Hochbeet-Begleiter. Solange es keine Bezahlung gibt,
  wird ohne Sperre gebaut und nur markiert, was später Premium ist.
- **Design:** Option B modern (Waldgrün #14281D, Triebgrün #B9E36A, Nebelweiß #F4F5F0,
  Garten = Koralle; Bricolage Grotesque / Manrope; Henni gibt Tipps).

Vom Inhaber am 18.10.2026 ergänzt:
- **Frosttermine aus echten Wetterdaten, nicht per KI:** Standort per Postleitzahl
  (OpenStreetMap Nominatim) oder GPS, auf ~10 km gerundet; typischer letzter/erster Frost
  als Median der letzten 10 Jahre aus DWD-Daten über Bright Sky (kostenlos, auch
  kommerziell nutzbar mit Quellenangabe), je Standort einmal berechnet; jederzeit von Hand
  überschreibbar. Damit ist der offene Punkt „Wetterdienst auswählen“ entschieden.
  Tägliche Frostwarnung aus der Vorhersage mit Push folgt mit dem Kalender (Schritt 4).
- Beete gehören der **Farm** (geteilt mit den Mitgliedern, Rollen und Isolation wie bei
  den Tieren).
- Pflanzen kommen aus dem **Pflanzenarchiv plus einem festen Katalog** üblicher Gemüse,
  Kräuter, Blumen und Beeren (Startbestand der Anbaudaten, geprüft statt KI-erzeugt).
- Planen im **Raster plus KI-Vorschlag**; gewünscht: Mischkultur-Hinweise, Pflanz- und
  Erntekalender, Fruchtfolge über Jahre, Standort & Boden.

## Schritte

1. **Fundament (UMGESETZT):** Anbaudaten-Katalog (Startbestand), Beete anlegen/bearbeiten/löschen
   (Typ, Maße, PLZ mit Frostterminen, Sonne, Ausrichtung, Windschutz), Bodenprofil
   manuell; Seite „Beet-Architekt“ im modernen Design (Kachel in „Pflanzen“ wird aktiv).
2. **Raster von oben (UMGESETZT):** Pflanzen aus Katalog und Archiv in die Felder setzen; feste
   Regeln prüfen Abstand, Nachbarschaft (gute/schlechte Nachbarn) und Standort; Henni
   zeigt den Hinweis.
3. **Foto mit Pflanzraster (UMGESETZT):** geführte Aufnahme mit Kompass, Ecken antippen,
   Perspektiv-Raster aufs Foto, Pflanzen ins Foto-Raster setzen.
4. **Kalender & Fruchtfolge (UMGESETZT):** Termine aus Anbaudaten und Frostterminen, Monatsübersicht,
   Erinnerungen im Aufgabenplaner mit Push; Belegung je Jahr, Warnung bei gleicher Familie
   bzw. Starkzehrer nach Starkzehrer. Dazu die tägliche Frostwarnung aus der DWD-Vorhersage
   (ab 2 °C Lufttemperatur in der Nacht, nur wenn frostempfindliche Pflanzen draußen sind).
5. **KI (Modul Garten) (UMGESETZT):** Anbaudaten-Entwurf für neue Pflanzen mit Admin-Freigabe,
   Ecken-Vorschlag und Fotoanalyse (Schatten, Boden, Unkraut), Beet-Vorschlag. Die KI berät
   nur: jeder Vorschlag läuft durch dieselben festen Regeln wie ein Tipp ins Raster, was sie
   verletzt, wird aussortiert und benannt. KI-Funktionen und Gartenkalender tragen die
   Markierung „Premium“ (noch ohne Sperre).
   **Küche und Tierfutter im Beet-Vorschlag:** Im Dialog „KI-Vorschlag“ stellt ein
   Schieberegler ein, wie viel des Beetes Futter für die Tiere werden soll (0–100 %, in
   10er-Schritten). Vorgabe: der Anteil aus dem Garten-Assistenten, vom Assistenten
   verlinkte Futterbeete kommen mit 100 % (`?futter=`). Die KI bekommt den Anteil, die Tiere
   des Hofs und nur die dafür geeigneten, ungiftigen Pflanzen (`FODDER_CROPS`; ohne
   erfasste Tiere die für Hühner, Kaninchen und Meerschweinchen) und gibt je Pflanze
   „futter“ oder „kueche“ an. Als Futter zählt nur, was die KI so nennt **und** für die Tiere
   geeignet ist (`checkProposal`); der Vorschlag zeigt den erreichten Anteil nach Fläche
   (`fodderShareOf`, ein 2×2-Feld zählt 4) neben dem gewünschten und markiert Futterpflanzen.
6. **Garten-Assistent & Hochbeet-Begleiter (UMGESETZT):** Ziele (Selbstversorgung/Tierfutter), Bedarf
   aus dem Tier-Modul, Aufteilung auf die Beete, Schichtaufbau mit Materialmengen,
   Auffüllen, letzte Pflanztermine. Alles nach festen Faustwerten (Fläche pro Person und
   Richtung, Grünfutter je Tierart, Ertrag je m², Zeit je m²); die KI füllt auf Wunsch ein
   Beet mit den passenden Wünschen (Beet-Vorschlag aus Schritt 5).
   **So rechnet der Assistent** (aufklappbar unter der Aufteilung, `calculation` im Plan): die
   Rechnung mit den eigenen Zahlen Zeile für Zeile – Küche (Personen × m² je Richtung), Grünfutter
   je Tierart, Saison und Winter in m², und welche Beete den gewünschten Futteranteil ergeben.
7. **Ernten (UMGESETZT):** Ernte je Pflanzung eintragen (Datum, kg, Küche oder Tierfutter);
   der Garten-Assistent rechnet mit den eigenen Erträgen der letzten Saison mit Ernten statt
   mit den Faustwerten („Optimieren“ aus der Spezifikation). Der Wirtschaftlichkeits-Tracker steht in
   `docs/garten-wirtschaftlichkeit.md`.

8. **Düngung (UMGESETZT, `docs/bio.md` B7):**
   - Je Beet eine Karte „Düngung“: Datum, Art (Kompost, Mist vom eigenen Hof oder zugekauft, Gründüngung, Hornspäne, Pflanzenjauche, organischer Handelsdünger, Mineraldünger, Sonstiges), Bezeichnung und Menge.
   - Darunter der **Kreislauf Stall → Beet**: Mist der eigenen Tiere im Jahr nach Richtwerten je Art und die Beetfläche, die er bei 3 kg/m² reicht.
   - Für alle Höfe; auf naturnahen und Bio-Höfen steht Mineraldünger am Ende der Auswahl, auf Bio-Höfen mit Warnung.

Definition of Done je Schritt wie beim Farm-Modul: Typecheck, Build, alle Tests grün
(neue inkl. Isolation gegen echtes Postgres), Browser-Test in Handybreite, replit.md
aktualisiert.

## Verschieben und KI-Vorschlag (30.10.2026)

- **Verschieben im Raster**, auf zwei Wegen:
  - Eine Pflanzung mit dem Finger oder der Maus auf ein freies Feld ziehen. Die Vorschau zeigt weiß, wo sie landet, rot, wenn sie dort nicht passt.
  - Die Pflanzung antippen, „Verschieben“ wählen und das neue Feld tippen. Nur Felder, auf die sie passt, lassen sich wählen. Bei großen Pflanzen zählt die linke obere Ecke.
  - Die Pflanzung behält ihre Nummer, Ernten und Häkchen bleiben also dran.
  - Der Server prüft wie beim Setzen auf Rand und Überschneidung; den alten Platz darf sie mitbenutzen.
  - Technik: `PATCH /farms/:farmId/plantings/:plantingId` (`movePlanting`), App `lib/bed-move.ts`.
- **KI-Vorschlag hing:**
  - Der Aufruf hatte keine Zeitgrenze und nur 2048 Ausgabe-Tokens. Ein nachdenkendes Modell verbrauchte sie, antwortete leer, und die Kette begann von vorn – die Ladeanzeige lief minutenlang.
  - Jetzt: minimales Nachdenken, 8192 Tokens, höchstens 45 Sekunden (je Modell 25). Die App wartet höchstens 55 Sekunden.
  - Danach kommt „Die KI hat zu lange gebraucht“. Der Versuch zählt nicht gegen das Limit.
  - Die beiden Foto-Auswertungen des Beets (Ecken, Foto-Check) haben dieselbe Zeitgrenze bekommen.

## Offen

- **Richtwerte fachlich prüfen** (Gärtnerin, Gartenbauberatung):
  - Garten-Assistent: Fläche je Person und Jahr (Gemüse 40 m², Lagergemüse 20, Kräuter 2, Obst 5), Ertrag 3 kg/m² für Küche und Grünfutter, 4 kg/m² für Lagerfutter, Grünfutter je Tier und Tag (`FODDER_KG_PER_DAY`), 10 m² je Wochenstunde.
  - Hochbeet-Begleiter: Schichten nach Gewicht 7 : 4 : 3 : 3 unter mindestens 15 cm Erde, Nachfüllen etwa 10 cm im Jahr, Fruchtfolge Stark-, Mittel-, Schwachzehrer nach Jahren.
  - Herbst: Ernteverlängerung mit Vlies (+14 Tage, Hochbeet +7), Frühbeet (+28) und Gewächshaus (+42).
  - Düngung: Mist je Tier und Jahr (`MANURE_KG_PER_YEAR` in `lib/fertilizing.ts`, z. B. Huhn 60 kg, Ziege 1,2 t, Rind 12 t) und 3 kg gut verrotteter Mist je m² für Starkzehrer.
  - Anbaudaten-Katalog (49 Kulturen): Abstände, Wochen relativ zum letzten Frost, gute und schlechte Nachbarn.

