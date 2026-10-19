import type { BedType, Crop, CropFeeder as Feeder } from "@workspace/api-client-react";
import { addDays } from "@/lib/garden-calendar";

/**
 * Hochbeet-Begleiter and the autumn of every bed (Beet-Architekt step 6):
 * fixed rules of thumb from the bed's size, age and frost dates – no AI.
 */

export interface Layer {
  name: string;
  hint: string;
  cm: number;
  liters: number;
  /** 40-litre bags to buy, for layers that usually come in bags. */
  bags: number | null;
}

const liters = (lengthCm: number, widthCm: number, cm: number) => Math.round((lengthCm * widthCm * cm) / 1000);

/**
 * The classic layers of a raised bed, bottom to top, for its height (default
 * 80 cm). Bagged layers get 10 % extra because they settle.
 */
export function raisedBedLayers(bed: { lengthCm: number; widthCm: number; heightCm: number | null }): { meshM2: number; layers: Layer[] } {
  const h = Math.max(20, bed.heightCm ?? 80);
  // Soil on top gets at least 15 cm; the rest is shared out by weight.
  const parts: [string, string, number, boolean][] =
    h >= 50
      ? [
          ["Grobes Gehölz", "Äste, Zweige, Strauchschnitt – sorgt für Luft und Abfluss", 7, false],
          ["Laub & Grassoden", "Laub, Grasschnitt, Soden mit der Grasseite nach unten", 4, false],
          ["Grober Kompost oder Mist", "halb verrottet, gibt in den ersten Jahren Wärme und Nährstoffe", 3, true],
          ["Feiner Kompost", "reifer Kompost", 3, true],
        ]
      : [["Grober Kompost", "unten, halb verrottet", 1, true]];
  const top = h >= 50 ? Math.max(15, Math.round(h * 0.2)) : Math.max(10, Math.round(h * 0.6));
  const weight = parts.reduce((sum, part) => sum + part[2], 0);
  let rest = h - top;
  const layers: Layer[] = parts.map(([name, hint, w, bagged], i) => {
    const cm = i === parts.length - 1 ? rest : Math.round(((h - top) * w) / weight);
    rest -= cm;
    const l = liters(bed.lengthCm, bed.widthCm, cm);
    return { name, hint, cm, liters: l, bags: bagged ? Math.ceil((l * 1.1) / 40) : null };
  });
  const soil = liters(bed.lengthCm, bed.widthCm, top);
  layers.push({ name: "Pflanzerde", hint: "Hochbeet- oder Gartenerde, oben mindestens 15 cm", cm: top, liters: soil, bags: Math.ceil((soil * 1.1) / 40) });
  const meshM2 = Math.round(((bed.lengthCm + 20) * (bed.widthCm + 20)) / 1000) / 10;
  return { meshM2, layers };
}

/** Compost to top up after the season: the filling sinks about 10 cm a year. */
export function refillLiters(bed: { lengthCm: number; widthCm: number }): number {
  return liters(bed.lengthCm, bed.widthCm, 10);
}

/** 1 in the year it was filled. */
export function raisedBedYear(builtYear: number | null, season: number): number | null {
  return builtYear === null || season < builtYear ? null : season - builtYear + 1;
}

/** What a raised bed feeds best in its n-th year (null: time to rebuild). */
export function recommendedFeeder(year: number): Feeder | null {
  if (year <= 2) return "heavy";
  if (year === 3) return "medium";
  if (year === 4) return "light";
  return null;
}

const FEEDER_RANK: Record<Feeder, number> = { light: 0, medium: 1, heavy: 2 };

/** Plantings that want more than the bed gives in this year. */
export function tooHungry(plantings: { label: string; cropKey: string | null }[], crops: Map<string, Crop>, year: number): string[] {
  const allowed = recommendedFeeder(year);
  if (!allowed) return [];
  return [
    ...new Set(
      plantings.flatMap((p) => {
        const crop = p.cropKey ? crops.get(p.cropKey) : undefined;
        return crop && FEEDER_RANK[crop.feeder] > FEEDER_RANK[allowed] ? [p.label] : [];
      }),
    ),
  ];
}

export interface LateDate {
  crop: Crop;
  kind: "direct_sow" | "plant_out";
  until: string;
}

/**
 * Letzte Pflanztermine: sowing and planting windows that still close this
 * year between mid July and the first autumn frost, latest first to go.
 */
export function lateDates(crops: Crop[], lastFrost: string, firstFrost: string, season: number, today: string, max = 8): LateDate[] {
  const base = `${season}-${lastFrost}`;
  const frost = `${season}-${firstFrost}`;
  const from = `${season}-07-15`;
  const out: LateDate[] = [];
  for (const crop of crops) {
    for (const kind of ["direct_sow", "plant_out"] as const) {
      const range = kind === "direct_sow" ? crop.directSow : crop.plantOut;
      if (!range) continue;
      const until = addDays(base, range.to * 7 + 6);
      if (until >= from && until <= frost && until >= today) out.push({ crop, kind, until });
    }
  }
  return out.sort((a, b) => a.until.localeCompare(b.until) || a.crop.name.localeCompare(b.crop.name)).slice(0, max);
}

/** How long the harvest goes on with protection, after the first frost. */
export function seasonExtension(type: BedType, firstFrost: string, season: number): { label: string; until: string }[] {
  const frost = `${season}-${firstFrost}`;
  const warm = type === "raised" ? 7 : 0;
  const rows = [
    { label: "Ohne Schutz", until: frost },
    { label: "Mit Vlies oder Abdeckung", until: addDays(frost, 14 + warm) },
  ];
  if (type === "coldframe") rows.push({ label: "Im Frühbeet, Fenster zu", until: addDays(frost, 28) });
  if (type === "greenhouse") rows.push({ label: "Im Gewächshaus", until: addDays(frost, 42) });
  return rows;
}
