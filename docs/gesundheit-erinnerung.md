# Erinnerung aus der Gesundheitsakte

Wer in der Gesundheitsakte eines Tieres eine **Entwurmung** oder **Impfung** einträgt, kann sich gleich ans Wiederholen erinnern lassen. Daraus wird die Stall-Aufgabe „Entwurmen“ bzw. „Impfen“ für dieses Tier. Sie ist einen Abstand nach dem Behandlungstag fällig und erscheint wie jede Stall-Aufgabe:

- per Push um 8 Uhr,
- unter Stall-Aufgaben, „Am Stall“ und in der Übergabe.

## Im Formular (nur bei neuen Einträgen)

- **„Erinnern zum Wiederholen“** wählt die Art von selbst, sobald Diagnose, Behandlung oder Medikament danach klingen:
  - „Wurm“, „Würmer“, „Kokzidien“ oder „Parasit“ → Entwurmung,
  - „Impf“ oder „Vakzin“ → Impfung.
  - Man kann die Art ändern oder „Keine Erinnerung“ wählen (`lib/medical-repeat.ts`).
- **Vorschlag für den Abstand:** Entwurmung alle 3 Monate, Impfung alle 12 Monate, frei änderbar von 1 bis 365 Tagen, Wochen oder Monaten. Der Hinweis im Formular sagt, dass der Tierarzt den Abstand festlegt, bei Würmern am besten nach Kotprobe. Darunter steht der Tag der Erinnerung; ein Monat zählt 30 Tage, wie bei allen Stall-Aufgaben.
- Beim Bearbeiten eines Eintrags wird nichts geplant.

## Regeln auf dem Server

- `POST …/animals/:animalId/medical` nimmt optional `repeat: { kind: "deworm" | "vaccinate", every, unit }` an. Ein ungültiger Abstand lehnt den ganzen Eintrag ab.
- Gibt es für das Tier schon eine aktive Aufgabe dieser Art, wird sie weiterverwendet und keine zweite angelegt. Nur die **neueste** Behandlung setzt Abstand, Erledigt-Tag und Notiz. Eine ältere, die nachgetragen wird, ändert nichts.
- Ohne passende Aufgabe wird eine neue angelegt: für das Tier, 8:00 Uhr, als erledigt am Behandlungstag. Die Notiz ist das Medikament (falls angegeben).
- Code: `scheduleRepeat()` in `lib/medicalRepeat.ts`, aufgerufen aus `createMedicalRecord()`.
- Tests: `farmHealth.integration.test.ts` (neu, wiederverwendet, ältere Behandlung, Impfung getrennt, Bearbeiten plant nichts) und `medical-repeat.test.ts`.
