/**
 * Usernames are public (leaderboard), 1–8 letters A–Z, stored in upper case.
 * This keeps out the obvious: insults, slurs, Nazi references, and names that
 * pretend to speak for the app. It is deliberately short – moderation
 * ("Melden") handles the rest; a long list mostly blocks harmless names.
 *
 * Words are checked as substrings, so only words that do not occur inside
 * common harmless names belong here (e.g. "DICK" is a normal German word and
 * "SIEG" starts "SIEGFRIED" – neither is listed).
 */

const BLOCKED_PARTS = [
  // insults / sexual
  "ARSCH",
  "FICK",
  "FOTZE",
  "HURE",
  "NUTTE",
  "WICHS",
  "SCHLAMPE",
  "SPAST",
  "MISTGEB",
  "FUCK",
  "SHIT",
  "CUNT",
  "BITCH",
  "PORN",
  "PENIS",
  "VAGINA",
  // slurs / extremism
  "NIGGER",
  "NEGER",
  "NAZI",
  "HITLER",
  "HEILH",
  "SIEGHEIL",
  "SSRAHA",
  "KANAK",
];

/** Names that would look like they speak for the app. */
const RESERVED = new Set([
  "ADMIN",
  "ADMINS",
  "OWNER",
  "INHABER",
  "BETREIB",
  "MOD",
  "MODS",
  "MODERATR",
  "SUPPORT",
  "SYSTEM",
  "OFFIZIEL",
  "CLAUDE",
]);

/** True when the (already validated, A–Z) username may be used. */
export function isUsernameAllowed(username: string): boolean {
  const name = username.toUpperCase();
  if (RESERVED.has(name)) return false;
  return !BLOCKED_PARTS.some((part) => name.includes(part));
}
