# Premium

Premium sind die Funktionen, die im Betrieb Geld kosten. Das ist vor allem KI: Jede Anfrage an Gemini wird bezahlt. Alles ohne KI bleibt kostenlos.

## Was gehört zu Premium

| Bereich | Kostenlos | Premium |
|---|---|---|
| Grow | Grow-Plan, Tagebuch, KCanG-Check, Wissen und Rechtliches, Push-Erinnerungen, Wetter-Warnungen, Strom- und Kostenrechner | KI-Check per Foto: Gesundheit und Trichome |

Die übrigen KI-Funktionen der App (Pflanzen- und Insektenscan, Hof- und Garten-KI) sind vorerst unverändert kostenlos mit Tageslimit. Ob sie später zu Premium gehören, ist noch offen.

## Stand: ohne Bezahlung

- Der Betreiber vergibt Premium per Hand: Mehr → „Premium vergeben“ (`PUT /admin/premium` mit `email`, `active`, optional `until`).
  - **Ohne Ende** oder **bis zu einem Tag**. „Bis 31.12.“ schließt diesen Tag ein.
  - Zurücknehmen mit `active: false`. Abgelaufene Einträge bleiben in der Liste stehen und sind dort als „abgelaufen“ markiert.
- Der Betreiber selbst hat Premium immer.
- `GET /premium` liefert `{ active, until, source }` für das angemeldete Konto.
- Auch mit Premium gilt das KI-Tageslimit (15 KI-Checks pro Tag), damit die Kosten begrenzt bleiben.

## Daten

| Tabelle | Inhalt |
|---|---|
| `premium` | Ein Eintrag pro Konto. `source` ist `manual` (später der Zahlungsanbieter). `plan` ist `monthly`/`yearly`, sobald bezahlt wird; bei Hand-Vergabe ist es leer. `active_until` ist das Ende (leer = ohne Ende), dazu `granted_at`. Die Tabelle steht in `PERSONAL_TABLES` und wird mit dem Konto gelöscht. |

## Pakete (Konzept, vorläufig)

Die Homepage (`/preise`, `docs/landingpage.md`) zeigt drei Pakete. Die Preise sind ein **Vorschlag** und stehen an einer Stelle: `PLANS` in `artifacts/pflanzenscanner/src/lib/site.ts`. In der App ändert sich dadurch noch nichts. Freigeschaltet wird weiter per Hand, das KI-Tageslimit bleibt bei 15.

| Paket | Preis (Vorschlag) | KI-Anfragen am Tag | Inhalt |
|---|---|---|---|
| Basis | kostenlos | 3 zum Kennenlernen | alle Module ohne KI, Erinnerungen, Team |
| Lite | 2,99 €/Monat, 29,90 €/Jahr | 15 | dazu Pflanzen-/Insekten-Scan, Pflanzendoc, Beet-KI |
| Premium | 5,99 €/Monat, 59,90 €/Jahr | 40 | dazu Hof-KI (Tierart, Haltungs-Wiki, Futter-Etikett), Bienen-Standort-Check, Wildtier-Radar-KI, Grow-KI-Check |

Welche KI-Funktion welches Paket braucht, steht je Modul in `MODULE_SITE` (`ai.plan`). Der Modul-Finder empfiehlt das Paket daraus und aus der Antwort auf „KI nutzen?“.

**Noch anzugleichen, bevor bezahlt wird:**
- Die Kennzeichnung in der App: heute steht „Lite“ an Modulen, die kostenlos gehen und mit Premium mehr können (z. B. Grow), und die Beet-KI trägt „Premium“. Nach dem Konzept gehört die Beet-KI zu Lite.
- Die Limits je Paket im Server (`withAiQuota`).

## Geplant: Bezahlung

- **Modell**: Monatsabo und Jahresabo. Die Preise stehen noch nicht fest.
- **Anbieter**: noch offen. Er schreibt dieselbe Tabelle: `source` = Anbieter, `plan`, `active_until` = Ende des bezahlten Zeitraums. Die Prüfung (`premiumOf`) bleibt dieselbe.
- **Vorher zu klären**:
  - Preise, Impressum und AGB.
  - Widerrufsbelehrung für digitale Inhalte.
  - Kündigungsbutton (§ 312k BGB).
  - Rechnungen und Umsatzsteuer, etwa ob die Kleinunternehmerregelung greift.
- **App Stores**: noch nicht. In den Stores gelten deren eigene Bezahlregeln.
