/**
 * Angaben des Betreibers für Impressum und Datenschutzerklärung.
 *
 * Die Felder mit OFFEN müssen vor dem öffentlichen Start mit den echten
 * Angaben gefüllt werden – solange eines davon noch OFFEN enthält, zeigen die
 * Rechtsseiten einen deutlichen Hinweis an. Das ist Absicht: Lieber ein
 * sichtbarer Hinweis als ein Impressum mit erfundenen Angaben.
 */

export const OFFEN = "[bitte ergänzen]";

export const OPERATOR = {
  /** Vor- und Nachname (bzw. Firma) des Betreibers. */
  name: OFFEN,
  /** Straße und Hausnummer – ein Postfach reicht nicht. */
  street: OFFEN,
  /** Postleitzahl und Ort. */
  city: OFFEN,
  /** E-Mail-Adresse für Kontakt und Datenschutzanfragen. */
  email: OFFEN,
} as const;

/**
 * Stand der Texte. Muss zu LEGAL_VERSION im API-Server passen
 * (artifacts/api-server/src/lib/registrationPolicy.ts), denn dieser Wert wird
 * bei jeder Registrierung mit dem Konto gespeichert.
 */
export const LEGAL_VERSION = "2026-10-18";

export function operatorDataIncomplete(): boolean {
  return Object.values(OPERATOR).some((value) => value === OFFEN);
}

/** Pfade der Rechtsseiten, ohne Login erreichbar. */
export const LEGAL_PATHS = {
  impressum: "/impressum",
  datenschutz: "/datenschutz",
  nutzungsbedingungen: "/nutzungsbedingungen",
} as const;

/** Absolute URL of a legal page, respecting the app's base path. */
export function legalHref(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}
