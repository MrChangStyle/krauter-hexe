# Datensicherung

Die Produktionsdatenbank (Neon) wird jeden Tag automatisch gesichert. Der
Workflow `.github/workflows/db-backup.yml` erstellt mit `pg_dump` eine
Sicherung, prüft sie, verschlüsselt sie mit AES-256 und legt sie 90 Tage als
Artefakt im GitHub-Repository ab.

## Einmalig einrichten

1. Ein langes Zufallspasswort erzeugen (mindestens 20 Zeichen, besser 40) und
   **an einem sicheren Ort aufbewahren**, z. B. im Passwort-Manager. Ohne dieses
   Passwort lässt sich keine Sicherung wiederherstellen.
2. Im GitHub-Repository unter **Settings → Secrets and variables → Actions**
   zwei Secrets anlegen:
   - `NEON_DATABASE_URL`: die Verbindungs-URL der Produktionsdatenbank aus dem
     Neon-Dashboard (Connect → Connection string)
   - `BACKUP_PASSPHRASE`: das Passwort aus Schritt 1
3. Unter **Actions → Datenbank-Sicherung → Run workflow** einmal von Hand
   starten und prüfen, dass der Lauf grün wird.

## Wiederherstellen

1. Unter **Actions → Datenbank-Sicherung** den gewünschten Lauf öffnen und das
   Artefakt herunterladen (ZIP mit der Datei `littlefarming-db-….dump.gpg`).
2. Entschlüsseln:

   ```bash
   gpg --decrypt --output backup.dump littlefarming-db-<datum>.dump.gpg
   ```

3. In eine **neue, leere** Datenbank einspielen (nie direkt über die laufende
   Produktion):

   ```bash
   pg_restore --no-owner --no-privileges --dbname="<ziel-url>" backup.dump
   ```

4. Stichproben prüfen (Anzahl Pflanzen, Nutzer, Tiere), dann die App auf die
   neue Datenbank umstellen.

## Hinweise

- Der Workflow prüft jede Sicherung mit `pg_restore --list`, bevor er sie
  verschlüsselt. Enthält sie auffällig wenige Tabellen, schlägt der Lauf fehl
  und GitHub schickt eine E-Mail.
- GitHub deaktiviert zeitgesteuerte Workflows in öffentlichen Repositories,
  wenn 60 Tage lang keine Aktivität im Repository stattfindet. Bei längeren
  Pausen den Workflow unter **Actions** wieder aktivieren.
- Einmal im Quartal eine Wiederherstellung in eine Testdatenbank üben.
- Die Aufbewahrungspflicht von 5 Jahren für das Bestandsbuch liegt beim
  Tierhalter. Die App bietet dafür den PDF-Export an; diese Sicherung ist der
  Schutz gegen Datenverlust auf unserer Seite.
