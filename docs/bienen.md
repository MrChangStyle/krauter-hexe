# Bienen

Das Modul „Bienen“ (Bereich Tiere, Freigabe `bees`) ist die digitale Stockkarte für jedes Volk. Man erreicht es über die Kachel „Bienen“ auf der Tiere-Seite (`/farm/bienen`) oder über die Suche. Hinweise und Push folgen festen Regeln des Bienenjahrs, ohne KI (`lib/bees.ts`).

## Völker

- **Ein Volk hat:**
  - Name, Bienenstand (frei, mit Vorschlägen aus den eigenen Ständen), Beute (Zander, Deutsch Normal, Dadant …),
  - Königin: Jahrgang, gezeichnet, Herkunft. Die Zeichenfarbe folgt der internationalen Regel nach der letzten Ziffer des Jahres: 1/6 weiß, 2/7 gelb, 3/8 rot, 4/9 grün, 5/0 blau.
  - Status: aktiv, aufgelöst/vereinigt, eingegangen oder abgegeben (mit Datum). Frühere Völker stehen eingeklappt unter der Liste.
- **Übersicht:** aktive Völker, Honig des Jahres, alle Hinweise (dringende zuerst). Jede Karte zeigt die letzte Durchsicht, besetzte Waben, Milbenfall und Honig.

## Stockkarte (`/farm/bienen/:id`)

Einträge mit Datum, als Verlauf (neueste zuerst, einzeln löschbar):

- **Durchsicht:** besetzte Waben, Brutwaben, Königin gesehen, Stifte gesehen, Weiselzellen, Sanftmut 1–4, Futter (kg), Milbenfall je Tag (Windel), Notiz.
- **Fütterung:** Futtersirup, Zuckerwasser, Futterteig, Honig oder Sonstiges, in kg.
- **Varroa-Behandlung:** Ameisensäure, Oxalsäure, Milchsäure, Thymol, Drohnenbrut schneiden, Sonstiges.
  - Ein Mittel aus dem Arzneimittel-Vorrat: Menge in dessen Einheit, sie geht vom Vorrat ab. Name, Einheit und Charge werden gespeichert, für das Bestandsbuch.
  - Wird der Eintrag gelöscht, geht die Menge zurück in den Vorrat.
  - Abgelaufene oder aufgebrauchte Mittel werden abgelehnt.
- **Honig:** kg und Sorte. Der Honig landet in `farm_yields` (Produkt `honey`, mit `colony_id`) und zählt damit in Ertrag & Bilanz: Wert, Verkäufe, eigene Preise (Vorschlag 13 €/kg). Wird ein Volk gelöscht (nur Admins), bleibt sein Honig dort.

Schreiben dürfen Admins und Mitarbeiter, Gäste lesen.

## Hinweise (auf der Seite)

- **Schwarmzeit (April–Juni):**
  - Schwarmkontrolle alle 9 Tage. Dringend, wenn die letzte Durchsicht mehr als 12 Tage her ist.
  - Weiselzellen bei der letzten Durchsicht (in den letzten 9 Tagen) → Schwarmstimmung, dringend.
- **Varroa:** der letzte gezählte Milbenfall der letzten 30 Tage gegen Richtwerte:
  - April–Juni: ab 3 beobachten, ab 10 behandeln.
  - Juli–September: ab 5 beobachten, ab 10 behandeln.
  - Oktober–März: ab 0,5 beobachten, ab 1 behandeln.
- **Sommerbehandlung (Juli/August):** wenn seit dem 1. Juni nicht behandelt wurde. Im August dringend.
- **Einfüttern (August/September):** wenn seit dem 15. Juli weniger als 15 kg gefüttert wurde. Im September dringend.
- **Winterbehandlung (Dezember):** wenn seit dem 15. November nicht behandelt wurde.
- **Alte Königin:** ab dem dritten Jahr → umweiseln überlegen.
- Die Seite erinnert an die Meldepflicht beim Veterinäramt (Bienenseuchen-Verordnung). Alle Werte sind Richtwerte; im Zweifel entscheidet der Bienensachverständige.

## Push (Thema „Bienen“, ab 7:30 Uhr)

Nur an dem Tag, an dem etwas fällig wird, damit nichts täglich nervt. Einmal je Hof und Tag (`farm_push_log`, Thema `bees`), an Admins und Mitarbeiter mit der Freigabe.

| Wann | Hinweis |
|---|---|
| April–Juni, genau 9 Tage nach der letzten Durchsicht (ohne Durchsicht: 1. April) | Schwarmkontrolle |
| 25. Juli, ohne Behandlung seit 1. Juni | Sommerbehandlung |
| 15. August, unter 15 kg Futter seit 15. Juli | Einfüttern |
| 10. Dezember, ohne Behandlung seit 15. November | Winterbehandlung |

## Technik

- **Tabellen** (`lib/db/src/schema/bees.ts`): `bee_colonies`, `bee_inspections`, `bee_feedings`, `bee_treatments` sowie `farm_yields.colony_id`. Die DDL steht in `beeSchemaStatements.ts`.
- **API:** `/api/farms/:farmId/bees` (Übersicht, Volk anlegen) und `/bees/:colonyId` (Stockkarte, ändern, löschen).
  - Einträge: `…/inspections`, `…/feedings`, `…/treatments`, `…/honey`.
  - Löschen: `DELETE …/:colonyId/:kind/:entryId`.
- **Suche:** aktive Völker nach Name und Stand.
- **Demo-Hof:** zwei Völker mit Durchsichten, Fütterung, Behandlung und Honig.
- **Tests:** `bees.test.ts` (Regeln), `bees.integration.test.ts` (Routen, Vorrat, Honig in Ertrag, Rechte, Freigabe, Push) und `search.integration.test.ts`.
- **Später denkbar:**
  - das Bestandsbuch der Behandlungen im Veterinäramt-Export,
  - Spracheingabe an der Beute über die Notiz hinaus (Brutwaben, Stimmung).
