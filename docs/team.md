# Farm & Team

Unter Mehr → **„Farm & Team“** (`/team`) steht alles über die Menschen auf dem Hof. Die Tiere-Kachel „Farm & Team“ führt auf dieselbe Seite. Der alte Link `/farm/mitglieder` leitet dorthin weiter.

## Aufbau

- **Übersicht**: wie viele im Team sind, wie viele vertreten und wie viele Kontakte eingetragen sind. Darunter steht aufklappbar, was die Rollen dürfen.
- **Team**: Mitglieder ohne Enddatum.
- **Vertretung**: Mitglieder mit einem letzten Tag. Sie ist gleich aufgebaut wie das Team, nur anders benannt:
  - Das Datum ist Pflicht.
  - Admin ist als Rolle nicht wählbar.
  - Der Zugang endet nach dem Tag von selbst.
- **Übergabe**: Link auf die Seite, die die Vertretung sieht.
- **Wichtige Kontakte**: Ich / Betriebsleitung, Team & Mitarbeiter, Vertretung, Tierarzt, Familie & Hof, Notfall, Ämter & Behörden, Lieferanten & Dienste, Sonstige.
  - Zu jedem Kontakt gehören Name, Aufgabe, Telefon (zum Antippen), E-Mail und eine Notiz.
  - Alle Mitglieder sehen die Kontakte, auch auf der Übergabe-Seite. Nur Admins pflegen sie.

## Rollen

- **Admin**: alles, auch das Team verwalten.
- **Mitarbeiter** (in der API `caretaker`): Einträge anlegen und bearbeiten.
- **Gast**: nur ansehen.

## Technik

- Die Tabelle `farm_contacts` hängt an der Farm (`kind` aus `FARM_CONTACT_KINDS`) und wird mit ihr gelöscht.
- Server: `lib/farmContacts.ts`, Routen `GET/POST /farms/:farmId/contacts` und `PUT/DELETE /farms/:farmId/contacts/:contactId`.
  - Lesen dürfen alle Mitglieder, Schreiben nur Admins.
  - Höchstens 200 Kontakte je Farm.
  - Telefon und E-Mail werden geprüft.
- Client:
  - `pages/team.tsx`
  - `components/farm-members-card.tsx` mit `kind="team" | "substitute"`
  - `components/farm-contacts-card.tsx`
  - `lib/contact-labels.ts`
- Die Demo-Daten bringen zwei Kontakte mit.
- Test: `farmContacts.integration.test.ts`.

## Wo man einen freigegebenen Hof sieht

Ganz oben auf der Hofseite steht der Knopf **„Wähle deine Farm“** (`components/farm-switcher.tsx`). Ein Tipp klappt die Liste auf: zuerst die eigenen Farmen, darunter die **verknüpften Höfe**, die einem freigegeben wurden („Geteilt von Stefan · Mitarbeiter“), zuletzt der Demo-Hof. Ein Tipp auf einen Hof wechselt; dieselbe Auswahl gibt es auf der Seite Hof-Aufgaben und als Auswahlfeld unter Tiere und Farm & Team.

## Listen teilen

Der Dialog „Listen teilen“ (auf den Seiten Hof-Aufgaben und Alltagsnotizen) teilt die Hof-Aufgaben, die eigenen Alltagsnotizen oder beides – mit jemandem aus dem Team oder per E-Mail. Für die Hof-Aufgaben kommt eine neue Person als Mitarbeiter mit der Freigabe „Hof- & Stall-Aufgaben“ ins Team (nur Admins). Wer mitmacht, hakt ab und fügt hinzu, löscht aber nichts (`docs/alltagsnotizen.md`).

## Tierarzt-Zugang

Bei der Vertretung steht der Knopf **„Tierarzt einladen“**. Er füllt das Formular vor: die E-Mail aus dem Kontakt „Tierarzt“, Gast, Ende in 14 Tagen und nur die Freigaben Arzneimittel und Veterinäramt-Export. Die Tiere mit ihrer Krankenakte sieht jedes Mitglied. Die Freigaben werden mit der Einladung gespeichert (`modules` in `POST /farms/:farmId/members`). Einzelheiten: `docs/krankenakte.md`.

## Modul-Freigaben

Ein Admin legt für jedes Mitglied fest, welche Farm-Module es sieht: Im Team bzw. bei der Vertretung auf **„Freigaben: Alle Module“** tippen. Zum Beispiel sieht eine Stallhilfe dann nur Stall-Aufgaben und Futterplaner.

- **Rolle und Freigabe greifen ineinander:** Die Freigabe bestimmt, *welche* Module jemand sieht. Die Rolle bestimmt, ob er darin nur ansehen (Gast) oder auch bearbeiten (Mitarbeiter) darf.
- **Admins haben immer alles.**
- **Freigeben lassen sich:** Hof- & Stall-Aufgaben (die gemeinsame Liste, `docs/hof-aufgaben.md`), Futterplaner, Zucht, Arzneimittel, Pflichten & Tierseuchen, Ertrag & Bilanz, Wildtier-Radar, Übergabe, Veterinäramt-Export, Farm & Team und Beet-Architekt (mit Saatgut).
- **Immer offen** für jedes Mitglied:
  - die Tiere selbst (Bestand, Gesundheit), denn die Module bauen darauf auf
  - die wichtigen Kontakte (Notfallnummern)
  - die Farm verlassen
- **Der Server setzt das durch:** `requireFarm` ordnet jede Farm-Route über ihren ersten Pfadteil einem Modul zu (`lib/farmModuleAccess.ts`) und antwortet sonst mit 403.
- **Push-Erinnerungen** gehen nur an Mitglieder mit dem Modul (`grantedSql` in `lib/farmModules.ts`). Das betrifft Stall-Aufgaben, Futter, Zucht, Arzneimittel, Garten und Kamera-Alarm.
- **In der App:**
  - Die Kacheln auf der Tiere-Seite und die Hof-Widgets zeigen nur freigegebene Module (`farmModuleGranted` in `lib/modules.ts`).
  - Der Dialog ist `components/member-modules-dialog.tsx`.
- **Technik:**
  - Spalte `farm_memberships.modules` (jsonb; null = alle).
  - `PUT /farms/:farmId/members/:userId/modules` (nur Admins).
  - `FarmSummary.modules` und `FarmMember.modules`.
  - Tests: `farmModules.test.ts`, `farmModules.integration.test.ts`.

## Bewirtschaftung

Auf Farm & Team steht auch die Bewirtschaftung des Hofs: konventionell (Standard), naturnah, Bio oder Bio-Verband. Admins schalten um, alle anderen sehen sie. Einzelheiten in `docs/bio.md`.
