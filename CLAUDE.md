# Little Farming – Hinweise für die Arbeit am Code

Die App heißt „Little Farming“: Pflanzen (Kräuterhexe) und Tiere (Meine Farm). Architektur und Entscheidungen stehen in `replit.md`, je Modul eine Datei in `docs/`. Texte in der App und in der Doku sind Deutsch, Code-Kommentare Englisch.

## Definition of Done – bei jedem neuen Modul und jedem neuen Feld

Nicht nur der Code, sondern immer auch:

1. **Hilfe & FAQ** (`artifacts/pflanzenscanner/src/lib/help.ts`): Einführung, Schritte „So funktioniert’s“ und häufige Fragen des Moduls ergänzen oder anpassen. Daraus kommen der Kasten oben auf der Modulseite und der Hilfe-Bereich `/hilfe` (`docs/hilfe.md`). Ein neues Modul braucht einen Eintrag – `lib/help.test.ts` prüft das.
2. **Demo-Daten** (`artifacts/api-server/src/lib/demoData.ts`): Beispiele für das neue Modul bzw. Feld, angelegt über die Funktionen des Moduls selbst; neue Tabellen in `MODULE_TABLES` von `demoData.integration.test.ts`; Liste in `docs/demo.md` aktualisieren.
3. **Doku**: `docs/<modul>.md` und eine Zeile in `replit.md`.
4. **Suche** (`lib/search-pages.ts`) und, bei einem neuen Modul, Modul-Liste, Freigaben und Push-Themen wie in `replit.md` beschrieben.
5. **Schema**: Drizzle-Schema, idempotente DDL in den `*SchemaStatements.ts` bzw. `schemaUpgrade.ts` (auch für bestehende Datenbanken), OpenAPI in `lib/api-spec/openapi.yaml` und Codegen.
6. **Tests**: Unit-Tests für Regeln, Integrationstests gegen echtes Postgres, Typecheck beider Pakete, Browser-Test in Handybreite.

## Arbeitsweise

- Ein Pull Request je Schritt gegen `main`.
- Fachliche Richtwerte (Tage, Mengen, Grenzen) als Richtwerte kennzeichnen und in der Doku unter „Offen“ zur fachlichen Prüfung vermerken.
