import { useEffect, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Leaf } from "lucide-react";
import {
  LEGAL_PATHS,
  LEGAL_VERSION,
  OPERATOR,
  OPERATOR_FORM,
  OPERATOR_VAT,
  PAYMENT_TEXTS_DRAFT,
  legalHref,
  operatorDataIncomplete,
} from "@/lib/legal";
import { planById, priceText } from "@/lib/site";
import { sendSiteVisit } from "@/lib/site-visit";

/**
 * Impressum, Datenschutzerklärung und Nutzungsbedingungen.
 *
 * Reachable without signing in (they are linked from the registration form and
 * must be readable before an account exists), so they render outside the
 * AuthGate and the app layout and fetch nothing.
 */

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => sendSiteVisit(window.location.pathname), []);
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <a
          href={legalHref("/")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <Leaf className="h-4 w-4 text-primary" />
          Zurück zur Startseite
        </a>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">{title}</h1>
        {operatorDataIncomplete() && (
          <div
            role="note"
            className="mb-6 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Die Angaben zum Betreiber sind noch nicht vollständig. Diese Seite
              ist ein Entwurf und wird vor dem öffentlichen Start ergänzt.
            </span>
          </div>
        )}
        <div className="space-y-5 text-sm leading-relaxed [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
        <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          <a href={legalHref(LEGAL_PATHS.impressum)} className="underline underline-offset-4">
            Impressum
          </a>
          <a href={legalHref(LEGAL_PATHS.datenschutz)} className="underline underline-offset-4">
            Datenschutz
          </a>
          <a
            href={legalHref(LEGAL_PATHS.nutzungsbedingungen)}
            className="underline underline-offset-4"
          >
            Nutzungsbedingungen
          </a>
          <span>Stand: {LEGAL_VERSION}</span>
        </nav>
      </div>
    </div>
  );
}

function OperatorBlock() {
  return (
    <p>
      {OPERATOR.business}
      <br />
      Inhaber: {OPERATOR.name}
      <br />
      {OPERATOR.street}
      <br />
      {OPERATOR.city}
      <br />
      E-Mail: {OPERATOR.email}
    </p>
  );
}

export function ImpressumPage() {
  return (
    <LegalShell title="Impressum">
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <OperatorBlock />
        <p className="mt-2">{OPERATOR_FORM}.</p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail: {OPERATOR.email}
          <br />
          Außerdem erreichst du uns über die Feedback-Funktion auf der Homepage
          und in der App.
        </p>
      </section>
      <section>
        <h2>Umsatzsteuer</h2>
        <p>{OPERATOR_VAT}</p>
      </section>
      <section>
        <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
        <p>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.city}
        </p>
      </section>
      <section>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>
          Wir sind nicht bereit und nicht verpflichtet, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen (§ 36 VSBG).
        </p>
      </section>
      <section>
        <h2>Inhalte von Nutzerinnen und Nutzern</h2>
        <p>
          Fotos im gemeinsamen Archiv und Benutzernamen in der Rangliste stammen
          von Nutzerinnen und Nutzern. Rechtsverletzende Inhalte entfernen wir,
          sobald wir davon erfahren – bitte melde sie an die oben genannte
          E-Mail-Adresse.
        </p>
      </section>
    </LegalShell>
  );
}

