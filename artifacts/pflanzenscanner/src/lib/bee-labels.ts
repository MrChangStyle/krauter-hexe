import type { BeeColonyStatus, BeeFeedKind, VarroaMethod } from "@workspace/api-client-react";

// Bienen (docs/bienen.md): labels and the beekeeper's small rules.

export const COLONY_STATUS: Record<BeeColonyStatus, string> = {
  active: "Aktiv",
  dissolved: "Aufgelöst / vereinigt",
  lost: "Eingegangen",
  sold: "Abgegeben",
};

export const FEED_KINDS: Record<BeeFeedKind, string> = {
  sirup: "Futtersirup",
  zuckerwasser: "Zuckerwasser",
  futterteig: "Futterteig",
  honig: "Honig",
  sonstiges: "Sonstiges",
};

export const VARROA_METHODS: Record<VarroaMethod, string> = {
  ameisensaeure: "Ameisensäure",
  oxalsaeure: "Oxalsäure",
  milchsaeure: "Milchsäure",
  thymol: "Thymol",
  drohnenbrut: "Drohnenbrut schneiden",
  sonstiges: "Sonstiges",
};

export const TEMPER: Record<number, string> = {
  1: "sehr sanft",
  2: "sanft",
  3: "nervös",
  4: "stechlustig",
};

export const HIVE_TYPES = ["Zander", "Deutsch Normal", "Dadant", "Langstroth", "Segeberger", "Warré", "Top-Bar"];

/** The international colour for marking a queen, by the last digit of her year. */
export function queenColor(year: number): { name: string; className: string } {
  const colors = [
    { name: "blau", className: "bg-blue-500" },
    { name: "weiß", className: "bg-white border border-border" },
    { name: "gelb", className: "bg-yellow-400" },
    { name: "rot", className: "bg-red-500" },
    { name: "grün", className: "bg-green-500" },
  ];
  return colors[((year % 10) + 10) % 5]!;
}
