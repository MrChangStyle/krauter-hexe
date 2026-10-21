import type { FarmContact, FarmContactKind } from "@workspace/api-client-react";

/** Farm & Team – the kinds of contacts, in the order the list shows them. */
export const CONTACT_KINDS: { kind: FarmContactKind; label: string }[] = [
  { kind: "self", label: "Ich / Betriebsleitung" },
  { kind: "team", label: "Team & Mitarbeiter" },
  { kind: "substitute", label: "Vertretung" },
  { kind: "vet", label: "Tierarzt" },
  { kind: "family", label: "Familie & Hof" },
  { kind: "emergency", label: "Notfall" },
  { kind: "authority", label: "Ämter & Behörden" },
  { kind: "supplier", label: "Lieferanten & Dienste" },
  { kind: "other", label: "Sonstige" },
];

export const CONTACT_KIND_LABEL = Object.fromEntries(CONTACT_KINDS.map((k) => [k.kind, k.label])) as Record<FarmContactKind, string>;

/** The contacts by kind, kinds without contacts left out. */
export function groupContacts(contacts: readonly FarmContact[]): { kind: FarmContactKind; label: string; contacts: FarmContact[] }[] {
  return CONTACT_KINDS.map((k) => ({ ...k, contacts: contacts.filter((c) => c.kind === k.kind) })).filter((g) => g.contacts.length > 0);
}

/** "0171 234 56" → "tel:017123456"; keeps a leading +. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
