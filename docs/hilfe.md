# Hilfe & FAQ

Jedes Modul erklärt sich an zwei Stellen, aus **einer** Quelle (`artifacts/pflanzenscanner/src/lib/help.ts`):

- **Oben auf der Modulseite:** ein Kasten „So funktioniert’s: …“ mit kurzer Erklärung, den Schritten und einem Link „Fragen und mehr in der Hilfe“ (`components/module-intro.tsx`). Das Layout setzt ihn selbst ein, wenn der Pfad genau der `href` eines Moduls ist – Unterseiten (z. B. ein einzelnes Volk) bekommen ihn nicht. Der Kasten ist offen, bis man ihn einmal zuklappt; das merkt sich das Gerät (`localStorage` `lf-intro-closed-<modul>`).
- **Im Hilfe-Bereich** `/hilfe` (Mehr → „Hilfe & FAQ“, auch über die Suche): allgemeine Fragen (Erste Schritte, Module, Benachrichtigungen, ohne Netz, Daten und Konto, Premium) und jedes sichtbare Modul nach Bereich mit Erklärung, Schritten, häufigen Fragen und Link zum Modul. Eine Suche filtert über alle Texte. `/hilfe#bees` öffnet direkt das Modul.

## Pflege

- **Neues Modul:** Eintrag in `MODULE_HELP` (Titel, `href` der Modulseite, Einführung, mindestens drei Schritte, mindestens eine Frage). `lib/help.test.ts` schlägt fehl, wenn ein Modul aus `lib/modules.ts` keinen Eintrag hat oder sein `href` keine Route ist.
- **Neue Funktion oder neues Feld**, das ändert, wie man ein Modul benutzt: Schritte und Fragen im selben Schritt anpassen.
- Ausgeblendete Module stehen nicht in der Hilfe.
