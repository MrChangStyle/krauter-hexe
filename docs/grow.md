# Grow (Zusatzmodul, ab 18)

Das Grow-Modul begleitet den privaten Eigenanbau von Cannabis für Erwachsene im Rahmen des Konsumcannabisgesetzes (KCanG). Es gibt den Anbau im Zelt (Indoor), im Freien (Outdoor) und im Gewächshaus. Grundlage sind feste Regeln, keine KI.

Das Modul gibt gärtnerische Tipps. Es ist **keine** Rechtsberatung und gibt **keine** Empfehlungen zum Konsum. Es ist bewusst nicht als „medizinisch“ bezeichnet: Medizinisches Cannabis gibt es nur auf Rezept in der Apotheke, der Eigenanbau läuft über das KCanG.

## Zugang

- **Zusatzmodul**:
  - Bis es Tarife gibt, schaltet der Betreiber es pro Konto frei (Mehr → „Grow freischalten“, `PUT /admin/grow-access`). Der Betreiber selbst hat es immer.
  - Für das Konto gibt es die Tabelle `grow_access` mit `unlocked_at`, `age_confirmed_at` und `adults`.
- **Ab 18**:
  - Vor dem ersten Grow bestätigt das Konto, dass es volljährig ist.
  - Es gibt an, wie viele Erwachsene im Haushalt leben.
  - Ohne beides antworten alle Grow-Endpunkte mit 403.
- **Nur Web**:
  - Mit `VITE_DISABLE_GROW=true` beim Build ist das Modul komplett ausgeblendet (`GROW_ENABLED`). Das ist für spätere Store-Versionen gedacht, siehe die Richtlinien von Apple und Google.
- **Privat**:
  - Grows, Pflanzen und Tagebuch gehören dem Konto, nicht dem Hof.
  - Sie sind in keinem Export und werden mit dem Konto gelöscht (`PERSONAL_TABLES`: `grow_access`, `grows`, `grow_push_log`; Pflanzen und Tagebuch hängen per Fremdschlüssel daran).

## Daten

| Tabelle | Inhalt |
|---|---|
| `grows` | Name, Umgebung (`indoor`/`outdoor`/`greenhouse`), Substrat (`soil`/`coco`/`hydro`), Zeltgröße, Lampe und Watt (nur indoor), archiviert; draußen PLZ und Standort (auf 0,1° gerundet) |
| `grow_plants` | Name, Sorte, Züchter, Typ (`indica`/`sativa`/`hybrid`/`ruderalis`), `photo`/`auto`, feminisiert/regulär, Blütewochen, Keimdatum, 12/12-Tag, Erntedatum, Nass- und Trockengewicht |
| `grow_logs` | Tagebuch: Datum, Höhe, Wasser, pH, EC, Notiz |
| `grow_access.push` | Morgen-Push: `off`, `discreet` (Standard), `full` |
| `grow_push_log` | Ein Grow-Push pro Konto und Tag, mit den Wetter-Warnungen darin (14 Tage) |

Botanisch: Die Gattung ist *Cannabis*, die Art *Cannabis sativa*. Indica, Sativa und Ruderalis sind Typen, die Sorte (Strain) ist die Züchtung.

## Grow-Plan (`lib/growPlan.ts`, rein)

- **Phasen**:
  - Keimung (Tag 0–4), Sämling (5–18), Wachstum, Blüte, Spülen, Ernte, Trocknen (10 Tage), Curing (28 Tage).
  - Spülen dauert in Erde 10 Tage, in Kokos und Hydro 7 Tage.
- **Blütebeginn**:
  - Ein eingetragener 12/12-Tag geht immer vor.
  - Sonst indoor (photoperiodisch): 4 Wochen Wachstum.
  - Autoflower: 3 Wochen Wachstum.
  - Outdoor ab 1. August, im Gewächshaus ab 25. Juli – frühestens 3 Wochen nach dem Sämling.
- **Blütewochen** ohne Angabe: Indica 8, Hybrid 9, Sativa 11, Autoflower und Ruderalis 7.
- **Ziele je Phase**:
  - Licht: indoor 18/6 und 12/12, Autoflower 20/4.
  - Temperatur, Luftfeuchte, VPD.
  - pH je Substrat: Erde 6,2–6,8, Kokos 5,8–6,2, Hydro 5,6–6,0.
  - EC, Düngen (Wachstum stickstoffbetont, Blüte P/K, Spülen nur Wasser) und Gießen.
