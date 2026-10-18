import type { AnimalSex, FarmSpecies } from "@workspace/api-client-react";

export const SPECIES_LABELS: Record<FarmSpecies, string> = {
  poultry: "Geflügel",
  rabbit: "Kaninchen",
  guineaPig: "Meerschweinchen",
  cat: "Katze",
  horse: "Pferd",
  dog: "Hund",
  goat: "Ziege",
  sheep: "Schaf",
  cattle: "Rind",
  pig: "Schwein",
  other: "Sonstiges",
};

export const SPECIES_ORDER: FarmSpecies[] = [
  "poultry",
  "goat",
  "sheep",
  "cattle",
  "pig",
  "horse",
  "rabbit",
  "guineaPig",
  "dog",
  "cat",
  "other",
];

export const SEX_LABELS: Record<AnimalSex, string> = {
  female: "weiblich",
  male: "männlich",
  neutered: "kastriert",
  unknown: "unbekannt",
};

/**
 * "2 Jahre", "7 Monate", "3 Wochen" – the age on a given day, from a
 * YYYY-MM-DD birth date. Null when there is no birth date.
 */
export function ageText(birthDate: string | null, today: Date = new Date()): string | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
  if (today.getDate() < d) months -= 1;
  if (months >= 24) return `${Math.floor(months / 12)} Jahre`;
  if (months >= 12) return "1 Jahr";
  if (months >= 2) return `${months} Monate`;
  if (months === 1) return "1 Monat";
  const days = Math.floor((today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  const weeks = Math.floor(days / 7);
  if (weeks >= 2) return `${weeks} Wochen`;
  if (weeks === 1) return "1 Woche";
  return days === 1 ? "1 Tag" : `${Math.max(days, 0)} Tage`;
}

/** Today as YYYY-MM-DD in local time (for the max of the date field). */
export function todayIso(today: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
