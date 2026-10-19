import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Leaf } from "lucide-react";
import {
  LEGAL_PATHS,
  LEGAL_VERSION,
  OPERATOR,
  legalHref,
  operatorDataIncomplete,
} from "@/lib/legal";

/**
 * Impressum, Datenschutzerklärung und Nutzungsbedingungen.
 *
 * Reachable without signing in (they are linked from the registration form and
 * must be readable before an account exists), so they render outside the
 * AuthGate and the app layout and fetch nothing.
 */

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <a
          href={legalHref("/")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <Leaf className="h-4 w-4 text-primary" />
          Zurück zur App
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
      {OPERATOR.name}
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
      </section>
      <section>
        <h2>Verantwortlich für den Inhalt</h2>
        <p>{OPERATOR.name}, Anschrift wie oben.</p>
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
            Benutzername, Zeitpunkt der Zustimmung zu diesen Bedingungen.
            Zweck: Bereitstellung deines Kontos (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Fotos und Scan-Ergebnisse:</strong> Fotos, die du zum
            Bestimmen von Pflanzen, Pilzen oder Insekten aufnimmst, und die
            Ergebnisse. Neue Arten und bessere Fotos werden in das gemeinsame
            Archiv übernommen, das alle Nutzerinnen und Nutzer sehen (Art. 6
            Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Region:</strong> Wenn du es erlaubst, ermittelt die App aus
            deinem Standort die nächstgelegene Stadt. Gespeichert wird nur der
            Stadtname, nie die Koordinaten (Art. 6 Abs. 1 lit. a DSGVO).
          </li>
          <li>
            <strong>Erinnerungen:</strong> Wenn du Push-Benachrichtigungen
            erlaubst, speichern wir die Push-Adresse deines Browsers (Art. 6
            Abs. 1 lit. a DSGVO).
          </li>
          <li>
            <strong>Meldungen:</strong> Wenn du ein Foto oder einen
            Benutzernamen meldest, speichern wir die Meldung mit deinem Konto,
            dem Grund und deiner Anmerkung, damit wir ihr nachgehen können
            (Art. 6 Abs. 1 lit. f DSGVO). Die gemeldete Person erfährt nicht,
            wer gemeldet hat.
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
            Google Gemini (KI-Bestimmung und KI-Vorschläge, z. B. im Beet-Architekt: deine Fotos werden zur Auswertung an
            Google übermittelt)
          </li>
          <li>Google (nur bei „Mit Google anmelden“)</li>
          <li>Cloudflare Turnstile (Schutz der Registrierung vor Bots)</li>
          <li>
            OpenStreetMap Nominatim (Beet-Architekt: Postleitzahl eines Beetes
            → ungefährer Ort; übermittelt wird nur die Postleitzahl)
          </li>
          <li>
            Bright Sky mit Daten des Deutschen Wetterdienstes (Beet-Architekt:
            Frosttermine und Frostwarnung; übermittelt wird nur ein auf etwa 10 km gerundeter Ort)
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
          unter „Home“ → „Dein Konto“). Beim Löschen
          entfernen wir deine persönlichen Daten; Arten, die du dem
          gemeinsamen Archiv hinzugefügt hast, bleiben ohne Bezug zu deiner
          Person erhalten. Daten zum Missbrauchsschutz werden nach spätestens
          sieben Tagen gelöscht, behobene Fehlermeldungen nach 90 Tagen,
          Tageszahlen nach gut einem Jahr.
        </p>
      </section>

      <section>
        <h2>5. Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung
          der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das
          Recht, eine Einwilligung jederzeit zu widerrufen. Schreib uns dazu an
          die oben genannte E-Mail-Adresse. Außerdem kannst du dich bei einer
          Datenschutz-Aufsichtsbehörde beschweren.
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
          Little Farming ist eine App rund um Garten, Hof und Tiere. Ihr Teil
          „Kräuterhexe“ hilft beim Bestimmen von Pflanzen, Pilzen und Insekten
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
        <h2>3. Deine Inhalte</h2>
        <p>
          Lade nur Fotos hoch, die du selbst aufgenommen hast und die keine
          Personen zeigen. Mit dem Hochladen erlaubst du uns, das Foto im
          gemeinsamen Archiv der App zu zeigen. Benutzernamen dürfen nicht
          beleidigend sein und niemanden nachahmen.
        </p>
      </section>
      <section>
        <h2>4. Sperrung</h2>
        <p>
          Wir können Inhalte entfernen und Konten sperren, die gegen diese
          Bedingungen verstoßen oder die App missbrauchen (z. B. durch
          automatisierte Registrierungen).
        </p>
      </section>
      <section>
        <h2>5. Konto beenden</h2>
        <p>
          Du kannst dein Konto jederzeit selbst löschen: in der App unter
          „Home“ → „Dein Konto“ → „Konto löschen“. Alternativ schreib uns an
          die im Impressum genannte E-Mail-Adresse.
        </p>
      </section>
    </LegalShell>
  );
}
