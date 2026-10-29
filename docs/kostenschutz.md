# Kostenschutz

Schritt 4 des Launch-Plans (`docs/LAUNCH-PLAN.md`). Jede KI-Anfrage kostet Geld über den Gemini-Schlüssel des Betreibers. Sobald die App öffentlich ist, darf keine Funktion unbegrenzt KI verbrauchen können, auch nicht über viele Konten oder über eine Kamera, die in einer Schleife hängt.

## Die Bremsen

| Bremse | Wert (Richtwert) | Wo |
|---|---|---|
| KI-Anfragen je Konto, Bereich und Tag (Berliner Tag) | 15 | `DAILY_SCAN_LIMIT` in `lib/scanRateLimit.ts` |
| Bereiche mit eigenem Zähler | Pflanze, Insekt, Farm, Garten, Grow | `scan_attempts.scan_type` |
| Erster Blick des Universal-Scans („Was ist auf dem Foto?“) | 45 je Konto und Tag (3 × 15) | `DAILY_CLASSIFY_LIMIT` |
| KI-Anfragen der ganzen App je Tag (ohne Betreiber, ohne ersten Blick) | `SCAN_DAILY_BUDGET`, in `render.yaml` 300 | `scanDailyBudget()` |
| Wildkamera: Abstand zwischen zwei Fotos | 10 Sekunden | `MIN_SECONDS_BETWEEN_IMAGES` |
| Wildkamera: KI-Prüfungen je Kamera und Tag | 300 | `MAX_IMAGES_PER_CAMERA_PER_DAY` |
| Wildkamera: KI-Prüfungen je Hof und Tag (alle Kameras) | 600 | `MAX_IMAGES_PER_FARM_PER_DAY` |
| Kameras je Hof | 10 | `MAX_CAMERAS_PER_FARM` |
| Höfe als Admin je Konto | 5 | `MAX_ADMIN_FARMS` |
| Neue Konten | 5 je Anschluss und Stunde, `REGISTRATION_DAILY_CAP` je Tag | `lib/registrationPolicy.ts` |
| Größe einer Anfrage (Fotos als Data-URL) | 15 MB | `app.ts` |

- **Der Betreiber hat kein Limit.** Seine Anfragen werden auch nicht gezählt.
- **Fehlversuche kosten nichts:** Scheitert die KI, bekommt das Konto die Anfrage zurück.
- **Kein Hinweis auf eine Pflanze?** Eine Antwort wie „keine Pflanze auf dem Foto“ zählt trotzdem, denn die KI hat gearbeitet.

## Bei der Prüfung geschlossen (29.10.2026)

- **Pflanzendoc:** Die Diagnose (`POST /plants/health-check`) lief ohne Limit. Jetzt zählt sie wie ein Pflanzen-Scan.
- **Pflege-Guide:** Das Erstellen (`POST /care-guides`) lief ohne Limit. Jetzt zählt es wie ein Pflanzen-Scan.
- **Universal-Scan:** Der erste Blick lief vor der Limit-Prüfung. Fotos ohne Pflanze oder Insekt kosteten also KI, ohne zu zählen. Jetzt hat er einen eigenen Zähler (45). Am Limit antwortet er wie der Pflanzen-Scan, damit die Offline-Warteschlange bis Mitternacht pausiert.
- **Wildkamera:** Die Tagesgrenze von 300 zählte die gespeicherten Ereignisse. Davon werden aber nur die neuesten 100 je Kamera aufbewahrt, die Grenze griff also nie. Eine Kamera konnte so bis zu 8.640 Prüfungen am Tag auslösen. Jetzt zählt die Kamera selbst (`cameras.ai_day`, `cameras.ai_count`, atomar). Dazu kommt eine Grenze je Hof.
- **In der App:** Am Limit zeigt Pflanzendoc den Satz des Servers („Du hast heute schon 15 KI-Anfragen gestellt …“) statt „fehlgeschlagen“.

Tests: `lib/costProtection.integration.test.ts`, `lib/farmCameras.integration.test.ts` (Tagesgrenzen) und `pages/pflanzendoc.test.ts`.

## Später

- **Premium-Limits:** Ein höheres Limit für Premium kommt mit der Bezahlung (Schritt 16). In der Testphase gilt jedes Konto als Premium. Ein höheres Premium-Limit würde jetzt also für alle gelten.

## Offen

- **Richtwerte prüfen:** Die Werte (15, 45, 300, 600, Budget 300) sollen nach den ersten Wochen mit echten Zahlen aus Verwaltung → Betrieb (KI-Anfragen je Tag) überprüft werden.
- **Budget in Render prüfen:** Ist `SCAN_DAILY_BUDGET` dort wirklich gesetzt? `render.yaml` gilt nur, wenn der Dienst als Blueprint angelegt wurde (`docs/TODO-CHANG.md`).
