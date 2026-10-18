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
5. **KI (Modul Garten):** Anbaudaten-Entwurf für neue Pflanzen mit Admin-Freigabe,
   Ecken-Vorschlag und Fotoanalyse (Schatten, Boden, Unkraut), Beet-Vorschlag.
6. **Garten-Assistent & Hochbeet-Begleiter:** Ziele (Selbstversorgung/Tierfutter), Bedarf
   aus dem Tier-Modul, Aufteilung auf die Beete, Schichtaufbau mit Materialmengen,
   Auffüllen, letzte Pflanztermine.

Definition of Done je Schritt wie beim Farm-Modul: Typecheck, Build, alle Tests grün
(neue inkl. Isolation gegen echtes Postgres), Browser-Test in Handybreite, replit.md
aktualisiert.