- **Schritte mit Datum**:
  - Keimen, Umtopfen (Autoflower direkt in den Endtopf), Toppen/LST (nie Toppen bei Autoflowern).
  - Outdoor nach den Eisheiligen raus.
  - Lollipopping und 12/12 indoor.
  - Geschlecht prüfen bei regulären Samen, Entlauben an Tag 21 der Blüte, Schimmelkontrolle outdoor.
  - Trichome 14 Tage vor der Ernte prüfen, Spülen, Ernte, Trocknen, Curing (Burping).
- **Hinweise**:
  - Später Outdoor-Start (ab Juli, photoperiodisch).
  - Ernte nach dem 20. Oktober draußen bedeutet Schimmelgefahr.

## KCanG-Check

- **Pflanzen**: Nicht geerntete Pflanzen in aktiven Grows werden gegen 3 pro Erwachsenem gezählt (§ 9 KCanG).
- **Trockengewicht**: Das Trockengewicht der Ernte der letzten 12 Monate wird gegen 50 g pro Erwachsenem am Wohnsitz gestellt (§ 3). Das ist nur ein Hinweis, weil die App den Verbrauch nicht kennt.

## Push und Wetter (`lib/growWeather.ts`)

- **Standort**: Outdoor und Gewächshaus bekommen eine PLZ oder den Gerätestandort (beim Anlegen oder in der Karte des Grows). Gespeichert wird nur die Gegend, auf etwa 10 km gerundet. Unveränderte PLZ: keine neue Suche. Ohne Standortangabe beim Ändern bleibt er, wie er ist; indoor wird er gelöscht.
- **Wetter**: `GET /grow/grows/:id/weather` – drei Tage Vorhersage (DWD über Bright Sky, wie beim Hof) und Warnungen für heute und morgen, nur wenn eine Pflanze an dem Tag im Sämling, Wachstum, Blüte oder Spülen ist:
  - Frost: Tiefstwert ≤ 2 °C.
  - Hitze: ≥ 32 °C draußen, im Gewächshaus schon ab 28 °C.
  - Sturm: Böen ≥ 60 km/h (nur draußen).
  - Regen: ≥ 5 mm in Blüte oder Spülen (nur draußen) – Schimmelgefahr.
- **Morgen-Push** um 7:30 Uhr (`sendGrowDigests` im Push-Scheduler): Schritte des Grow-Plans, die heute fällig sind, und Wetter-Warnungen. Nur für freigeschaltete, freigegebene Konten mit bestätigtem Alter.
  - Höchstens ein Push pro Tag. Eine Warnung, die gestern schon kam, kommt nicht noch einmal.
  - **Diskret** (Standard): „Little Farming – Heute: 2 Pflegeschritte für deine Pflanzen und ein Wetterhinweis.“ Auf dem Sperrbildschirm steht nichts vom Grow.
  - **Ausführlich**: Warnungen und Schritte mit Pflanzennamen. **Aus**: kein Push.
  - Einstellung auf `/grow` in der Karte „Erinnerungen“ (`PUT /grow/access` mit `push`).

## Wissen und Rechtliches

- `/grow/wissen` (`lib/grow-knowledge.ts`):
  - Grundlagen, Umgebung, Erde und Substrat, Töpfe, Dünger, Gießen.
  - Schnitt und Training, Wachstum, Blüte, Ernte/Trocknen/Curing, häufige Probleme.
- `/grow/recht` (`lib/grow-legal.ts`):
  - Die Regeln des KCanG in einfachen Worten, mit Stand-Datum, Paragraf und Quellen (Gesetzestext beim Bundesministerium der Justiz, Fragen und Antworten des Bundesgesundheitsministeriums).
  - Ausdrücklich unverbindlich. Bei Gesetzesänderungen `LEGAL_STAND` und die Punkte anpassen.

## Später

- KI-Diagnose (Mangel, Schädlinge, Schimmel) und Trichom-Check per Foto.
- Strom- und Kostenrechner, Anbindung an „Ertrag & Bilanz“.
- **Affiliate-Empfehlungen**: erst nach Prüfung durch einen Anwalt (§ 6 KCanG Werbeverbot). Dann nur neutrales Zubehör, keine Samen, klar als Werbung gekennzeichnet.