export function DatenschutzPage() {
  return (
    <LegalShell title="Datenschutzerklärung">
      <section>
        <h2>1. Verantwortlicher</h2>
        <OperatorBlock />
      </section>

      <section>
        <h2>2. Welche Daten wir verarbeiten und wozu</h2>
        <ul>
          <li>
            <strong>Konto:</strong> E-Mail-Adresse, Passwort (nur als
            verschlüsselter Hash gespeichert), optional Vor- und Nachname und
            Profilbild (bei Anmeldung mit Google), selbst gewählter
            Benutzername, deine Nutzer-ID (eine Nummer, mit der dich andere
            zu ihrem Hof oder einer Liste hinzufügen können), Zeitpunkt der Zustimmung zu diesen Bedingungen und
            deine Einstellungen (z. B. Meine Module, Meine Tierarten,
            Benachrichtigungen, Bio-Empfehlungen). Zweck: Bereitstellung deines
            Kontos (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Rangliste:</strong> Wählst du einen Benutzernamen, steht er
            mit deiner Zahl geretteter Pflanzen in der Pflanzenretter-Rangliste,
            die alle angemeldeten Nutzerinnen und Nutzer sehen. Ohne
            Benutzernamen erscheinst du dort nicht (Art. 6 Abs. 1 lit. b
            DSGVO).
          </li>
          <li>
            <strong>Fotos und Scan-Ergebnisse:</strong> Fotos, die du zum
            Bestimmen von Pflanzen, Pilzen oder Insekten aufnimmst, und die
            Ergebnisse. Neue Arten und bessere Fotos werden in das gemeinsame
            Archiv übernommen, das alle Nutzerinnen und Nutzer sehen (Art. 6
            Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Hof und Tiere:</strong> Was du für deinen Hof einträgst –
            Tiere mit Gesundheitsakte und Behandlungen, Aufgaben, Futter,
            Ertrag, Weiden (mit ihrem Umriss auf der Karte), Bienen, Beete,
            Saatgut, Vorräte, Hof-Aufgaben mit Kommentaren, Bewirtschaftung
            (z. B. Bio) und Kontakte. Diese Daten gehören zum
            Hof: Wer zum Hof gehört (Team, Vertretung, eingeladener Tierarzt),
            sieht sie je nach Rolle und Freigabe; eine Vertretung oder ein
            Tierarzt nur bis zum eingetragenen Tag (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Wildkameras:</strong> Fotos, die eine eingerichtete Kamera
            an die App schickt, speichern wir beim Hof, lassen sie auf
            Wildtiere auswerten und leiten sie auf Wunsch an eine von dir
            angegebene Adresse weiter. Richte die Kamera so aus, dass sie keine
            Menschen, Wege oder fremden Grundstücke erfasst (Art. 6 Abs. 1 lit.
            b DSGVO).
          </li>
          <li>
            <strong>Standort:</strong> Die App fragt deinen Standort nur, wenn
            du auf „Standort verwenden“ tippst (Art. 6 Abs. 1 lit. a DSGVO).
            Für deine Region speichern wir dann nur den Namen der
            nächstgelegenen Stadt. Für Wetter, Frost und Unwetterwarnungen von
            Hof, Beet und Grow speichern wir die Postleitzahl oder den auf etwa
            10 km gerundeten Ort, nie den genauen Standort. Beim Einzeichnen
            einer Weide zeigt die Karte deinen Standort nur auf deinem Gerät.
          </li>
          <li>
            <strong>Fundorte (gemeinsame Karte im Archiv):</strong> Nur wenn du
            „Fundorte anonym teilen“ einschaltest (Art. 6 Abs. 1 lit. a DSGVO),
            speichern wir zu einer Art, die du gescannt hast, das Feld von etwa
            2 × 2 km, in dem du warst, und den Monat. Den genauen Standort
            rundet die App schon auf deinem Gerät; er wird nicht übertragen.
            Andere sehen nur, wie viele Funde es je Feld gibt – ohne Namen,
            ohne Uhrzeit. Bei geschützten Arten zeigt die Karte nur Felder von
            etwa 25 × 25 km. Du kannst die Einwilligung jederzeit unter „Mehr →
            Konto“ widerrufen; dann löschen wir deine Fundorte sofort. Aus
            Fotos, die die App nicht verkleinern kann, entfernt sie vor dem
            Senden die eingebetteten Standortdaten (EXIF).
          </li>
          <li>
            <strong>Grow (Eigenanbau ab 18):</strong> Wenn du den Bereich
            nutzt, speichern wir den Zeitpunkt deiner Bestätigung, dass du
            volljährig bist, und deine Anbau-Daten (Pflanzen, Tagebuch,
            Ergebnisse der KI-Checks). Ein Foto für den KI-Check wird nur
            ausgewertet, nicht gespeichert. Die Daten gehören nur zu deinem
            Konto (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Spracheingabe:</strong> Wenn du den Mikrofon-Knopf hältst,
            wandelt die Spracherkennung deines Browsers bzw. Betriebssystems die
            Sprache in Text um. Je nach Gerät geschieht das beim Anbieter des
            Browsers (z. B. Google bei Chrome, Apple bei Safari). Wir bekommen
            nur den fertigen Text, nie die Aufnahme (Art. 6 Abs. 1 lit. a
            DSGVO).
          </li>
          <li>
            <strong>Futter-Rezepte:</strong> Ein Rezept, das du einsendest,
            sehen nach unserer Freigabe alle Nutzerinnen und Nutzer – ohne
            deinen Namen (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Erinnerungen:</strong> Wenn du Push-Benachrichtigungen
            erlaubst, speichern wir die Push-Adresse deines Browsers. Die
            Nachricht geht verschlüsselt über den Push-Dienst deines Browsers
            (z. B. Google, Mozilla, Apple) an dein Gerät (Art. 6 Abs. 1 lit. a
            DSGVO).
          </li>
          <li>
            <strong>Meldungen:</strong> Wenn du ein Foto oder einen
            Benutzernamen meldest, speichern wir die Meldung mit deinem Konto,
            dem Grund und deiner Anmerkung, damit wir ihr nachgehen können
            (Art. 6 Abs. 1 lit. f DSGVO). Die gemeldete Person erfährt nicht,
            wer gemeldet hat.
          </li>
          <li>
            <strong>Feedback:</strong> Wenn du uns über die Sprechblase eine
            Idee oder ein Problem schickst, speichern wir deine Nachricht, die
            Seite, von der sie kommt, einen Screenshot, wenn du einen anhängst
            (nur in der App; er liegt in unserer Datenbank und nur wir sehen
            ihn), und – nur wenn du sie angibst – deine E-Mail-Adresse für eine
            Antwort. Angemeldet gehört das Feedback zu
            deinem Konto. Ohne Konto löschen wir es spätestens nach einem Jahr
            (Art. 6 Abs. 1 lit. f DSGVO, Verbesserung der App).
          </li>
          <li>
            <strong>Alltagsnotizen:</strong> Deine Einkaufsliste und dein
            Merkzettel gehören zu deinem Konto. Teilst du sie mit jemandem, sieht
            diese Person die Liste samt deinem Namen und kann abhaken und
            ergänzen; das Teilen beendest du jederzeit (Art. 6 Abs. 1 lit. b
            DSGVO).
          </li>
          <li>
            <strong>Technische Daten:</strong> IP-Adresse und Zeitpunkt von
            Anfragen, kurzzeitig zum Schutz vor Missbrauch (z. B. zu viele
            Anmeldeversuche) (Art. 6 Abs. 1 lit. f DSGVO).
          </li>
          <li>
            <strong>Fehler und Nutzung:</strong> Stürzt die App ab oder tritt
            ein Fehler auf, speichern wir die Fehlermeldung, die betroffene
            Seite (ohne Nummern) und die Version – ohne Bezug zu deiner Person.
            Für die Nutzungsstatistik zählen wir nur Tageswerte (z. B. wie viele
            Konten an einem Tag aktiv waren); dafür merken wir uns bei deinem
            Konto allein das Datum deines letzten Besuchs (Art. 6 Abs. 1 lit. f
            DSGVO, stabiler Betrieb).
          </li>
          <li>
            <strong>Besucherzählung der Homepage:</strong> Öffnest du eine
            Seite der Homepage, zählen wir den Aufruf: Tag, Seite und Herkunft
            (der Name einer Kampagne aus dem Link oder die Domain der Seite,
            von der du kommst). Wir setzen dafür kein Cookie, speichern keine
            IP-Adresse und nichts, was dich wiedererkennt. Sendet dein Browser
            „nicht verfolgen“ (Global Privacy Control oder Do Not Track),
            zählen wir gar nicht (Art. 6 Abs. 1 lit. f DSGVO, Verbesserung
            der Homepage).
          </li>
          <li>
            <strong>Auf deinem Gerät:</strong> Die App speichert Fotos, die noch
            nicht gescannt wurden, und deine Anmeldung lokal im Browser, damit
            sie auch ohne Netz funktioniert.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Dienstleister</h2>
        <ul>
          <li>Render (Hosting der App, Rechenzentrum Frankfurt)</li>
          <li>Neon (Datenbank, Rechenzentrum Frankfurt)</li>
          <li>Cloudinary (Speicherung und Auslieferung der Fotos)</li>
          <li>
            Google Gemini (alle KI-Funktionen: Bestimmen von Pflanzen, Pilzen
            und Insekten, Pflanzendoc und Pflege-Guide, Grow-Diagnose,
            Futteretiketten, Futter- und Arten-Vorschläge, Beet-Architekt und
            Garten-Assistent, Standort-Check der Bienen, Wildkameras,
            KI-Aufgabenplan und Alltagsnotizen. Übermittelt wird nur, was die
            jeweilige Funktion braucht: deine Fotos bzw. die Kamerabilder, beim
            Aufgabenplan der Text sowie die Namen des Teams und der Tiergruppen,
            sonst der Text oder die Angaben zu Tier, Beet oder Ort, ohne deinen
            Namen oder deine E-Mail-Adresse)
          </li>
          <li>Google (nur bei „Mit Google anmelden“)</li>
          <li>
            Resend (Versand von E-Mails, z. B. des Links bei „Passwort vergessen“; übermittelt werden deine
            E-Mail-Adresse und der Inhalt der Mail, Rechenzentrum in der EU)
          </li>
          <li>Cloudflare Turnstile (Schutz der Registrierung vor Bots)</li>
          <li>
            Push-Dienste der Browser-Anbieter (z. B. Google Firebase Cloud
            Messaging, Mozilla, Apple), nur wenn du Benachrichtigungen erlaubst
          </li>
          <li>
            OpenStreetMap Nominatim (Beet-Architekt: Postleitzahl eines Beetes
            → ungefährer Ort; übermittelt wird nur die Postleitzahl)
          </li>
          <li>
            Bright Sky mit Daten des Deutschen Wetterdienstes (Beet-Architekt: Frosttermine und
            Frostwarnung; Wetter und amtliche Unwetterwarnungen für den Hof; übermittelt wird nur ein auf
            etwa 10 km gerundeter Ort)
          </li>
          <li>
            OpenStreetMap Foundation (Weidekarte und Fundorte-Karte: Kartenbilder, erst nach Tipp auf „Karte
            zeigen“; deren Server sieht dabei deine IP-Adresse und den Kartenausschnitt, nicht die
            eingezeichneten Weiden oder Fundorte)
          </li>
        </ul>
        <p className="mt-2">
          Einige dieser Anbieter haben ihren Sitz in den USA. Die Übermittlung
          stützt sich auf das EU-US Data Privacy Framework bzw.
          EU-Standardvertragsklauseln.
        </p>
      </section>

      <section>
        <h2>4. Speicherdauer</h2>
        <p>
          Kontodaten speichern wir, bis du dein Konto löschst (in der App
          unter „Mehr“ → „Konto“). Beim Löschen
          entfernen wir deine persönlichen Daten; Arten, die du dem
          gemeinsamen Archiv hinzugefügt hast, bleiben ohne Bezug zu deiner
          Person erhalten. Deine Fundorte löschen wir mit dem Konto oder
          sobald du „Fundorte anonym teilen“ ausschaltest. Daten zum Missbrauchsschutz werden nach spätestens
          sieben Tagen gelöscht, behobene Fehlermeldungen nach 90 Tagen,
          Tageszahlen nach gut einem Jahr.
        </p>
      </section>

      <section>
        <h2>5. Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung
          der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das
          Recht, eine Einwilligung jederzeit zu widerrufen. Eine Kopie deiner
          Daten lädst du jederzeit selbst unter „Mehr → Konto → Meine Daten
          herunterladen“ herunter. Für alles andere schreib uns an die oben
          genannte E-Mail-Adresse. Außerdem kannst du dich bei einer
          Datenschutz-Aufsichtsbehörde beschweren. Für uns zuständig ist das
          Bayerische Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18,
          91522 Ansbach, www.lda.bayern.de.
        </p>
        <p className="mt-2">
          Einen Datenschutzbeauftragten müssen wir nicht benennen, weil nicht
          regelmäßig mindestens 20 Personen mit der Verarbeitung
          personenbezogener Daten beschäftigt sind (§ 38 BDSG).
        </p>
      </section>
    </LegalShell>
  );
}

export function NutzungsbedingungenPage() {
  return (
    <LegalShell title="Nutzungsbedingungen">
      <section>
        <h2>1. Angebot</h2>
        <p>
          Little Farming wird angeboten von {OPERATOR.business}, Inhaber{" "}
          {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city} (siehe
          Impressum). Little Farming ist eine App rund um Garten, Hof und
          Tiere. Ihr Scanner
          hilft beim Bestimmen von Pflanzen, Pilzen und Insekten
          per Foto und sammelt die Ergebnisse in einem gemeinsamen Archiv. Die
          Nutzung ist kostenlos. Es besteht kein Anspruch auf
          ständige Verfügbarkeit; die Anzahl der Scans pro Tag ist begrenzt.
        </p>
      </section>
      <section>
        <h2>2. Keine Gewähr für KI-Ergebnisse</h2>
        <p>
          Die Bestimmung erfolgt durch eine KI und kann falsch sein. Iss und
          verwende keine Pflanze und keinen Pilz allein aufgrund der App und
          verfüttere nichts an Tiere, ohne es sicher bestimmt zu haben. Die App
          ersetzt keine fachkundige Beratung, keinen Arzt und keinen Tierarzt.
        </p>
      </section>
      <section>
        <h2>3. Hinweise zu Gesundheit, Tieren und Pflichten</h2>
        <ul>
          <li>
            <strong>Pilze:</strong> Kein Pilz wird allein aufgrund der App
            gegessen. Lass jeden Speisepilz von einer Pilzsachverständigen oder
            einem Pilzsachverständigen prüfen. Bei Verdacht auf eine Vergiftung
            sofort den Giftnotruf oder den Notruf 112 anrufen.
          </li>
          <li>
            <strong>Giftpflanzen und Futter:</strong> Angaben zur Giftigkeit
            und zur Verträglichkeit für Tiere sind Richtwerte aus Fachliteratur
            und KI und können unvollständig sein. Sie ersetzen nicht die
            sichere Bestimmung vor dem Verfüttern. Futterpläne und
            Nährstoffwerte sind Richtwerte; bei kranken, trächtigen oder jungen
            Tieren frag deinen Tierarzt.
          </li>
          <li>
            <strong>Heilkräuter:</strong> Der Heilkräuter-Ratgeber gibt
            überliefertes Wissen wieder. Er ersetzt keine ärztliche oder
            tierärztliche Behandlung.
          </li>
          <li>
            <strong>Tierarzneimittel und Wartezeiten:</strong> Die App rechnet
            Wartezeiten aus deinen Eingaben. Maßgeblich sind der Beipackzettel
            und die Anweisung deines Tierarztes. Für die Abgabe von Milch, Eiern
            und Fleisch bleibst du als Halterin oder Halter verantwortlich.
          </li>
          <li>
            <strong>Bio:</strong> Bio-Check, Bio-Anteile im Futter, Platz-Check,
            doppelte Wartezeit, Bio-Zeichen und Bio-Dokumentation sind eine
            Hilfe mit Richtwerten nach der EU-Öko-Verordnung. Wir übernehmen
            keine Gewähr, dass damit die Anforderungen der Verordnung, eines
            Verbands oder deiner Kontrollstelle erfüllt sind. Ein „Bio“ in der
            App ist kein Zertifikat; verbindlich ist allein die Prüfung durch
            die Kontrollstelle.
          </li>
          <li>
            <strong>Pflichten und Fristen:</strong> Die Hinweise zu Anmeldung,
            Tierseuchenkasse und Fristen sind eine Arbeitshilfe und keine
            Rechtsberatung. Maßgeblich sind das Veterinäramt, die
            Tierseuchenkasse und deren Bescheide.
          </li>
        </ul>
      </section>
      <section>
        <h2>4. Deine Inhalte</h2>
        <p>
          Lade nur Fotos hoch, die du selbst aufgenommen hast und die keine
          Personen zeigen. Mit dem Hochladen erlaubst du uns, das Foto im
          gemeinsamen Archiv der App zu zeigen. Benutzernamen dürfen nicht
          beleidigend sein und niemanden nachahmen.
        </p>
      </section>
      <section>
        <h2>5. Sperrung</h2>
        <p>
          Wir können Inhalte entfernen und Konten sperren, die gegen diese
          Bedingungen verstoßen oder die App missbrauchen (z. B. durch
          automatisierte Registrierungen).
        </p>
      </section>
      <section>
        <h2>6. Konto beenden</h2>
        <p>
          Du kannst dein Konto jederzeit selbst löschen: in der App unter
          „Mehr“ → „Konto“ → „Konto löschen“. Alternativ schreib uns an
          die im Impressum genannte E-Mail-Adresse.
        </p>
      </section>
    </LegalShell>
  );
}

function DraftNote() {
  if (!PAYMENT_TEXTS_DRAFT) return null;
  return (
    <div role="note" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>Entwurf: Dieser Text wird vor dem Start der Bezahlung rechtlich geprüft und kann sich noch ändern.</span>
    </div>
  );
}

function OperatorLine() {
  return (
    <>
      {OPERATOR.business}, Inhaber {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}, E-Mail: {OPERATOR.email}
    </>
  );
}

/** AGB for Lite and Premium (draft: docs/recht/agb-entwurf.md). */
export function AgbPage() {
  const lite = planById("lite");
  const premium = planById("premium");
  return (
    <LegalShell title="AGB für Lite und Premium">
      <DraftNote />
      <section>
        <h2>1. Geltungsbereich und Anbieter</h2>
        <p>
          Diese Bedingungen gelten für die kostenpflichtigen Pakete „Lite“ und „Premium“ von Little Farming. Anbieter: <OperatorLine />. Ergänzend gelten die{" "}
          <a href={legalHref(LEGAL_PATHS.nutzungsbedingungen)} className="underline underline-offset-4">
            Nutzungsbedingungen
          </a>
          .
        </p>
      </section>
      <section>
        <h2>2. Leistungen</h2>
        <ul>
          <li>Basis ist kostenlos und ohne KI bis auf {planById("basis").aiPerDay} KI-Anfragen am Tag zum Kennenlernen.</li>
          <li>
            Lite und Premium schalten mehr KI-Anfragen am Tag frei (Lite {lite.aiPerDay}, Premium {premium.aiPerDay} je Bereich) und die Funktionen, die auf der Seite „Preise & Pakete“ zum Zeitpunkt der
            Bestellung genannt sind.
          </li>
          <li>Die App wird weiterentwickelt; der Kern des gebuchten Pakets bleibt erhalten. Ein Anspruch auf ständige Verfügbarkeit besteht nicht.</li>
          <li>KI-Ergebnisse können falsch sein. Es gelten die Hinweise der Nutzungsbedingungen zu Pilzen, Giftpflanzen, Tierarzneimitteln und Pflichten.</li>
        </ul>
      </section>
      <section>
        <h2>3. Vertragsschluss</h2>
        <p>
          Der Vertrag kommt zustande, wenn du in der App unter „Paket & Abo“ ein Paket wählst, auf „Zahlungspflichtig bestellen“ tippst und die Zahlung beim Zahlungsanbieter Stripe bestätigst. Du
          bekommst eine Bestätigung per E-Mail. Vertragssprache ist Deutsch. Diese AGB kannst du jederzeit hier abrufen und speichern.
        </p>
      </section>
      <section>
        <h2>4. Preise und Zahlung</h2>
        <p>
          Lite kostet {priceText(lite.monthly)} im Monat oder {priceText(lite.yearly)} im Jahr, Premium {priceText(premium.monthly)} im Monat oder {priceText(premium.yearly)} im Jahr. Als
          Kleinunternehmer nach § 19 UStG weisen wir keine Umsatzsteuer aus. Bezahlt wird im Voraus für den gewählten Zeitraum über Stripe; die Rechnung kommt per E-Mail.
        </p>
      </section>
      <section>
        <h2>5. Laufzeit und Kündigung</h2>
        <ul>
          <li>Das Abo verlängert sich nach Ablauf um den gewählten Zeitraum, wenn es nicht vorher gekündigt wird.</li>
          <li>Kündigen kannst du jederzeit zum Ende des bezahlten Zeitraums: in der App unter „Mehr → Paket & Abo → Abo kündigen“ oder per E-Mail an {OPERATOR.email}.</li>
          <li>Danach läuft dein Konto als Basis weiter; deine Daten bleiben.</li>
          <li>Löschst du dein Konto, endet ein laufendes Abo sofort.</li>
        </ul>
      </section>
      <section>
        <h2>6. Widerrufsrecht</h2>
        <p>
          Verbraucherinnen und Verbraucher haben ein Widerrufsrecht, siehe die{" "}
          <a href={legalHref(LEGAL_PATHS.widerruf)} className="underline underline-offset-4">
            Widerrufsbelehrung
          </a>
          .
        </p>
      </section>
      <section>
        <h2>7. Testphase</h2>
        <p>Wer sich in der Testphase registriert hat, behält die App nach dem Start kostenlos, in dem Umfang, der auf der Homepage beschrieben ist.</p>
      </section>
      <section>
        <h2>8. Haftung</h2>
        <p>
          Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit und nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haften wir nur
          bei Verletzung einer wesentlichen Vertragspflicht, begrenzt auf den vorhersehbaren, vertragstypischen Schaden.
        </p>
      </section>
      <section>
        <h2>9. Schlussbestimmungen</h2>
        <p>
          Es gilt deutsches Recht; bei Verbraucherinnen und Verbrauchern nur, soweit nicht zwingende Schutzvorschriften ihres Aufenthaltsstaates entgegenstehen. Wir nehmen nicht an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.
        </p>
      </section>
    </LegalShell>
  );
}

/** Widerrufsbelehrung (draft: docs/recht/widerruf-entwurf.md). */
export function WiderrufPage() {
  return (
    <LegalShell title="Widerrufsbelehrung">
      <DraftNote />
      <section>
        <h2>Widerrufsrecht</h2>
        <p>
          Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses. Um dein
          Widerrufsrecht auszuüben, musst du uns (<OperatorLine />) mit einer eindeutigen Erklärung (z. B. eine E-Mail) über deinen Entschluss informieren, diesen Vertrag zu widerrufen. Du kannst
          dafür das Muster-Widerrufsformular unten verwenden, das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung vor Ablauf der Frist absendest.
        </p>
      </section>
      <section>
        <h2>Folgen des Widerrufs</h2>
        <p>
          Wenn du diesen Vertrag widerrufst, zahlen wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurück, an dem die Mitteilung
          über deinen Widerruf bei uns eingegangen ist. Dafür verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen Zahlung eingesetzt hast, es sei denn, mit dir wurde ausdrücklich
          etwas anderes vereinbart; in keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet.
        </p>
        <p className="mt-2">
          Hast du verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so hast du uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu deinem Widerruf bereits
          erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.
        </p>
      </section>
      <section>
        <h2>Muster-Widerrufsformular</h2>
        <p>(Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es zurück.)</p>
        <ul>
          <li>
            An <OperatorLine />
          </li>
          <li>Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung (*): Little Farming Lite/Premium (*), Monats-/Jahresabo (*)</li>
          <li>Bestellt am (*)</li>
          <li>Name des/der Verbraucher(s)</li>
          <li>Anschrift des/der Verbraucher(s)</li>
          <li>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)</li>
          <li>Datum</li>
        </ul>
        <p>(*) Unzutreffendes streichen.</p>
      </section>
    </LegalShell>
  );
}
