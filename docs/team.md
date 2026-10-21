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

## Nächster Schritt

**Modul-Freigaben pro Mitglied**: Der Admin hakt an, welche Module ein Mitglied sieht, zum Beispiel nur Stall-Aufgaben und Futter. Der Server setzt das durch. Die Rolle bestimmt weiterhin, ob jemand ansehen oder bearbeiten darf.
