/**
 * Angaben des Betreibers für Impressum und Datenschutzerklärung.
 *
 * Die Felder mit OFFEN müssen vor dem öffentlichen Start mit den echten
 * Angaben gefüllt werden – solange eines davon noch OFFEN enthält, zeigen die
 * Rechtsseiten einen deutlichen Hinweis an. Das ist Absicht: Lieber ein
 * sichtbarer Hinweis als ein Impressum mit erfundenen Angaben.
 */

export const OFFEN = "[bitte ergänzen]";

export const OPERATOR: Record<"business" | "name" | "street" | "city" | "email", string> = {
  /** Geschäftsbezeichnung des Gewerbes. */
  business: "Chavaria IT",
  /** Vor- und Nachname des Inhabers (Einzelunternehmen: Pflichtangabe). */
  name: "Stefan Huber",
  /** Straße und Hausnummer – ein Postfach reicht nicht. */
  street: "Auberg 4",
  /** Postleitzahl und Ort. */
  city: "83109 Großkarolinenfeld",
  /** E-Mail-Adresse für Kontakt und Datenschutzanfragen. */
  email: "info@littlefarming.de",
};

/** Kleingewerbe als Einzelunternehmen, Kleinunternehmer nach § 19 UStG. */
export const OPERATOR_FORM = "Einzelunternehmen (Kleingewerbe), nicht im Handelsregister eingetragen";
export const OPERATOR_VAT = "Kleinunternehmer im Sinne von § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen; eine Umsatzsteuer-Identifikationsnummer besteht nicht.";

/**
 * Stand der Texte. Muss zu LEGAL_VERSION im API-Server passen
 * (artifacts/api-server/src/lib/registrationPolicy.ts), denn dieser Wert wird
 * bei jeder Registrierung mit dem Konto gespeichert.
 */
export const LEGAL_VERSION = "2026-10-31";

export function operatorDataIncomplete(): boolean {
  return Object.values(OPERATOR).some((value) => value === OFFEN);
}

/** Pfade der Rechtsseiten, ohne Login erreichbar. */
export const LEGAL_PATHS = {
  impressum: "/impressum",
  datenschutz: "/datenschutz",
  nutzungsbedingungen: "/nutzungsbedingungen",
  agb: "/agb",
  widerruf: "/widerruf",
} as const;

/**
 * AGB and Widerrufsbelehrung for Lite and Premium (docs/rechtstexte.md) are
 * drafts until a lawyer has checked them: while true their pages say so.
 */
export const PAYMENT_TEXTS_DRAFT = true;

/** Absolute URL of a legal page, respecting the app's base path. */
export function legalHref(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}
