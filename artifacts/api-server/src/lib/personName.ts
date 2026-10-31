/**
 * Vor- und Nachname (docs/konto.md): the user changes them in "Dein Konto",
 * e.g. after a wedding. They show wherever others see the account – team,
 * shared lists ("von …"), tasks. Empty means "not given" (null).
 */

export const MAX_NAME_LENGTH = 50;

// Letters of any language, marks (accents), spaces, hyphen, apostrophe, dot.
// Must start with a letter, so " - " or "..." is not a name.
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u;

export type NameResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Checks one name field; `label` is "Vorname" or "Nachname" for the message. */
export function parsePersonName(input: unknown, label: string): NameResult {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, error: `${label}: bitte als Text angeben.` };
  const value = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (value === '') return { ok: true, value: null };
  if (value.length > MAX_NAME_LENGTH) return { ok: false, error: `${label}: höchstens ${MAX_NAME_LENGTH} Zeichen.` };
  if (!NAME_RE.test(value)) {
    return { ok: false, error: `${label}: nur Buchstaben, Leerzeichen, Bindestrich und Apostroph.` };
  }
  return { ok: true, value };
}
